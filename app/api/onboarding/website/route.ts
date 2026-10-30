import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { rateLimit } from "@/lib/security/rate-limit";
import { readWebsiteSetup } from "@/lib/onboarding/website";

export const maxDuration = 180;
const schema = z.object({ website: z.string().trim().min(1).max(2000), brand: z.string().trim().min(2).max(160) });

export async function POST(request: Request) {
  try {
    const ctx = await tenantContext();
    if (!ctx.isSuperAdmin && !["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Your workspace owner or administrator can set up this business." }, { status: 403 });
    if (request.headers.get("origin") !== new URL(request.url).origin) return NextResponse.json({ error: "Request origin is not allowed." }, { status: 403 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter your business name and website." }, { status: 400 });
    const allowed = await rateLimit(`onboarding-website:${ctx.organizationId}`, 5, 60 * 60 * 1000);
    if (!allowed.ok) return NextResponse.json({ error: "This business has reached its website-read limit for this hour. You can continue with the details already entered." }, { status: 429 });
    let setup;
    try { setup = await readWebsiteSetup(parsed.data.website, parsed.data.brand); }
    catch { return NextResponse.json({ error: "We could not read that website. Check the address, or add a short description and continue without importing." }, { status: 422 }); }
    const review = await prisma.job.create({ data: { organizationId: ctx.organizationId, type: "ONBOARDING_WEBSITE_REVIEW", status: "succeeded", progress: 100,
      payload: { website: setup.website, brand: parsed.data.brand, requestedBy: ctx.userId }, result: JSON.parse(JSON.stringify(setup)) } });
    return NextResponse.json({ reviewId: review.id, website: setup.website, logoUrl: setup.logoUrl, suggestions: { description: setup.suggestions.description || "", targetAudience: setup.suggestions.targetAudience || "", industry: setup.suggestions.industry || "" },
      products: setup.products.map(product => ({ name: product.label, sourceUrl: product.sourceUrl, photoCount: product.images.length })), warnings: setup.warnings }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error, "Could not read this business website."); }
}
