import { weeklyPackageSpec } from "./packages";

export const accessRecordId = (organizationId: string) => `admin-creation-access:${organizationId}`;
export type AccessDuration = "week" | "month";
export type AdminAccess = { duration: AccessDuration; startsAt: string; expiresAt: string };
export function accessGrant(duration: AccessDuration, now = new Date()): AdminAccess {
  const end = new Date(now);
  if (duration === "week") end.setUTCDate(end.getUTCDate() + 7);
  else {
    const day = end.getUTCDate();
    end.setUTCDate(1); end.setUTCMonth(end.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    end.setUTCDate(Math.min(day, lastDay));
  }
  return { duration, startsAt: now.toISOString(), expiresAt: end.toISOString() };
}
export function readAccess(value: unknown): AdminAccess | null {
  const p = value as Partial<AdminAccess> | null;
  return p && (p.duration === "week" || p.duration === "month") && typeof p.startsAt === "string" && typeof p.expiresAt === "string" && Number.isFinite(Date.parse(p.startsAt)) && Number.isFinite(Date.parse(p.expiresAt)) ? p as AdminAccess : null;
}
export function creationPackageSpec(sub: { plan?: string | null; status?: string | null } | null, access: AdminAccess | null, now = new Date()) {
  const spec = weeklyPackageSpec(sub?.plan, sub?.status);
  if (access && now.getTime() >= Date.parse(access.expiresAt)) return { ...spec, canGenerate: false, blockReason: "Your creation access has ended. Ask Admin to extend it. Your credits and saved posts are preserved." };
  return spec;
}
