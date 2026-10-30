import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { WEEKLY_CREDIT_COST } from "../billing/packages";
import { reelAssetId } from "../reels/storage";
import type { WeeklyManifest, WeeklyItemMapping } from "./types";
import { reservedDeliveryStatuses } from "../publishing/eligibility";
import { reelPostRevision } from "../reels/post-revision";

export class ReelCompletionError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export type ReelCompletionAction =
  | { action: "reserve"; requestId: string; contentItemId: string; expectedCost: number; consent: boolean }
  | { action: "complete"; reservationId: string; assetId: string }
  | { action: "select-ai"; contentItemId: string; jobId: string; assetId: string }
  | { action: "cancel"; reservationId: string };
type Reservation = { contentItemId: string; campaignId: string; pathname: string; credits: number; requestId: string; revision: string };
const TYPE = "WEEKLY_REEL_COMPLETION";
export async function weeklyReelAction(tx: Prisma.TransactionClient, organizationId: string, input: ReelCompletionAction) {
  // Serialize reservations/refunds against both the balance and other weekly work.
  await tx.$queryRaw`SELECT id FROM "Subscription" WHERE "organizationId" = ${organizationId} FOR UPDATE`;
  if (input.action === "select-ai") {
    const item = await tx.contentItem.findFirst({ where: { id: input.contentItemId, campaign: { brand: { organizationId } } } });
    if (!item) throw new ReelCompletionError("Post not found in this workspace.", 404);
    const pack = await tx.job.findFirst({ where: { organizationId, type: "WEEKLY_PACK", payload: { path: ["campaignId"], equals: item.campaignId } } });
    const manifest = pack?.payload as unknown as WeeklyManifest | undefined;
    const mapping = (pack?.result as { items?: WeeklyItemMapping[] } | null)?.items?.find(entry => entry.contentItemId === item.id);
    if (!mapping || manifest?.slots.find(slot => slot.key === mapping.slotKey)?.kind !== "ai_video") throw new ReelCompletionError("This is not a weekly AI-video post.", 400);
    const job = await tx.job.findFirst({ where: { id: input.jobId, organizationId, type: "PRODUCT_REEL" } });
    const plan = job?.payload as { contentItemId?: string; campaignId?: string; postRevision?: string } | null;
    const result = job?.result as { sceneIds?: string[]; selectedAssetId?: string; selectedRevision?: string } | null;
    if (plan?.contentItemId !== item.id || plan.campaignId !== item.campaignId || result?.sceneIds?.length !== 3) throw new ReelCompletionError("This AI reel does not belong to this post.", 400);
    const children = await tx.job.findMany({ where: { id: { in: result.sceneIds }, organizationId, type: "RUNWAY_VIDEO", status: "succeeded" } });
    const paid = await tx.creditLedger.findFirst({ where: { organizationId, referenceId: input.jobId, reason: "product_reel", delta: -WEEKLY_CREDIT_COST.aiVideoCompletion } });
    if (children.length !== 3 || !paid) throw new ReelCompletionError("Finish the three AI scenes before saving this reel.");
    const pathname = `reels/${organizationId}/${item.id}/${input.jobId}.mp4`;
    const asset = await tx.mediaAsset.findFirst({ where: { id: input.assetId, organizationId, campaignId: item.campaignId, contentItemId: item.id, provider: "reel-editor", kind: "campaign_video", status: "ready" } });
    const metadata = asset?.metadata as { pathname?: string; contentType?: string } | null;
    if (!asset?.url || asset.id !== reelAssetId(pathname) || metadata?.pathname !== pathname || metadata.contentType !== "video/mp4") throw new ReelCompletionError("Wait for this AI reel’s MP4 upload to finish.", 400);
    if (result.selectedAssetId) {
      if (result.selectedAssetId === asset.id && item.mediaUrl === `/api/video/media/${asset.id}` && (!result.selectedRevision || result.selectedRevision === reelPostRevision(item))) return { assetId: asset.id, status: "completed", alreadyCompleted: true };
      throw new ReelCompletionError("This post has changed. Admin needs to prepare a revised AI video before it can be selected.");
    }
    if (plan.postRevision && plan.postRevision !== reelPostRevision(item)) throw new ReelCompletionError("This post has changed. Admin needs to prepare a revised AI video before it can be selected.");
    const active = await tx.publishJob.findFirst({ where: { contentItemId: item.id, status: { in: reservedDeliveryStatuses } } });
    if (active || ["scheduled", "published"].includes(item.status)) throw new ReelCompletionError("This post is already scheduled or published.");
    await tx.contentItem.update({ where: { id: item.id }, data: { mediaUrl: `/api/video/media/${asset.id}`, status: "draft" } });
    await tx.job.update({ where: { id: input.jobId }, data: { result: { ...result, selectedAssetId: asset.id, selectedRevision: reelPostRevision({ ...item, mediaUrl: `/api/video/media/${asset.id}` }) } } });
    return { assetId: asset.id, status: "completed", alreadyCompleted: false };
  }
  if (input.action === "reserve") {
    if (!input.consent || input.expectedCost !== WEEKLY_CREDIT_COST.motionReelCompletion) throw new ReelCompletionError("Review the four-credit reel estimate before continuing.", 400);
    const item = await tx.contentItem.findFirst({ where: { id: input.contentItemId, campaign: { brand: { organizationId } } } });
    if (!item) throw new ReelCompletionError("Post not found in this workspace.", 404);
    const pack = await tx.job.findFirst({ where: { organizationId, type: "WEEKLY_PACK", payload: { path: ["campaignId"], equals: item.campaignId } } });
    const manifest = pack?.payload as unknown as WeeklyManifest | undefined;
    const mappings = (pack?.result as { items?: WeeklyItemMapping[] } | null)?.items;
    const mapping = mappings?.find(entry => entry.contentItemId === item.id);
    if (!mapping || manifest?.slots.find(slot => slot.key === mapping.slotKey)?.kind !== "motion_reel") throw new ReelCompletionError("This post is not a weekly photo-motion reel.", 400);
    const previous = await tx.job.findFirst({ where: { organizationId, type: TYPE, status: { in: ["reserved", "completed"] }, payload: { path: ["contentItemId"], equals: item.id } }, orderBy: { createdAt: "desc" } });
    if (previous) {
      if (previous.status === "reserved") {
        if ((previous.payload as unknown as Reservation).revision !== reelPostRevision(item)) return resetReservation(tx, organizationId, previous);
        return reservationResponse(previous);
      }
      if (completedMatches(previous, item)) return reservationResponse(previous);
      if ((previous.payload as unknown as Reservation).requestId === input.requestId) return restartResponse();
    }
    const active = await tx.publishJob.findFirst({ where: { contentItemId: item.id, status: { in: reservedDeliveryStatuses } } });
    if (active || ["scheduled", "published"].includes(item.status)) throw new ReelCompletionError("This post is already scheduled or published.");
    const id = `weekly_reel_${createHash("sha256").update(`${organizationId}:${item.id}:${input.requestId}`).digest("hex").slice(0, 40)}`;
    if (await tx.job.findUnique({ where: { id } })) return restartResponse();
    const credits = WEEKLY_CREDIT_COST.motionReelCompletion;
    const charged = await tx.subscription.updateMany({ where: { organizationId, credits: { gte: credits }, status: { in: ["active", "trialing"] } }, data: { credits: { decrement: credits } } });
    if (charged.count !== 1) throw new ReelCompletionError("An active plan and four available credits are needed to finish this reel.", 402);
    const sub = await tx.subscription.findUniqueOrThrow({ where: { organizationId } });
    const payload: Reservation = { contentItemId: item.id, campaignId: item.campaignId, pathname: `reels/${organizationId}/${item.id}/${input.requestId}.mp4`, credits, requestId: input.requestId, revision: reelPostRevision(item) };
    const job = await tx.job.create({ data: { id, organizationId, type: TYPE, status: "reserved", payload } });
    await tx.creditLedger.create({ data: { organizationId, delta: -credits, balanceAfter: sub.credits, reason: "weekly_motion_reel", referenceId: id } });
    return reservationResponse(job);
  }
  const job = await tx.job.findFirst({ where: { id: input.reservationId, organizationId, type: TYPE } });
  if (!job) throw new ReelCompletionError("Reel attempt not found in this workspace.", 404);
  const data = job.payload as unknown as Reservation;
  if (job.status === "completed") {
    if (input.action === "cancel") return reservationResponse(job);
    const item = await tx.contentItem.findFirst({ where: { id: data.contentItemId, campaignId: data.campaignId, campaign: { brand: { organizationId } } } });
    return item && completedMatches(job, item) ? reservationResponse(job) : restartResponse();
  }
  if (input.action === "cancel") {
    if (job.status === "canceled") return { reservationId: job.id, status: "canceled", refunded: false };
    if (job.status !== "reserved") throw new ReelCompletionError("This reel attempt cannot be canceled.");
    await refundReservation(tx, organizationId, job);
    return { reservationId: job.id, status: "canceled", refunded: true };
  }
  if (job.status !== "reserved") throw new ReelCompletionError("This reel attempt is no longer active.");
  const item = await tx.contentItem.findFirst({ where: { id: data.contentItemId, campaignId: data.campaignId, campaign: { brand: { organizationId } } } });
  if (!item) throw new ReelCompletionError("Post not found.", 404);
  if (data.revision !== reelPostRevision(item)) return resetReservation(tx, organizationId, job);
  const asset = await tx.mediaAsset.findFirst({ where: { id: input.assetId, organizationId, campaignId: data.campaignId, contentItemId: item.id, provider: "reel-editor", kind: "campaign_video", status: "ready" } });
  const metadata = asset?.metadata as { contentType?: string; pathname?: string } | null;
  if (!asset?.url || asset.id !== reelAssetId(data.pathname) || metadata?.pathname !== data.pathname || metadata.contentType !== "video/mp4") throw new ReelCompletionError("Wait for this reel’s MP4 upload to finish before completing it.", 400);
  const active = await tx.publishJob.findFirst({ where: { contentItemId: item.id, status: { in: reservedDeliveryStatuses } } });
  if (active || ["scheduled", "published"].includes(item.status)) throw new ReelCompletionError("This post is already scheduled or published.");
  // Saving a finished file never implies approval or publication.
  await tx.contentItem.update({ where: { id: item.id }, data: { mediaUrl: `/api/video/media/${asset.id}`, status: "draft" } });
  const completed = await tx.job.update({ where: { id: job.id }, data: { status: "completed", progress: 100, result: { assetId: asset.id, selectedRevision: reelPostRevision({ ...item, mediaUrl: `/api/video/media/${asset.id}` }) } } });
  return reservationResponse(completed);
}
function completedMatches(job: { result: unknown }, item: { headline?: string | null; caption?: string | null; mediaUrl?: string | null }) {
  const result = job.result as { assetId?: string; selectedRevision?: string } | null;
  return !!result?.assetId && item.mediaUrl === `/api/video/media/${result.assetId}` && (!result.selectedRevision || result.selectedRevision === reelPostRevision(item));
}
function restartResponse() {
  return { restart: true as const, error: "This post changed or its earlier attempt ended. Start again to prepare the current version." };
}
async function refundReservation(tx: Prisma.TransactionClient, organizationId: string, job: { id: string; payload: unknown }) {
  const data = job.payload as Reservation;
  await tx.job.update({ where: { id: job.id }, data: { status: "canceled" } });
  const sub = await tx.subscription.update({ where: { organizationId }, data: { credits: { increment: data.credits } } });
  await tx.creditLedger.create({ data: { organizationId, delta: data.credits, balanceAfter: sub.credits, reason: "weekly_motion_reel_refund", referenceId: job.id } });
}
async function resetReservation(tx: Prisma.TransactionClient, organizationId: string, job: { id: string; payload: unknown }) {
  await refundReservation(tx, organizationId, job);
  // Return normally so the refund commits before the route sends HTTP 409.
  return { ...restartResponse(), refunded: true };
}
function reservationResponse(job: { id: string; status: string; payload: unknown; result: unknown }) {
  const data = job.payload as Reservation, result = job.result as { assetId?: string } | null;
  return { reservationId: job.id, status: job.status, pathname: data.pathname, alreadyCompleted: job.status === "completed", assetId: result?.assetId || null };
}
