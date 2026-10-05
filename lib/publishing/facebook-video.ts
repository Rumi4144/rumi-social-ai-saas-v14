import { prisma } from "@/lib/prisma";
import { videoBytes } from "@/lib/video/media";
import type { PublishResult } from "./providers";

export function campaignVideoId(mediaUrl?: string | null): string | null {
  if (!mediaUrl) return null;
  const url = new URL(mediaUrl, process.env.NEXT_PUBLIC_APP_URL || "https://rumisocialai.com");
  const app = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://rumisocialai.com");
  return url.origin === app.origin ? /^\/api\/video\/media\/([a-zA-Z0-9_-]+)$/.exec(url.pathname)?.[1] || null : null;
}

export async function publishFacebookVideo(input: { pageId: string; pageAccessToken: string; caption: string; assetId: string; organizationId?: string; contentItemId?: string; publishJobId?: string }): Promise<PublishResult> {
  if (!input.organizationId || !input.contentItemId || !input.publishJobId) return { ok: false, retryable: false, error: "VIDEO_PUBLISH_CONTEXT_MISSING" };
  const asset = await prisma.mediaAsset.findFirst({ where: { id: input.assetId, organizationId: input.organizationId, contentItemId: input.contentItemId, kind: "campaign_video", status: "ready" } });
  if (!asset?.url) return { ok: false, retryable: false, error: "VIDEO_NOT_FOUND" };
  const stateId = `facebook_video_${input.publishJobId}`;
  const existing = await prisma.job.findFirst({ where: { id: stateId, organizationId: input.organizationId, type: "FACEBOOK_VIDEO_PUBLISH" } });
  const prior = existing?.result as { videoId?: string } | null;
  if (existing?.status === "succeeded" && prior?.videoId) return { ok: true, externalId: prior.videoId };
  if (existing) return { ok: false, retryable: false, error: "Video upload needs review before retrying. Check the Facebook Page to avoid posting twice." };
  const clip = await videoBytes(asset);
  if (clip.contentType !== "video/mp4") return { ok: false, retryable: false, error: "Facebook publishing requires an MP4 clip." };
  // Claim before submitting. An interrupted upload must never create a second post.
  try {
    await prisma.job.create({ data: { id: stateId, organizationId: input.organizationId, type: "FACEBOOK_VIDEO_PUBLISH", status: "starting", payload: { assetId: asset.id, publishJobId: input.publishJobId } } });
  } catch { return { ok: false, retryable: false, error: "Video upload already claimed. Check publishing history." }; }
  try {
    const body = new FormData();
    body.append("source", new Blob([new Uint8Array(clip.bytes)], { type: "video/mp4" }), "campaign.mp4");
    body.append("description", input.caption);
    body.append("access_token", input.pageAccessToken);
    const response = await fetch(`https://graph-video.facebook.com/v23.0/${input.pageId}/videos`, { method: "POST", body, signal: AbortSignal.timeout(45000) });
    const data = await response.json();
    if (!response.ok || !data.id) {
      await prisma.job.update({ where: { id: stateId }, data: { status: "failed", error: "Facebook did not confirm the upload." } });
      return { ok: false, retryable: false, code: response.status, error: data.error?.message || "FACEBOOK_VIDEO_UPLOAD_FAILED" };
    }
    const videoId = String(data.id);
    // An accepted upload is successful even if saving its local receipt fails.
    await prisma.job.update({ where: { id: stateId }, data: { status: "succeeded", progress: 100, result: { videoId } } }).catch(() => null);
    return { ok: true, externalId: videoId, code: response.status };
  } catch {
    return { ok: false, retryable: false, error: "Facebook upload was interrupted. Check your Page before retrying to avoid posting twice." };
  }
}
