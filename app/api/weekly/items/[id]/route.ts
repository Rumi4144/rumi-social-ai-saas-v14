import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { requiresVideo } from "@/lib/campaign/content-plan";
import { lockedDeliveryStatuses, savedItemMedia } from "@/components/weekly/item-policy";

const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), headline: z.string().nullable(), caption: z.string().nullable(), mediaUrl: z.string().nullable() }),
  z.object({ action: z.literal("request_changes"), comment: z.string().trim().min(3).max(2000) }),
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer") return NextResponse.json({ error: "Your access is read-only. Ask your workspace owner to approve or request changes." }, { status: 403 });
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Review this post or describe the changes you need." }, { status: 400 });
    const { id } = await params;
    const action = parsed.data;
    const result = await prisma.$transaction(async tx => {
      const item = await tx.contentItem.findFirst({ where: { id, campaign: { brand: { organizationId: ctx.organizationId } } } });
      if (!item) return { status: 404, error: "Post not found in this workspace." };
      const delivery = await tx.publishJob.findFirst({ where: { contentItemId: id, organizationId: ctx.organizationId, status: { in: lockedDeliveryStatuses } } });
      if (delivery || ["scheduled", "published"].includes(item.status)) return { status: 409, error: "This post is already scheduled or posted. Its saved version cannot be changed." };
      if (action.action === "approve") {
        if ((item.headline || "") !== (action.headline || "") || (item.caption || "") !== (action.caption || "") || item.mediaUrl !== action.mediaUrl) return { status: 409, error: "This post changed. Refresh and review its latest version before approving." };
        if (!item.headline?.trim()) return { status: 409, error: "This post needs a headline before approval. Request a change below." };
        const reference = savedItemMedia(item.mediaUrl);
        if (!reference || (requiresVideo(item.type) && reference.kind !== "video")) return { status: 409, error: requiresVideo(item.type) ? "Finish the video before approving this post." : "This post needs its finished image before approval." };
        const asset = await tx.mediaAsset.findFirst({ where: { id: reference.id, organizationId: ctx.organizationId, contentItemId: id, campaignId: item.campaignId, status: "ready", kind: reference.kind === "video" ? "campaign_video" : "social_creative" } });
        if (!asset?.url || (reference.kind === "video" && (asset.metadata as { contentType?: string } | null)?.contentType !== "video/mp4")) return { status: 409, error: "The finished media is unavailable. Ask Admin to finish this post before approval." };
        const pending = await tx.job.findFirst({ where: { organizationId: ctx.organizationId, type: "CONTENT_CHANGE_REQUEST", status: "pending", payload: { path: ["contentItemId"], equals: id } } });
        if (pending) return { status: 409, error: "Your changes are still with Admin. Review the updated post when they are complete." };
        if (item.status !== "approved") {
          await tx.contentItem.update({ where: { id }, data: { status: "approved" } });
          await tx.auditLog.create({ data: { organizationId: ctx.organizationId, userId: ctx.userId, action: "weekly.post_approved", resource: "content_item", resourceId: id } });
        }
        return { status: 200, itemStatus: "approved" };
      }
      const pending = await tx.job.findFirst({ where: { organizationId: ctx.organizationId, type: "CONTENT_CHANGE_REQUEST", status: "pending", payload: { path: ["contentItemId"], equals: id } } });
      const payload = { contentItemId: id, campaignId: item.campaignId, comment: action.comment };
      if (pending) await tx.job.update({ where: { id: pending.id }, data: { payload } });
      else await tx.job.create({ data: { organizationId: ctx.organizationId, type: "CONTENT_CHANGE_REQUEST", status: "pending", payload } });
      await tx.contentItem.update({ where: { id }, data: { status: "draft" } });
      await tx.auditLog.create({ data: { organizationId: ctx.organizationId, userId: ctx.userId, action: "weekly.changes_requested", resource: "content_item", resourceId: id, metadata: { comment: action.comment } } });
      return { status: 200, itemStatus: "draft", changesRequested: true };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(result, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error, "Could not save your review. Refresh the post and try again."); }
}
