import { NextResponse } from "next/server";
import Stripe from "stripe";
import { tenantContext } from "@/lib/auth/context";
import { canManageBilling, billingBaseUrl } from "@/lib/billing/access";
import { apiError } from "@/lib/http/errors";
import { z } from "zod";
const schema = z.object({ pack: z.enum(["small", "medium", "large"]) });
export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (!canManageBilling(ctx.role, ctx.isSuperAdmin)) return NextResponse.json({ error: "Only the workspace owner or administrator can buy credits." }, { status: 403 });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose a listed credit pack." }, { status: 400 });
    const price = process.env[`STRIPE_TOPUP_${parsed.data.pack.toUpperCase()}_PRICE_ID`];
    if (!price || !process.env.STRIPE_SECRET_KEY) return NextResponse.json({ error: "Credit checkout is not configured." }, { status: 503 });
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY), base = billingBaseUrl();
    const session = await stripe.checkout.sessions.create({ mode: "payment", line_items: [{ price, quantity: 1 }], client_reference_id: ctx.organizationId, metadata: { organizationId: ctx.organizationId, pack: parsed.data.pack }, success_url: `${base}/usage?topup=success`, cancel_url: `${base}/usage` });
    return NextResponse.json({ url: session.url });
  } catch (error) { return apiError(error, "Could not open credit checkout."); }
}
