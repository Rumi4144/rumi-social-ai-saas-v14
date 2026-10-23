import { createHash } from "node:crypto";
import type { Job } from "@prisma/client";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { fetchPublicBytes } from "@/lib/reels/public-fetch";
import { labModels, type LabInput } from "./catalog";
import { labPoll } from "./providers";
import { assertMp4Video, mp4Duration } from "@/lib/video/mp4";

export type LabPayload = LabInput & { estimateUsd: number; taskId?: string; pollingUrl?: string };
export function labJobId(org: string, requestId: string) {
  return `lab-${createHash("sha256").update(JSON.stringify([org, requestId])).digest("hex").slice(0,40)}`;
}
export function labSummary(job: Job) {
  const payload = job.payload as unknown as LabPayload;
  const detached = (job.result as {campaignAttached?:boolean}|null)?.campaignAttached === false;
  return { id: job.id, status: job.status, model: payload.model, prompt: payload.prompt, kind: labModels[payload.model].kind,
    estimateUsd: payload.estimateUsd, error: job.error, createdAt: job.createdAt,
    voiceId: payload.voiceId, voiceAccent: payload.voiceAccent ?? "original", accentSpeaker: payload.accentSpeaker || null, voiceEmotion: payload.voiceEmotion ?? "neutral", voiceSpeed: payload.voiceSpeed ?? 1,
    imageAssetId: payload.model === "holding" && job.status === "succeeded" ? job.id : null,
    audioAssetId: payload.model === "speech" && job.status === "succeeded" ? job.id : null,
    campaignId: detached ? undefined : payload.campaignId, contentItemId: detached ? undefined : payload.contentItemId,
    url: job.status === "succeeded" ? `/api/ai-lab/file?jobId=${job.id}` : null };
}
export async function labRefresh(job: Job) {
  const payload = job.payload as unknown as LabPayload;
  if (!payload.taskId || !["running", "saving"].includes(job.status)) return job;
  const claimed = await prisma.job.updateMany({ where: { id: job.id, organizationId: job.organizationId, status: { in: ["running", "saving"] }, updatedAt: { lt: new Date(Date.now() - 10000) } }, data: { updatedAt: new Date() } });
  if (!claimed.count) return job;
  try {
    const result = await labPoll(payload.model, { taskId: payload.taskId, pollingUrl: payload.pollingUrl });
    if (result.status === "failed") {
      await prisma.job.update({ where: { id: job.id }, data: { status: "failed", error: "The provider could not finish this sample. Check provider billing before trying a new test." } });
    } else if (result.status === "ready" && result.url) {
      await prisma.job.update({ where: { id: job.id }, data: { status: "saving", progress: 95 } });
      const image = labModels[payload.model].kind === "image";
      const audio = payload.model === "speech";
      const { bytes, contentType } = await fetchPublicBytes(result.url, audio ? 10_000_000 : image ? 20_000_000 : 100_000_000);
      if (!(audio ? /^audio\/(mpeg|mp3)/ : image ? /^image\/(png|jpeg|webp)/ : /^video\/mp4/).test(contentType)) throw new Error("Unexpected output format.");
      const ext = audio ? "mp3" : image ? (contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg") : "mp4";
      const pathname = `ai-lab/${job.organizationId}/${job.id}.${ext}`;
      if (!image && !audio) assertMp4Video(bytes);
      await put(pathname, bytes, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: true, abortSignal: AbortSignal.timeout(30000) });
      if (audio) await prisma.mediaAsset.upsert({ where: { id: job.id }, update: {}, create: {
        id: job.id, organizationId: job.organizationId, kind: "ai_lab_input", provider: "wavespeed", status: "ready", url: result.url,
        metadata: { kind: "audio", contentType, voiceId: payload.voiceId!, voiceAccent: payload.voiceAccent ?? "original", accentSpeaker: payload.accentSpeaker || null, voiceEmotion: payload.voiceEmotion ?? "neutral", voiceSpeed: payload.voiceSpeed ?? 1, source: "generated_speech" },
      } });
      if (payload.model === "holding") await prisma.mediaAsset.upsert({ where: { id: job.id }, update: {}, create: {
        id: job.id, organizationId: job.organizationId, kind: "ai_lab_input", provider: "wavespeed", status: "ready", url: result.url,
        metadata: { kind: "image", contentType, source: "generated_holding", filename: "Prepared product presenter" },
      } });
      let attachmentError: string | null = null;
      if (!audio && payload.model !== "holding" && payload.campaignId && payload.contentItemId) {
        const post = await prisma.contentItem.findFirst({ where: { id: payload.contentItemId, campaignId: payload.campaignId, campaign: { brand: { organizationId: job.organizationId } } }, select: { id: true } });
        if (!post) attachmentError = "Your sample is saved and can be downloaded. Its campaign post was removed, so it was not attached to a post.";
        else await prisma.mediaAsset.upsert({ where: { id: job.id }, update: {}, create: {
          id: job.id, organizationId: job.organizationId, campaignId: payload.campaignId, contentItemId: payload.contentItemId,
          kind: image ? "ai_image" : "campaign_video", provider: image ? "bfl" : "wavespeed", status: "ready",
          url: image ? `data:${contentType};base64,${bytes.toString("base64")}` : `/api/video/media/${job.id}`, prompt: payload.prompt,
          metadata: { pathname, contentType, model: labModels[payload.model].model, label: image ? "Generated photo" : "Presenter ad", publishMode: "review", requiresProductReview: true, ...(!image && mp4Duration(bytes) ? {duration:mp4Duration(bytes)} : {}) },
        } });
      }
      await prisma.job.update({ where: { id: job.id }, data: { status: "succeeded", progress: 100, error: attachmentError, result: { pathname, contentType, campaignAttached: !attachmentError } } });
    } else {
      await prisma.job.update({ where: { id: job.id }, data: { error: null } });
    }
  } catch {
    await prisma.job.updateMany({ where: { id: job.id, status: { in: ["running", "saving"] } }, data: { error: "Checking or saving is delayed. Check again to recover the same sample without generating another." } });
  }
  return prisma.job.findUniqueOrThrow({ where: { id: job.id } });
}
