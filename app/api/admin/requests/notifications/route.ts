import { NextResponse } from "next/server";
import { z } from "zod";
import { superAdminContext } from "@/lib/admin/context";
import { prisma } from "@/lib/prisma";
import { requestAlertSettingsId } from "@/lib/admin/request-notifications";
import { apiError } from "@/lib/http/errors";
export async function POST(request: Request) {
  try {
    const admin = await superAdminContext();
    if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const form = await request.formData(), email = String(form.get("email") || "").trim();
    const parsed = z.string().email().max(254).safeParse(email);
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid notification email." }, { status: 400 });
    const payload = { email: parsed.data, enabled: form.get("enabled") === "yes" };
    await prisma.$transaction(async tx => {
      await tx.job.upsert({ where: { id: requestAlertSettingsId }, create: { id: requestAlertSettingsId, organizationId: "platform", type: "ADMIN_REQUEST_ALERT_SETTINGS", status: "completed", payload }, update: { payload } });
      await tx.auditLog.create({ data: { userId: admin.id, action: "customer_request_alerts_updated", resource: "Job", resourceId: requestAlertSettingsId, metadata: payload } });
    });
    return NextResponse.redirect(new URL("/admin/requests?alerts=saved", request.url), 303);
  } catch (error) { return apiError(error, "Could not save email alerts."); }
}
