import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { planFromPrice } from "@/lib/billing/packages";
import { applyBillingEvent, type BillingAction } from "@/lib/billing/events";
import { TOPUPS } from "@/lib/billing/plans";
const idOf = (value: string | { id: string } | null | undefined) => typeof value === "string" ? value : value?.id;
async function subscriptionAction(stripe: Stripe, subscriptionId: string): Promise<BillingAction> {
  // Retrieve current state so late webhooks cannot restore an outdated plan/status.
  const remote = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = idOf(remote.customer)!;
  const local = remote.metadata.organizationId
    ? await prisma.subscription.findUnique({ where: { organizationId: remote.metadata.organizationId } })
    : await prisma.subscription.findFirst({ where: { OR: [{ stripeSubscriptionId: remote.id }, { stripeCustomerId: customerId }] } });
  if (!local || (local.stripeCustomerId && local.stripeCustomerId !== customerId)) throw new Error("Unknown billing workspace");
  const plan = remote.items.data.length === 1 ? planFromPrice(remote.items.data[0].price.id) : null;
  return { organizationId: local.organizationId, customerId, subscriptionId: remote.id, status: remote.status, ...(plan ? { plan } : {}) };
}
export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return NextResponse.json({ error: "Billing webhook is not configured" }, { status: 503 });
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY), signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(await req.text(), signature, process.env.STRIPE_WEBHOOK_SECRET); }
  catch { return NextResponse.json({ error: "Invalid signature" }, { status: 400 }); }
  try {
    const existing = await prisma.billingEvent.findUnique({ where: { stripeEventId: event.id } });
    if (existing?.processed) return NextResponse.json({ received: true, duplicate: true });
    let action: BillingAction | null = null;
    if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      action = await subscriptionAction(stripe, (event.data.object as Stripe.Subscription).id);
    } else if (event.type === "invoice.paid") {
      const invoice = event.data.object as Stripe.Invoice, subscriptionId = idOf(invoice.subscription);
      if (subscriptionId) {
        action = await subscriptionAction(stripe, subscriptionId);
        // Full monthly grants apply to paid initial/renewal invoices, not prorations.
        if (["subscription_create", "subscription_cycle"].includes(invoice.billing_reason || "")) {
          const recurringLine = invoice.lines.data.find(line => line.type === "subscription" && !line.proration);
          const paidPlan = recurringLine?.price?.id ? planFromPrice(recurringLine.price.id) : null;
          if (!paidPlan || !invoice.id) throw new Error("Configure this subscription price before granting credits");
          action.grant = { source: "subscription", reference: `invoice:${invoice.id}`, plan: paidPlan };
        }
      }
    } else if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === "subscription" && idOf(session.subscription)) action = await subscriptionAction(stripe, idOf(session.subscription)!);
      if (session.mode === "payment" && session.payment_status === "paid") {
        const pack = session.metadata?.pack;
        if (session.metadata?.organizationId && pack && Object.prototype.hasOwnProperty.call(TOPUPS, pack)) {
          const expected = process.env[`STRIPE_TOPUP_${pack.toUpperCase()}_PRICE_ID`];
          const lines = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2 });
          if (!expected || lines.data.length !== 1 || lines.data[0].price?.id !== expected || lines.data[0].quantity !== 1) throw new Error("Credit checkout price mismatch");
          action = { organizationId: session.metadata.organizationId, grant: { source: "topup", reference: `checkout:${session.id}`, pack: pack as keyof typeof TOPUPS } };
        }
      }
    }
    const result = await prisma.$transaction(tx => applyBillingEvent(tx, event, action));
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    console.error("BILLING_EVENT_FAILED", { eventId: event.id, type: event.type, message: error instanceof Error ? error.message : "Unknown error" });
    // A failed or partially recorded event must remain retryable by Stripe.
    return NextResponse.json({ received: true, processed: false }, { status: 500 });
  }
}
