import type { Prisma } from "@prisma/client";
import { grantCreditsInTransaction } from "./grants";
import { PACKAGE_CATALOG, type PaidPackageKey } from "./packages";
import { TOPUPS } from "./plans";
export type BillingAction = {
  organizationId: string; customerId?: string; subscriptionId?: string;
  plan?: PaidPackageKey; status?: string;
  grant?: { source: "subscription"; reference: string; plan: PaidPackageKey } | { source: "topup"; reference: string; pack: keyof typeof TOPUPS };
};
export async function applyBillingEvent(tx: Prisma.TransactionClient, event: { id: string; type: string }, action: BillingAction | null) {
  await tx.billingEvent.upsert({ where: { stripeEventId: event.id }, create: { stripeEventId: event.id, type: event.type }, update: {} });
  await tx.$queryRaw`SELECT id FROM "BillingEvent" WHERE "stripeEventId" = ${event.id} FOR UPDATE`;
  const saved = await tx.billingEvent.findUniqueOrThrow({ where: { stripeEventId: event.id } });
  if (saved.processed) return { duplicate: true };
  if (action) {
    await tx.$queryRaw`SELECT id FROM "Subscription" WHERE "organizationId" = ${action.organizationId} FOR UPDATE`;
    const sub = await tx.subscription.findUniqueOrThrow({ where: { organizationId: action.organizationId } });
    if (action.customerId && sub.stripeCustomerId && sub.stripeCustomerId !== action.customerId) throw new Error("BILLING_CUSTOMER_MISMATCH");
    // Do not let delayed events for an old subscription overwrite a replacement.
    const otherSubscription = Boolean(action.subscriptionId && sub.stripeSubscriptionId && sub.stripeSubscriptionId !== action.subscriptionId);
    const ended = (status?: string) => ["canceled", "incomplete_expired"].includes(status || "");
    const staleEndedSubscription = otherSubscription && ended(action.status);
    if (otherSubscription && !ended(sub.status) && !staleEndedSubscription) throw new Error("BILLING_SUBSCRIPTION_MISMATCH");
    if (action.subscriptionId && !staleEndedSubscription) await tx.subscription.update({ where: { organizationId: action.organizationId }, data: { stripeCustomerId: action.customerId, stripeSubscriptionId: action.subscriptionId, plan: action.plan, status: action.status } });
    if (action.grant) {
      const g = action.grant, amount = g.source === "subscription" ? PACKAGE_CATALOG[g.plan].monthlyCredits : TOPUPS[g.pack].credits;
      await grantCreditsInTransaction(tx, action.organizationId, amount, g.reference, g.source);
    }
  }
  await tx.billingEvent.update({ where: { stripeEventId: event.id }, data: { processed: true, organizationId: action?.organizationId } });
  return { duplicate: false };
}
