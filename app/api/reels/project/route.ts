import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
export async function GET(req: Request) {
  try {
    const ctx = await tenantContext();
    const id = new URL(req.url).searchParams.get("campaignId");
    if (!id) return NextResponse.json({ campaigns: await prisma.campaign.findMany({ where: { brand: { organizationId: ctx.organizationId } }, select: { id: true, title: true }, orderBy: { createdAt: "desc" }, take: 100 }) });
    const campaign = await prisma.campaign.findFirst({ where: { id, brand: { organizationId: ctx.organizationId } }, include: { brand: true, items: { select: { id: true, headline: true, caption: true, type: true } } } });
    if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    const assets = await prisma.mediaAsset.findMany({ where: { campaignId: id, organizationId: ctx.organizationId, status: "ready", kind: { in: ["ai_image", "campaign_video"] } }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, kind: true, contentItemId: true, metadata: true } });
    return NextResponse.json({ organizationId: ctx.organizationId, campaign: { id: campaign.id, title: campaign.title }, brand: { name: campaign.brand.name, color: campaign.brand.primaryColor || "#132342", accent: campaign.brand.accentColor || "#dec184", website: campaign.brand.websiteUrl || "", logo: campaign.brand.logoUrl ? `/api/reels/media?brandId=${campaign.brand.id}` : undefined }, posts: campaign.items.filter(item => item.type !== "story"), sources: assets.map(asset => ({ id: asset.id, kind: asset.kind === "ai_image" ? "image" : "video", src: asset.kind === "ai_image" ? `/api/reels/media?assetId=${asset.id}` : `/api/video/media/${asset.id}`, contentItemId: asset.contentItemId, seconds: typeof (asset.metadata as {duration?:number})?.duration === "number" ? Math.min(15,Math.max(3,(asset.metadata as {duration:number}).duration)) : undefined })) });
  } catch (error) { return apiError(error, "Could not load reel sources."); }
}
