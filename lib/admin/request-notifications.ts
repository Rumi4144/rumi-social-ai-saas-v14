import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
export const requestAlertSettingsId = "platform-customer-request-alerts";
export const requestAlertSender = () => (process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM || process.env.MAIL_FROM || "").trim();
export async function requestAlertSettings() {
  const row = await prisma.job.findUnique({ where: { id: requestAlertSettingsId } });
  const settings = row?.payload as { email?: string; enabled?: boolean } | null;
  return { email: settings?.email || "", enabled: settings?.enabled === true, configured: Boolean(process.env.RESEND_API_KEY && requestAlertSender()) };
}
export async function notifyCustomerRequest(organizationId: string, requestId: string) {
  const settings = await requestAlertSettings();
  if (!settings.enabled || !settings.email || !settings.configured) return "not_configured";
  const request = await prisma.job.findFirst({ where: { id: requestId, organizationId, type: "CONTENT_CHANGE_REQUEST", status: "pending" } });
  const payload = request?.payload as { contentItemId?: string; comment?: string } | undefined;
  if (!request || !payload?.contentItemId) return "not_found";
  const item = await prisma.contentItem.findFirst({ where: { id: payload.contentItemId, campaign: { brand: { organizationId } } }, select: { headline: true } });
  if (!item) return "not_found";
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } });
  const fingerprint = createHash("sha256").update(JSON.stringify([requestId, payload.comment, settings.email])).digest("hex");
  if ((request.result as { notificationFingerprint?: string } | null)?.notificationFingerprint === fingerprint) return "already_sent";
  const url = new URL("/admin/requests", process.env.NEXT_PUBLIC_APP_URL || "https://rumisocialai.com");
  url.searchParams.set("organizationId", organizationId);
  const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `customer-request-${fingerprint}` }, body: JSON.stringify({ from: requestAlertSender(), to: [settings.email], subject: `Customer change request · ${org?.name || "Rumi Social AI"}`, text: `${org?.name || "A customer"} requested a change.\n\nPost: ${item.headline || "Untitled post"}\n\nRequested change:\n${payload.comment || ""}\n\nReview in Admin:\n${url}\n\nThe customer will review and approve the revised post.` }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("REQUEST_EMAIL_DELIVERY_FAILED");
  await prisma.job.updateMany({ where: { id: requestId, organizationId, type: "CONTENT_CHANGE_REQUEST", status: "pending" }, data: { result: { notificationFingerprint: fingerprint, notifiedAt: new Date().toISOString() } } });
  return "sent";
}
