import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/security/crypto";
import type { GoogleGrant } from "./client";
export const GOOGLE_SELECTION_TYPE = "GOOGLE_BUSINESS_SELECTION";
export type GoogleSelection = { userId: string; expiresAt: number; encryptedGrant: string };
export function requireGoogleWriter(role: string) {
  if (!["owner", "admin", "member", "superadmin"].includes(role)) throw new Error("FORBIDDEN");
}
export function sameAppRequest(req: Request) {
  const origin = req.headers.get("origin");
  return Boolean(origin && origin === new URL(process.env.NEXT_PUBLIC_APP_URL || req.url).origin);
}
export async function googleSelection(id: string, ctx: { userId: string; organizationId: string }) {
  const job = await prisma.job.findFirst({ where: { id, organizationId: ctx.organizationId, type: GOOGLE_SELECTION_TYPE, status: "pending" } });
  const payload = job?.payload as GoogleSelection | undefined;
  if (!job || payload?.userId !== ctx.userId || !payload.encryptedGrant || payload.expiresAt < Date.now()) throw new Error("This Google connection session expired. Connect again from Settings.");
  return { job, payload, grant: JSON.parse(decryptSecret(payload.encryptedGrant)) as GoogleGrant };
}
