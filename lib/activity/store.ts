import { prisma } from "@/lib/prisma";
import { ACTIVITY_ACTION, applyCheckIn, newActivitySession, readActivitySession, type CheckIn } from "./session";

export type ActivityIdentity = { userId: string; sessionId: string; signedInAt: string | null };

// Session summaries have their own action in the existing activity/audit store.
// Other audit events are never updated. No credential or browsing content is stored.
export async function recordActivity(
  identity: ActivityIdentity,
  event: { kind: "start" } | { kind: "end" } | { kind: "check-in"; checkIn: CheckIn; organizationId: string | null },
  now = new Date(),
) {
  const id = `activity_${identity.sessionId}`;
  return prisma.$transaction(async tx => {
    // Serialize tabs and sign-out across server instances to prevent double counting.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
    const existing = await tx.auditLog.findUnique({ where: { id } });
    if (existing && (existing.userId !== identity.userId || existing.action !== ACTIVITY_ACTION)) {
      throw new Error("ACTIVITY_SESSION_MISMATCH");
    }
    let state = readActivitySession(existing?.metadata) || newActivitySession(identity.signedInAt, now);
    if (state.endedAt) return;
    if (event.kind === "check-in") state = applyCheckIn(state, event.checkIn, now);
    if (event.kind === "end") state = { ...state, endedAt: now.toISOString(), tabs: {} };
    const organizationId = event.kind === "check-in" ? event.organizationId : existing?.organizationId || null;
    const data = { organizationId, metadata: state };
    if (existing) await tx.auditLog.update({ where: { id }, data });
    else await tx.auditLog.create({ data: {
      id, ...data, userId: identity.userId, action: ACTIVITY_ACTION, resource: "session",
    } });
  }, { maxWait: 3000, timeout: 5000 });
}
