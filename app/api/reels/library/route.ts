import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";

// Browse existing assets only. Reuse never invokes an image provider or debits credits.
export async function GET(req: Request) {
  try {
    const ctx = await tenantContext();
    const query = new URL(req.url).searchParams;
    if (query.get("organizationId") !== ctx.organizationId) return NextResponse.json({ error: "Your workspace changed. Refresh the reel editor." }, { status: 409 });
    const campaignId = query.get("campaignId");
    if (!campaignId) return NextResponse.json({ error: "Choose a campaign first." }, { status: 400 });
    const current = await prisma.campaign.findFirst({ where: { id: campaignId, brand: { organizationId: ctx.organizationId } }, select: { brandId: true, brand: { select: { name: true } } } });
    if (!current) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
    const page = Number(query.get("page") || 1);
    const search = (query.get("q") || "").trim();
    if (!Number.isInteger(page) || page < 1 || page > 1000 || search.length > 120) return NextResponse.json({ error: "Invalid photo search." }, { status: 400 });
    const campaigns = await prisma.campaign.findMany({ where: { brandId: current.brandId, brand: { organizationId: ctx.organizationId } }, select: { id: true, title: true } });
    const ids = campaigns.map(campaign => campaign.id);
    const posts = await prisma.contentItem.findMany({ where: { campaignId: { in: ids }, ...(search ? { OR: [{ headline: { contains: search, mode: "insensitive" as const } }, { caption: { contains: search, mode: "insensitive" as const } }] } : {}) }, select: { id: true, headline: true } });
    const assets = await prisma.mediaAsset.findMany({
      where: {
        organizationId: ctx.organizationId, campaignId: { in: ids }, status: "ready", url: { not: null },
        kind: { in: ["ai_image", "product_photo", "reel_scene_image"] },
        ...(search ? { OR: [
          { prompt: { contains: search, mode: "insensitive" as const } },
          { contentItemId: { in: posts.map(post => post.id) } },
          { campaignId: { in: campaigns.filter(campaign => campaign.title.toLowerCase().includes(search.toLowerCase())).map(campaign => campaign.id) } },
        ] } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * 24, take: 25,
      select: { id: true, campaignId: true, contentItemId: true, kind: true, metadata: true },
    });
    return NextResponse.json({ brandName: current.brand.name, page, hasMore: assets.length > 24, sources: assets.slice(0, 24).map(asset => {
      const src = `/api/reels/media?assetId=${encodeURIComponent(asset.id)}&campaignId=${encodeURIComponent(campaignId)}`;
      const label = typeof (asset.metadata as { label?: string })?.label === "string" ? (asset.metadata as { label: string }).label : posts.find(post => post.id === asset.contentItemId)?.headline || (asset.kind === "product_photo" ? "Product photo" : "Generated photo");
      return { id: asset.id, src, thumbnail: `${src}&thumbnail=1`, kind: "image", contentItemId: asset.contentItemId, libraryBrandId: current.brandId, label, campaignTitle: campaigns.find(campaign => campaign.id === asset.campaignId)?.title || "Past campaign" };
    }) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error, "Could not load past campaign photos."); }
}
