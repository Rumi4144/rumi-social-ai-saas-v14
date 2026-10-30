import { prisma } from "@/lib/prisma";
export async function spendCredits(organizationId: string, cost: number, reason: string, referenceId?: string) {
  if (!Number.isSafeInteger(cost) || cost < 0) throw new Error("INVALID_CREDIT_COST");
  return prisma.$transaction(async tx => {
    const changed = await tx.subscription.updateMany({ where: { organizationId, credits: { gte: cost } }, data: { credits: { decrement: cost } } });
    if (changed.count !== 1) throw new Error("INSUFFICIENT_CREDITS");
    const sub = await tx.subscription.findUniqueOrThrow({ where: { organizationId } });
    await tx.creditLedger.create({ data: { organizationId, delta: -cost, balanceAfter: sub.credits, reason, referenceId } });
    return sub.credits;
  });
}
