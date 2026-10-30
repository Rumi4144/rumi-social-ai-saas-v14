import { NextResponse } from "next/server";
import { superAdminContext } from "@/lib/admin/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await superAdminContext();
    if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
    const { id } = await params, form = await request.formData();
    const organizationId = String(form.get("organizationId") || "");
    if (!organizationId || form.get("changesReviewed") !== "yes") return NextResponse.json({ error: "Review the requested changes first." }, { status: 400 });
    const result = await prisma.$transaction(async tx => {
      const job = await tx.job.findFirst({ where: { id, organizationId, type: "CONTENT_CHANGE_REQUEST" } });
      const contentItemId = (job?.payload as { contentItemId?: string } | undefined)?.contentItemId;
      if (!job || !contentItemId) return 404;
      const item = await tx.contentItem.findFirst({ where: { id: contentItemId, campaign: { brand: { organizationId } } }, select: { id: true, status: true } });
      if (!item) return 404;
      if (job.status === "succeeded") return 200;
      if (item.status !== "draft") return 409;
      const updated = await tx.job.updateMany({ where: { id, organizationId, type: "CONTENT_CHANGE_REQUEST", status: "pending" }, data: { status: "succeeded", progress: 100, result: { handledBy: admin.id, contentItemId } } });
      if (!updated.count) return 409;
      await tx.auditLog.create({ data: { organizationId, userId: admin.id, action: "content_change_request_completed", resource: "Job", resourceId: id, metadata: { contentItemId } } });
      return 200;
    });
    if (result !== 200) return NextResponse.json({ error: result === 404 ? "Request not found in this customer account." : "Keep the revised post as a draft for customer approval, then refresh this request." }, { status: result });
    return NextResponse.redirect(new URL(`/admin/requests?organizationId=${encodeURIComponent(organizationId)}&saved=1`, request.url), 303);
  } catch (error) { return apiError(error, "Could not mark this request handled."); }
}
