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
    const postId = new URL(req.url).searchParams.get("contentItemId");
    if (postId && !campaign.items.some(item => item.id === postId)) return NextResponse.json({ error: "Post not found in this campaign." }, { status: 404 });
    const assets = await prisma.mediaAsset.findMany({ where: { campaignId: id, organizationId: ctx.organizationId, ...(postId ? { contentItemId: postId } : {}), status: "ready", kind: { in: ["ai_image", "product_photo", "reel_scene_image", "campaign_video"] } }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, kind: true, contentItemId: true, metadata: true } });
    // Keep the saved post image first; imported galleries must not silently replace it.
    assets.sort((a, b) => {
      const priority = (kind: string) => kind === "ai_image" ? 0 : kind === "product_photo" ? 1 : 2;
      const order = priority(a.kind) - priority(b.kind);
      if (order || a.kind !== "product_photo") return order;
      return String((a.metadata as {label?:string})?.label || "").localeCompare(String((b.metadata as {label?:string})?.label || ""), "en", { numeric: true });
    });
    const planningJob=await prisma.job.findFirst({where:{organizationId:ctx.organizationId,type:"CREATE_EVERYTHING",status:"succeeded",payload:{path:["campaignId"],equals:id}},orderBy:{createdAt:"desc"},select:{result:true}});
    const planned=(planningJob?.result as {posts?:Array<{headline?:string;caption?:string;type?:string;visualDirection?:string}>})?.posts||[];
    const posts=campaign.items.filter(item=>item.type!=="story").map(item=>({...item,visualDirection:planned.find(post=>post.headline===item.headline && post.caption===item.caption && post.type===item.type)?.visualDirection||null}));
    return NextResponse.json({ organizationId: ctx.organizationId, campaign: { id: campaign.id, title: campaign.title }, brand: { name: campaign.brand.name, color: campaign.brand.primaryColor || "#132342", accent: campaign.brand.accentColor || "#dec184", website: campaign.brand.websiteUrl || "", logo: campaign.brand.logoUrl ? `/api/reels/media?brandId=${campaign.brand.id}` : undefined }, posts, sources: assets.map(asset => ({ id: asset.id, kind: asset.kind !== "campaign_video" ? "image" : "video", src: asset.kind !== "campaign_video" ? `/api/reels/media?assetId=${asset.id}` : `/api/video/media/${asset.id}`, contentItemId: asset.contentItemId, sceneId: typeof (asset.metadata as {sceneId?:string})?.sceneId === "string" ? (asset.metadata as {sceneId:string}).sceneId : undefined, label: typeof (asset.metadata as {label?:string})?.label === "string" ? (asset.metadata as {label:string}).label : asset.kind === "campaign_video" ? "Post video" : "Post photo", seconds: typeof (asset.metadata as {duration?:number})?.duration === "number" ? Math.min(15,Math.max(3,(asset.metadata as {duration:number}).duration)) : undefined })) });
  } catch (error) { return apiError(error, "Could not load reel sources."); }
}
