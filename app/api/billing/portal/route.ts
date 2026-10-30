import { NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { canManageBilling, billingBaseUrl } from "@/lib/billing/access";
export async function POST() {
  try {
    const ctx = await tenantContext();
    if (!canManageBilling(ctx.role, ctx.isSuperAdmin)) return NextResponse.json({ error: "Only the workspace owner or administrator can manage billing." }, { status: 403 });
    if (!process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Billing is not configured." }, { status: 503 });
    const sub = await prisma.subscription.findUnique({ where: { organizationId: ctx.organizationId } });
    if (!sub?.stripeCustomerId) return NextResponse.json({ error: "No billing customer exists yet." }, { status: 404 });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.billingPortal.sessions.create({ customer: sub.stripeCustomerId, return_url: `${billingBaseUrl()}/billing` });
    return NextResponse.json({ url: session.url });
  } catch (error) { return apiError(error, "Unable to open billing settings."); }
}
