import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { dateValue } from "@/lib/weekly/plan";

const input = z.object({
  plannedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  expectedScheduledFor: z.string().datetime().nullable(),
}).strict();

/** A legacy draft's calendar placement is separate from a publishing schedule.
 * Preserve its media, approval state and campaign when removing it from a week. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await tenantContext();
    if (!ctx.isSuperAdmin) return NextResponse.json({ error: "Only Admin can change a draft's planned date." }, { status: 403 });
    if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid planned date or leave this draft unassigned." }, { status: 400 });
    let date: Date | null;
    try { date = parsed.data.plannedDate ? dateValue(parsed.data.plannedDate) : null; }
    catch { return NextResponse.json({ error: "Choose a valid calendar date." }, { status: 400 }); }
    const { id } = await params;
    const result = await prisma.$transaction(async tx => {
      const item = await tx.contentItem.findFirst({ where: { id, campaign: { brand: { organizationId: ctx.organizationId } } } });
      if (!item) return { status: 404, error: "Draft not found in this workspace." };
      if (item.status !== "draft") return { status: 409, error: "Only unapproved drafts can be moved. This post's approval or publishing status has changed." };
      if ((item.scheduledFor?.toISOString() || null) !== parsed.data.expectedScheduledFor) return { status: 409, error: "This draft's date changed. Refresh before editing it." };
      const delivery = await tx.publishJob.findFirst({ where: { organizationId: ctx.organizationId, contentItemId: id } });
      if (delivery) return { status: 409, error: "This post has publishing history. Manage its delivery separately." };
      const pack = await tx.job.findFirst({ where: { organizationId: ctx.organizationId, type: "WEEKLY_PACK", payload: { path: ["campaignId"], equals: item.campaignId } } });
      if (pack) return { status: 409, error: "This post belongs to a prepared weekly pack. Its assigned dates stay with that pack." };
      const before = item.scheduledFor?.toISOString() || null, after = date?.toISOString() || null;
      if (before === after) return { status: 200, scheduledFor: after, itemStatus: "draft" };
      const changed = await tx.contentItem.updateMany({ where: { id, campaignId: item.campaignId, status: "draft", scheduledFor: item.scheduledFor }, data: { scheduledFor: date } });
      if (!changed.count) return { status: 409, error: "This draft changed. Refresh before editing it." };
      await tx.auditLog.create({ data: { organizationId: ctx.organizationId, userId: ctx.userId, action: "content.draft_date_changed", resource: "content_item", resourceId: id, metadata: { campaignId: item.campaignId, before, after } } });
      return { status: 200, scheduledFor: after, itemStatus: "draft" };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(result, { status: result.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error, "Could not change the draft date. Refresh and try again."); }
}
