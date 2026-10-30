import { studioPageContext } from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
import { prisma } from "@/lib/prisma";
import ScheduledWorkspace from "@/components/weekly/ScheduledWorkspace";
import { savedItemMedia } from "@/components/weekly/item-policy";
import type { WeeklyItem } from "@/lib/weekly/types";

export default async function ScheduledPage() {
  const { context: ctx, recovery } = await studioPageContext();
  if (!ctx) return <StudioRecovery recovery={recovery!} />;
  // Include successes when finding the latest per account: an old failure must
  // not return after the same destination was successfully posted.
  const jobs = await prisma.publishJob.findMany({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, distinct: ["contentItemId", "socialConnectionId"], select: { id: true, contentItemId: true, socialConnectionId: true, status: true, platform: true, scheduledFor: true, publishedAt: true, lastError: true } });
  const seen = new Set<string>(), latest = jobs.filter(job => { const key = `${job.contentItemId}:${job.socialConnectionId}`; if (seen.has(key)) return false; seen.add(key); return true; });
  const activeIds = [...new Set(latest.filter(job => job.status !== "published" && job.status !== "cancelled").map(job => job.contentItemId))];
  const [items, connections, assets] = await Promise.all([
    prisma.contentItem.findMany({ where: { id: { in: activeIds }, campaign: { brand: { organizationId: ctx.organizationId } } }, include: { campaign: { select: { brandId: true } } }, orderBy: { scheduledFor: "asc" } }),
    prisma.socialConnection.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, accountName: true } }),
    prisma.mediaAsset.findMany({ where: { contentItemId: { in: activeIds }, organizationId: ctx.organizationId, status: "ready", kind: { in: ["social_creative", "campaign_video"] } }, select: { id: true, metadata: true } }),
  ]);
  const view: WeeklyItem[] = items.map(item => {
    const ref = savedItemMedia(item.mediaUrl), asset = assets.find(asset => asset.id === ref?.id);
    const ready = !!asset && (ref?.kind !== "video" || (asset.metadata as { contentType?: string } | null)?.contentType === "video/mp4");
    const deliveries = latest.filter(job => job.contentItemId === item.id);
    return { id: item.id, campaignId: item.campaignId, brandId: item.campaign.brandId, date: (item.scheduledFor || item.createdAt).toISOString().slice(0, 10), day: 1, type: item.type, kind: item.type === "reel_post" ? "motion_reel" : item.type === "presenter_post" ? "ai_video" : "image", headline: item.headline || "Your post", caption: item.caption || "", status: item.status, isReady: ready, approvalBlockedReason: ready ? null : "The saved media needs Admin attention.", previewUrl: item.mediaUrl, mediaUrl: item.mediaUrl, mediaKind: ref?.kind || null, assetId: asset?.id || null, downloadUrl: ready ? `/api/weekly/items/${item.id}/download` : null, platforms: deliveries.map(job => job.platform), needsAttention: deliveries.some(job => ["failed", "verification_pending"].includes(job.status)), deliveries: deliveries.map(job => ({ id: job.id, connectionId: job.socialConnectionId, platform: job.platform, account: connections.find(connection => connection.id === job.socialConnectionId)?.accountName || job.platform, status: job.status, scheduledFor: job.scheduledFor.toISOString(), publishedAt: job.publishedAt?.toISOString() || null, error: job.lastError })), changeRequest: null, changesRequested: false, nextAction: "delivery_attention" };
  });
  return <ScheduledWorkspace items={view} canManage={ctx.role !== "viewer"} />;
}
