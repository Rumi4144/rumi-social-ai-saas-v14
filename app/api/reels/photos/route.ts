import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { extractProductPhotos, pageBelongsToBrand, photoKey, productPageForPost } from "@/lib/reels/product-photos";
import { fetchPublicBytes } from "@/lib/reels/public-fetch";
const schema = z.object({ campaignId: z.string().min(1), contentItemId: z.string().min(1), url: z.string().url().optional() });
export async function POST(req: Request) {
  try {
    const ctx = await tenantContext(); if (ctx.role === "viewer") throw new Error("FORBIDDEN");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose a campaign post first." }, { status: 400 });
    const p = parsed.data;
    const post = await prisma.contentItem.findFirst({ where: { id: p.contentItemId, campaignId: p.campaignId, campaign: { brand: { organizationId: ctx.organizationId } } }, include: { campaign: { include: { brand: { include: { products: true } } } } } });
    if (!post) return NextResponse.json({ error: "Post not found in this workspace." }, { status: 404 });
    const brand = post.campaign.brand, website = brand.websiteUrl || "", products = brand.products;
    const page = p.url || productPageForPost(post, website, products);
    if (!page) return NextResponse.json({ error: "Enter this product’s page address, or upload its photos.", needsUrl: true }, { status: 400 });
    if (!pageBelongsToBrand(page, website, products)) return NextResponse.json({ error: "Use a product page from this brand’s website or saved products." }, { status: 400 });
    let images: string[];
    try {
      const result = await fetchPublicBytes(page, 3_000_000);
      if (!/text\/html|application\/xhtml\+xml/i.test(result.contentType)) throw new Error("Not an HTML product page.");
      images = extractProductPhotos(result.bytes.toString("utf8"), page);
    } catch { return NextResponse.json({ error: "Could not read this product page. Check the address or upload its photos." }, { status: 502 }); }
    if (!images.length) return NextResponse.json({ error: "No product photos were found on this page. Upload the photos you want to use." }, { status: 404 });
    const sources = [];
    for (let index = 0; index < images.length; index++) {
      const url = images[index], id = `reel-photo-${createHash("sha256").update(JSON.stringify([ctx.organizationId, post.id, photoKey(url)])).digest("hex").slice(0, 40)}`;
      const metadata = { sourceUrl: page, label: `Product photo ${index + 1}` };
      await prisma.mediaAsset.upsert({ where: { id }, create: { id, organizationId: ctx.organizationId, campaignId: p.campaignId, contentItemId: post.id, kind: "product_photo", provider: "product-website", status: "ready", url, metadata }, update: { url, metadata } });
      sources.push({ id, kind: "image", src: `/api/reels/media?assetId=${id}`, contentItemId: post.id, label: metadata.label });
    }
    return NextResponse.json({ sources, sourceUrl: page }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error, "Could not load product photos. Try again or upload them."); }
}
