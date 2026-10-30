import { NextResponse } from "next/server";
import Stripe from "stripe";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { PACKAGE_KEYS, PACKAGE_CATALOG, configuredPlanPrice } from "@/lib/billing/packages";
import { canManageBilling, billingBaseUrl } from "@/lib/billing/access";
const schema = z.object({ plan: z.enum(PACKAGE_KEYS) }).strict();
export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (!canManageBilling(ctx.role, ctx.isSuperAdmin)) return NextResponse.json({ error: "Only the workspace owner or administrator can change billing." }, { status: 403 });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose a listed plan." }, { status: 400 });
    const plan = parsed.data.plan, price = configuredPlanPrice(plan);
    if (!process.env.STRIPE_SECRET_KEY || !price) return NextResponse.json({ error: "Online checkout for this plan is not configured yet. Contact support." }, { status: 503 });
    const sub = await prisma.subscription.findUnique({ where: { organizationId: ctx.organizationId } });
    if (!sub) return NextResponse.json({ error: "Workspace subscription not found." }, { status: 404 });
    if (sub.stripeSubscriptionId && !["canceled", "incomplete_expired"].includes(sub.status)) return NextResponse.json({ error: "Use Manage subscription to change your existing plan." }, { status: 409 });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const actualPrice = await stripe.prices.retrieve(price);
    if (!actualPrice.active || actualPrice.currency !== "usd" || actualPrice.unit_amount !== PACKAGE_CATALOG[plan].priceUsd * 100 || actualPrice.recurring?.interval !== "month" || actualPrice.recurring.interval_count !== 1) return NextResponse.json({ error: "This plan’s checkout price needs configuration. No charge was made." }, { status: 503 });
    const customer = sub.stripeCustomerId || (await stripe.customers.create({ metadata: { organizationId: ctx.organizationId }, name: ctx.organization.name }, { idempotencyKey: `rumi-customer-${ctx.organizationId}` })).id;
    if (!sub.stripeCustomerId) await prisma.subscription.update({ where: { organizationId: ctx.organizationId }, data: { stripeCustomerId: customer } });
    const base = billingBaseUrl();
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Subscription" WHERE "organizationId" = ${ctx.organizationId} FOR UPDATE`;
      const latest = await tx.subscription.findUniqueOrThrow({ where: { organizationId: ctx.organizationId } });
      const subscriptions = await stripe.subscriptions.list({ customer, status: "all", limit: 100 });
      if ((latest.stripeSubscriptionId && !["canceled", "incomplete_expired"].includes(latest.status)) || subscriptions.data.some(item => !["canceled", "incomplete_expired"].includes(item.status))) return { error: "Use Manage subscription to change your existing plan." };
      const open = await stripe.checkout.sessions.list({ customer, status: "open", limit: 100 });
      const same = open.data.find(item => item.mode === "subscription" && item.metadata?.plan === plan && item.metadata?.organizationId === ctx.organizationId);
      if (same?.url) return { url: same.url };
      // Only one subscription checkout may remain open for a workspace.
      for (const previous of open.data.filter(item => item.mode === "subscription")) await stripe.checkout.sessions.expire(previous.id);
      const session = await stripe.checkout.sessions.create({ mode: "subscription", customer, client_reference_id: ctx.organizationId, metadata: { organizationId: ctx.organizationId, plan }, subscription_data: { metadata: { organizationId: ctx.organizationId, plan } }, line_items: [{ price, quantity: 1 }], success_url: `${base}/billing?checkout=success`, cancel_url: `${base}/billing` });
      return { url: session.url };
    }, { timeout: 20000 });
    return NextResponse.json(result, { status: "error" in result ? 409 : 200 });
  } catch (error) { return apiError(error, "Could not open checkout. Please try again."); }
}
