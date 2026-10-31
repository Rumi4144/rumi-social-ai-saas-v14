import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { dateValue, manifestOf } from "@/lib/weekly/plan";
import { lockedDeliveryStatuses } from "@/components/weekly/item-policy";

const input = z.object({ plannedDate: z.string(), expectedDate: z.string() }).strict();
const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};

// A planned date does not create or alter a social publishing job. The original
// pack and slot stay intact so changing a date cannot remove purchased content.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer") return NextResponse.json({ error: "Your access is read-only." }, { status: 403 });
    if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid planned date." }, { status: 400 });
    let date: Date;
    try { date = dateValue(parsed.data.plannedDate); dateValue(parsed.data.expectedDate); }
    catch { return NextResponse.json({ error: "Choose a valid calendar date." }, { status: 400 }); }
    const { id } = await params;
    const result = await prisma.$transaction(async tx => {
      const item = await tx.contentItem.findFirst({ where: { id, campaign: { brand: { organizationId: ctx.organizationId } } } });
      if (!item) return { status: 404, error: "Post not found in this workspace." };
      if (!["draft", "approved"].includes(item.status)) return { status: 409, error: "Only draft and approved posts can change their planned date. Scheduled and posted dates are kept with their delivery history." };
      const delivery = await tx.publishJob.findFirst({ where: { organizationId: ctx.organizationId, contentItemId: id, status: { in: lockedDeliveryStatuses } } });
      if (delivery) return { status: 409, error: "This post has an active or completed delivery. Its planned date cannot be changed here." };
      const pack = await tx.job.findFirst({ where: { organizationId: ctx.organizationId, type: "WEEKLY_PACK", payload: { path: ["campaignId"], equals: item.campaignId } } });
      const manifest = manifestOf(pack?.payload), mappings = object(pack?.result).items;
      const mapping = Array.isArray(mappings) ? mappings.find(row => row.contentItemId === id) : null;
      const slot = manifest?.campaignId === item.campaignId && manifest.slots.find(row => row.key === mapping?.slotKey);
      if (!slot) return { status: 409, error: "This post is not assigned to a saved weekly pack." };
      const dateId = `weekly-date-${id}`;
      const saved = await tx.job.findFirst({ where: { id: dateId, organizationId: ctx.organizationId, type: "WEEKLY_POST_DATE" } });
      const before = object(saved?.payload).plannedDate || slot.date;
      if (before !== parsed.data.expectedDate) return { status: 409, error: "This date changed. Refresh before editing it." };
      if (before === parsed.data.plannedDate) return { status: 200, plannedDate: before };
      const changed = await tx.contentItem.updateMany({ where: { id, campaignId: item.campaignId, status: item.status, scheduledFor: item.scheduledFor }, data: { scheduledFor: date } });
      if (!changed.count) return { status: 409, error: "This post changed. Refresh before editing it." };
      const payload = { contentItemId: id, campaignId: item.campaignId, plannedDate: parsed.data.plannedDate };
      if (saved) await tx.job.update({ where: { id: saved.id }, data: { payload } });
      else await tx.job.create({ data: { id: dateId, organizationId: ctx.organizationId, type: "WEEKLY_POST_DATE", status: "succeeded", payload } });
      await tx.auditLog.create({ data: { organizationId: ctx.organizationId, userId: ctx.userId, action: "weekly.planned_date_changed", resource: "content_item", resourceId: id, metadata: { before, after: parsed.data.plannedDate, packId: pack!.id } } });
      return { status: 200, plannedDate: parsed.data.plannedDate };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(result, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error, "Could not save the date. Refresh and try again."); }
}
