import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/security/crypto";

// Temporary read-only diagnosis of an existing job. Never creates media/posts.
export async function GET(req: Request) {
  try {
    const ctx = await tenantContext();
    const jobId = new URL(req.url).searchParams.get("jobId");
    const job = await prisma.publishJob.findFirst({
      where: { id: jobId || "", organizationId: ctx.organizationId, platform: "facebook" },
    });
    if (!job?.externalPostId) return NextResponse.json({ error: "Job not found" }, { status: 404 });
    const connection = await prisma.socialConnection.findFirst({
      where: { id: job.socialConnectionId, organizationId: ctx.organizationId },
    });
    if (!connection?.encryptedToken) return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    const stored = JSON.parse(decryptSecret(connection.encryptedToken));
    const pageId = stored.pageId || connection.externalId;
    const token = stored.pageAccessToken;
    if (!token || !pageId) return NextResponse.json({ error: "Credentials missing" }, { status: 409 });
    const read = async (path: string, params: Record<string, string> = {}) => {
      const query = new URLSearchParams(params);
      const response = await fetch(`https://graph.facebook.com/v23.0/${path}?${query}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
      });
      const data = await response.json();
      return { status: response.status, data };
    };
    const post = await read(job.externalPostId, {
      fields: "id,is_published,is_hidden,timeline_visibility,permalink_url,privacy,status_type,from,application,attachments",
    });
    const feed = await read(`${pageId}/feed`, { fields: "id", limit: "100" });
    const published = await read(`${pageId}/published_posts`, { fields: "id", limit: "100" });
    const attachment = post.data?.attachments?.data?.[0];
    const photoId = attachment?.target?.id;
    const photo = photoId ? await read(String(photoId), { fields: "id,page_story_id" }) : null;
    const app = process.env.FACEBOOK_APP_ID ? await read(process.env.FACEBOOK_APP_ID, { fields: "id,name" }) : null;
    return NextResponse.json({
      jobId: job.id, pageId, post,
      feed: { status: feed.status, containsPost: feed.data?.data?.some((p: { id: string }) => p.id === job.externalPostId), error: feed.data?.error },
      published: { status: published.status, containsPost: published.data?.data?.some((p: { id: string }) => p.id === job.externalPostId), error: published.data?.error },
      photo, app,
    }, { headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
  } catch {
    return NextResponse.json({ error: "Inspection failed" }, { status: 400 });
  }
}
