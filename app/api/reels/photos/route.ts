import { reelProductSubject, reelPhotoMatchesProduct } from "@/lib/reels/product-identity";
import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { extractProductPhotos, pageBelongsToBrand, photoKey, productPageForPost } from "@/lib/reels/product-photos";
import { fetchPublicBytes } from "@/lib/reels/public-fetch";
import { cachedProductGallery, transientProductReadError } from "@/lib/reels/product-photo-cache";
export const maxDuration = 60;
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
    const productSubject=reelProductSubject(post,brand);
    let verifiedPage: string | undefined;
    if(!p.url && productSubject){
      const saved=await prisma.mediaAsset.findMany({where:{organizationId:ctx.organizationId,campaignId:p.campaignId,contentItemId:post.id,status:"ready",kind:{in:["ai_image","product_photo"]}},select:{metadata:true},orderBy:{createdAt:"desc"},take:30});
      for(const asset of saved){
        const m=asset.metadata as {sourceUrl?:unknown;sourceEvidence?:{sourceUrl?:unknown}}|null;
        const url=m?.sourceEvidence?.sourceUrl||m?.sourceUrl;
        if(typeof url==="string" && pageBelongsToBrand(url,website,products) && reelPhotoMatchesProduct(productSubject,asset)){verifiedPage=url;break;}
      }
    }
    const page = p.url || verifiedPage || productPageForPost(post, website, products);
    if (!page) return NextResponse.json({ error: "Enter this product’s page address, or upload its photos.", needsUrl: true }, { status: 400 });
    if (!pageBelongsToBrand(page, website, products)) return NextResponse.json({ error: "Use a product page from this brand’s website or saved products." }, { status: 400 });
    let images: string[]; let productName=""; let notice: string | undefined;
    try {
      const read = () => fetchPublicBytes(page, 3_000_000);
      const result = await read().catch(error => { if (!transientProductReadError(error)) throw error; return read(); });
      if (!/text\/html|application\/xhtml\+xml/i.test(result.contentType)) throw new Error("Not an HTML product page.");
      const html=result.bytes.toString("utf8");
      productName=(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||"").replace(/<[^>]*>/g," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim();
      images = extractProductPhotos(html, page);
    } catch {
      let cached = cachedProductGallery(page, productSubject, products, []);
      if (!cached) {
        const saved = await prisma.mediaAsset.findMany({ where: { organizationId: ctx.organizationId, campaignId: p.campaignId, contentItemId: post.id, kind: "product_photo", status: "ready" }, select: { kind: true, url: true, metadata: true } });
        cached = cachedProductGallery(page, productSubject, [], saved);
      }
      if (!cached) return NextResponse.json({ error: "Could not read this product page. Check the address or upload its photos." }, { status: 502 });
      images = cached.images; productName = cached.productName;
      notice = "The product website did not respond. Using this product’s saved website photos. Review the references before generating.";
    }
    if (!images.length) return NextResponse.json({ error: "No product photos were found on this page. Upload the photos you want to use." }, { status: 404 });
    if(!reelPhotoMatchesProduct(productSubject,{metadata:{sourceEvidence:{imageUrl:images[0],sourceUrl:page,title:productName}}})) return NextResponse.json({error:"This page does not match the product named in the post. Choose its exact product page."},{status:400});
    const sources = [];
    for (let index = 0; index < images.length; index++) {
      const url = images[index], id = `reel-photo-${createHash("sha256").update(JSON.stringify([ctx.organizationId, post.id, photoKey(url)])).digest("hex").slice(0, 40)}`;
      const metadata = { sourceEvidence:{imageUrl:url,sourceUrl:page,title:productName}, productName, sourceUrl: page, label: `Product photo ${index + 1}` };
      await prisma.mediaAsset.upsert({ where: { id }, create: { id, organizationId: ctx.organizationId, campaignId: p.campaignId, contentItemId: post.id, kind: "product_photo", provider: "product-website", status: "ready", url, metadata }, update: { url, metadata } });
      sources.push({ id, productVerified:true, kind: "image", src: `/api/reels/media?assetId=${id}`, contentItemId: post.id, label: metadata.label });
    }
    return NextResponse.json({ sources, sourceUrl: page, ...(notice ? { notice } : {}) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error, "Could not load product photos. Try again or upload them."); }
}
