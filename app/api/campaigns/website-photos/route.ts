import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { discoverWebsitePhotos } from "@/lib/campaign/website-photos";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    const parsed = z.object({ organizationId: z.string().min(1), topics: z.array(z.string().trim().min(1).max(100)).max(12).default([]) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose your campaign topics first." }, { status: 400 });
    if (parsed.data.organizationId !== ctx.organizationId) return NextResponse.json({ error: "Your workspace changed. Reload this page first." }, { status: 409 });
    // Use the business's saved website, never a client-supplied crawl address.
    const brand = await prisma.brand.findFirst({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" }, select: { name: true, websiteUrl: true } });
    if (!brand?.websiteUrl) return NextResponse.json({ error: "Add your website in Brand Brain first." }, { status: 400 });
    let images: string[];
    try { images = await discoverWebsitePhotos(brand.websiteUrl, parsed.data.topics); }
    catch { return NextResponse.json({ error: "We could not read photos from your website. Try a product-page link or choose Drafts only." }, { status: 422 }); }
    if (!images.length) return NextResponse.json({ error: "No usable photos were found. Try a product-page link or choose Drafts only." }, { status: 422 });
    return NextResponse.json({ organizationId: ctx.organizationId, title: `Photos from ${brand.name}`, images }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error, "Could not find website photos."); }
}
