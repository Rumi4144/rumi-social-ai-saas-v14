import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { planFor } from "./plans";
export async function grantCreditsInTransaction(tx: Prisma.TransactionClient, organizationId: string, amount: number, externalRef: string, source: "subscription" | "topup") {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("INVALID_CREDIT_GRANT");
  await tx.$queryRaw`SELECT id FROM "Subscription" WHERE "organizationId" = ${organizationId} FOR UPDATE`;
  const existing = await tx.creditGrant.findFirst({ where: { organizationId, externalRef } });
  if (existing) return existing;
  // Older top-ups recorded only the checkout session in the ledger. A later
  // async-payment webhook for the same session must not grant those credits again.
  const referenceIds = source === "topup" ? [externalRef, externalRef.replace(/^checkout:/, "")] : [externalRef];
  const legacy = await tx.creditLedger.findFirst({ where: { organizationId, referenceId: { in: referenceIds }, reason: source === "topup" ? "credit_topup" : "monthly_plan_grant", delta: { gt: 0 } } });
  if (legacy) return tx.creditGrant.create({ data: { organizationId, source, credits: legacy.delta, remaining: 0, externalRef } });
  const sub = await tx.subscription.update({ where: { organizationId }, data: { credits: { increment: amount } } });
  await tx.creditLedger.create({ data: { organizationId, delta: amount, balanceAfter: sub.credits, reason: source === "subscription" ? "monthly_plan_grant" : "credit_topup", referenceId: externalRef } });
  return tx.creditGrant.create({ data: { organizationId, source, credits: amount, remaining: amount, externalRef } });
}
export async function grantMonthlyCredits(organizationId: string, plan: string, externalRef: string) {
  return prisma.$transaction(tx => grantCreditsInTransaction(tx, organizationId, planFor(plan).monthlyCredits, externalRef, "subscription"));
}
