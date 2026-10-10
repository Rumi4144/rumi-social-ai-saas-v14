import { prisma } from "@/lib/prisma";
import { videoBytes } from "@/lib/video/media";
import { youtubeAccessToken, youtubeUploadUrl } from "./youtube";
import type { PublishResult } from "./providers";
export type YouTubeCampaignOptions = { certified: true; privacy?: "public" | "unlisted" | "private"; madeForKids: boolean; containsSyntheticMedia: boolean };
export async function publishYouTubeCampaign(input: { assetId: string; organizationId?: string; contentItemId?: string; publishJobId?: string; externalAccountId: string; caption: string }): Promise<PublishResult> {
  const fail = (error: string): PublishResult => ({ ok: false, retryable: false, error });
  if (!input.organizationId || !input.contentItemId || !input.publishJobId) return fail("YouTube campaign context is missing.");
  const settings = await prisma.job.findFirst({ where: { id: `youtube_settings_${input.publishJobId}`, organizationId: input.organizationId, type: "YOUTUBE_CAMPAIGN_SETTINGS" } });
  const options = settings?.payload as YouTubeCampaignOptions | undefined;
  if (!options?.certified || typeof options.madeForKids !== "boolean" || typeof options.containsSyntheticMedia !== "boolean") return fail("Confirm YouTube audience and disclosure settings before publishing.");
  const privacy = options.privacy ?? "private";
  if (!["public", "unlisted", "private"].includes(privacy)) return fail("Choose a valid YouTube visibility.");
  const asset = await prisma.mediaAsset.findFirst({ where: { id: input.assetId, organizationId: input.organizationId, contentItemId: input.contentItemId, kind: "campaign_video", status: "ready" } });
  const connection = await prisma.socialConnection.findFirst({ where: { id: (settings!.payload as YouTubeCampaignOptions & { connectionId: string }).connectionId, organizationId: input.organizationId, provider: "youtube", status: "connected", externalId: input.externalAccountId } });
  if (!asset || !connection) return fail("The selected video or YouTube connection is no longer available.");
  const receiptId = `youtube_campaign_${input.contentItemId}_${connection.id}_${asset.id}`;
  const receipt = await prisma.job.findFirst({ where: { id: receiptId, organizationId: input.organizationId, type: "YOUTUBE_UPLOAD" } });
  const prior = receipt?.result as { videoId?: string } | null;
  if (receipt?.status === "succeeded" && prior?.videoId) return { ok: true, externalId: prior.videoId };
  if (receipt) return fail("This YouTube upload needs review before retrying. Check YouTube Studio to avoid a duplicate.");
  const clip = await videoBytes(asset);
  if (!["video/mp4", "video/webm"].includes(clip.contentType) || !clip.bytes.length) return fail("Choose a valid MP4 or WebM campaign video.");
  const token = await youtubeAccessToken(connection);
  const identity = await fetch("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
  const account = await identity.json();
  if (!identity.ok || !account.items?.some((channel: { id: string }) => channel.id === connection.externalId)) return fail("YouTube channel changed. Reconnect it in Settings.");
  const item = await prisma.contentItem.findFirst({ where: { id: input.contentItemId, campaign: { brand: { organizationId: input.organizationId } } }, select: { headline: true } });
  if (!item) return fail("Campaign post not found.");
  const title = (item.headline || input.caption || "Campaign video").replace(/[<>]/g, "").slice(0,100).trim() || "Campaign video";
  try { await prisma.job.create({ data: { id: receiptId, organizationId: input.organizationId, type: "YOUTUBE_UPLOAD", status: "starting", payload: { connectionId: connection.id, channelId: connection.externalId, contentItemId: input.contentItemId, title, ...options, privacy } } }); }
  catch { return fail("YouTube upload already claimed. Check publishing history."); }
  try {
    const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=false", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Upload-Content-Length": String(clip.bytes.length), "X-Upload-Content-Type": clip.contentType }, body: JSON.stringify({ snippet: { title, description: input.caption.replace(/[<>]/g, "").slice(0,5000) }, status: { privacyStatus: privacy, selfDeclaredMadeForKids: options.madeForKids, containsSyntheticMedia: options.containsSyntheticMedia } }), signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!start.ok) throw new Error("YouTube could not start the campaign upload.");
    const url = youtubeUploadUrl(start.headers.get("location") || "");
    const response = await fetch(url, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": clip.contentType, "Content-Range": `bytes 0-${clip.bytes.length-1}/${clip.bytes.length}` }, body: new Uint8Array(clip.bytes), redirect: "manual", signal: AbortSignal.timeout(25000) });
    const result = await response.json();
    if (!response.ok || !result.id || result.snippet?.channelId !== connection.externalId) throw new Error("YouTube did not confirm the campaign upload.");
    const videoId = String(result.id);
    await prisma.job.update({ where: { id: receiptId }, data: { status: "succeeded", progress: 100, result: { videoId, privacy: result.status?.privacyStatus || privacy }, error: null } });
    return { ok: true, externalId: videoId };
  } catch {
    await prisma.job.update({ where: { id: receiptId }, data: { status: "uncertain", error: "Upload not confirmed. Check YouTube Studio before attempting another upload." } }).catch(()=>null);
    return fail("YouTube upload not confirmed. Check YouTube Studio before retrying to avoid a duplicate.");
  }
}
