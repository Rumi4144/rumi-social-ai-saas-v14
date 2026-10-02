import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { youtubeAccessToken, youtubeNextOffset, youtubeUploadUrl, YOUTUBE_CHUNK_SIZE, YOUTUBE_MAX_SIZE } from "@/lib/publishing/youtube";

export const maxDuration = 60;
const schema = z.object({
  uploadId: z.string().uuid(), title: z.string().trim().min(1).max(100).refine(v => !/[<>]/.test(v)),
  description: z.string().max(5000).refine(v => !/[<>]/.test(v)),
  privacy: z.enum(["private", "unlisted", "public"]), madeForKids: z.boolean(), containsSyntheticMedia: z.boolean(),
  size: z.number().int().positive().max(YOUTUBE_MAX_SIZE), mimeType: z.string().regex(/^video\/[a-zA-Z0-9.+-]+$/),
});
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return reply({ error: "Check the video, title and description. Videos must be at most 2 GB." }, 400);
    const input = parsed.data;
    const existing = await prisma.job.findFirst({ where: { id: input.uploadId, organizationId: ctx.organizationId, type: "YOUTUBE_UPLOAD" } });
    if (existing) return reply({ uploadId: existing.id, status: existing.status, result: existing.result, chunkSize: YOUTUBE_CHUNK_SIZE });
    const connection = await prisma.socialConnection.findFirst({ where: { organizationId: ctx.organizationId, provider: "youtube", status: "connected" } });
    if (!connection?.externalId) return reply({ error: "Connect YouTube in Settings first." }, 409);
    const token = await youtubeAccessToken(connection);
    const identity = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(20000) });
    const identityData = await identity.json();
    if (!identity.ok || !identityData.items?.some((c: { id: string }) => c.id === connection.externalId)) return reply({ error: "The YouTube channel changed. Reconnect it in Settings." }, 409);
    // Claim the client-generated ID before initiating an upload: repeated clicks cannot insert two videos.
    await prisma.job.create({ data: { id: input.uploadId, organizationId: ctx.organizationId, type: "YOUTUBE_UPLOAD", status: "starting", payload: { ...input, connectionId: connection.id, channelId: connection.externalId } } });
    const response = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=false", {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(input.size), "X-Upload-Content-Type": input.mimeType },
      body: JSON.stringify({ snippet: { title: input.title, description: input.description }, status: { privacyStatus: input.privacy, selfDeclaredMadeForKids: input.madeForKids, containsSyntheticMedia: input.containsSyntheticMedia } }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      await prisma.job.update({ where: { id: input.uploadId }, data: { status: "failed", error: data?.error?.message || "YouTube could not start the upload." } });
      return reply({ error: data?.error?.message || "YouTube could not start the upload." }, 502);
    }
    const uploadUrl = youtubeUploadUrl(response.headers.get("location") || "");
    await prisma.job.update({ where: { id: input.uploadId }, data: { status: "uploading", payload: { ...input, connectionId: connection.id, channelId: connection.externalId, session: encryptSecret(uploadUrl) } } });
    console.log("YOUTUBE_UPLOAD_STARTED", JSON.stringify({ uploadId: input.uploadId, channelId: connection.externalId, privacy: input.privacy }));
    return reply({ uploadId: input.uploadId, status: "uploading", chunkSize: YOUTUBE_CHUNK_SIZE });
  } catch {
    return reply({ error: "Could not start YouTube upload. Retry to check the same upload." }, 503);
  }
}

export async function PUT(req: Request) {
  try {
    const ctx = await tenantContext();
    const url = new URL(req.url);
    const job = await prisma.job.findFirst({ where: { id: url.searchParams.get("uploadId") || "", organizationId: ctx.organizationId, type: "YOUTUBE_UPLOAD" } });
    if (!job) return reply({ error: "Upload not found." }, 404);
    if (job.status === "succeeded") return reply({ done: true, ...job.result as object });
    if (job.status !== "uploading") return reply({ error: job.error || "Upload was not started. Choose the video again to start a new upload." }, 409);
    const payload = job.payload as { size: number; mimeType: string; session: string; channelId: string; connectionId: string };
    const connection = await prisma.socialConnection.findFirst({ where: { id: payload.connectionId, organizationId: ctx.organizationId, provider: "youtube", status: "connected", externalId: payload.channelId } });
    if (!connection) return reply({ error: "The YouTube connection changed. Start a new upload." }, 409);
    const token = await youtubeAccessToken(connection);
    const uploadUrl = youtubeUploadUrl(decryptSecret(payload.session));
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": payload.mimeType };
    const finish = async (response: Response) => {
      const data = await response.json();
      if (!response.ok || !data.id || data.snippet?.channelId !== payload.channelId) return reply({ error: data?.error?.message || "YouTube could not confirm this upload." }, 502);
      const result = { videoId: String(data.id), privacy: data.status?.privacyStatus || "private", processingStatus: data.status?.uploadStatus || "uploaded" };
      await prisma.job.update({ where: { id: job.id }, data: { status: "succeeded", progress: 100, result, error: null } });
      console.log("YOUTUBE_UPLOAD_COMPLETE", JSON.stringify({ uploadId: job.id, channelId: payload.channelId, ...result }));
      return reply({ done: true, ...result });
    };
    // Query the same session before every chunk. A lost final response must not trigger a second upload.
    const status = await fetch(uploadUrl, { method: "PUT", headers: { ...headers, "Content-Range": `bytes */${payload.size}` }, body: new Uint8Array(), cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(20000) });
    if (status.ok) return finish(status);
    if (status.status !== 308) return reply({ error: status.status === 404 ? "The upload session expired. Select the video again." : "YouTube could not check upload progress. Resume this upload." }, 502);
    const offset = youtubeNextOffset(status.headers.get("range"), payload.size);
    if (url.searchParams.get("check") === "true") return reply({ done: false, nextOffset: offset });
    const start = Number(url.searchParams.get("offset"));
    if (!Number.isSafeInteger(start) || start < 0) return reply({ error: "Invalid video offset." }, 400);
    if (start !== offset) return reply({ done: false, nextOffset: offset });
    const declaredSize = Number(req.headers.get("content-length"));
    if (declaredSize > YOUTUBE_CHUNK_SIZE) return reply({ error: "Video chunk is too large." }, 413);
    const bytes = new Uint8Array(await req.arrayBuffer());
    const expected = Math.min(YOUTUBE_CHUNK_SIZE, payload.size - offset);
    if (bytes.length !== expected) return reply({ error: "Invalid video chunk size." }, 400);
    const response = await fetch(uploadUrl, { method: "PUT", headers: { ...headers, "Content-Range": `bytes ${offset}-${offset + bytes.length - 1}/${payload.size}` }, body: bytes, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(25000) });
    if (response.status === 308) {
      const nextOffset = youtubeNextOffset(response.headers.get("range"), payload.size);
      await prisma.job.update({ where: { id: job.id }, data: { progress: Math.floor(nextOffset / payload.size * 100) } });
      return reply({ done: false, nextOffset });
    }
    return finish(response);
  } catch {
    return reply({ error: "Upload interrupted. Click Resume upload to continue the same video." }, 503);
  }
}
