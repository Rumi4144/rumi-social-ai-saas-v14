import { reelProductSubject, reelPhotoMatchesProduct } from "@/lib/reels/product-identity";
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
    const assets = await prisma.mediaAsset.findMany({ where: { campaignId: id, organizationId: ctx.organizationId, ...(postId ? { contentItemId: postId } : {}), status: "ready", kind: { in: ["ai_image", "product_photo", "reel_scene_image", "campaign_video"] } }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, kind: true, provider: true, contentItemId: true, metadata: true } });
    // Keep the saved post image first; imported galleries must not silently replace it.
    assets.sort((a, b) => {
      const priority = (kind: string) => kind === "ai_image" ? 0 : kind === "product_photo" ? 1 : 2;
      const order = priority(a.kind) - priority(b.kind);
      if (order || a.kind !== "product_photo") return order;
      return String((a.metadata as {label?:string})?.label || "").localeCompare(String((b.metadata as {label?:string})?.label || ""), "en", { numeric: true });
    });
    const planningJob=await prisma.job.findFirst({where:{organizationId:ctx.organizationId,type:"CREATE_EVERYTHING",status:"succeeded",payload:{path:["campaignId"],equals:id}},orderBy:{createdAt:"desc"},select:{result:true,payload:true}});
    const planned=(planningJob?.result as {posts?:Array<{headline?:string;caption?:string;type?:string;visualDirection?:string}>})?.posts||[];
    const posts=campaign.items.filter(item=>item.type!=="story").map(item=>{
      const saved=planned.find(post=>post.headline===item.headline && post.caption===item.caption && post.type===item.type);
      const slots=(planningJob?.payload as {contentPlan?:Array<{planKey?:string;topics?:string[]}>})?.contentPlan;
      const key=(saved as {planKey?:string})?.planKey;
      const topics=key && Array.isArray(slots) ? slots.find(slot=>slot.planKey===key)?.topics : undefined;
      return {...item,visualDirection:saved?.visualDirection||null,productSubject:reelProductSubject({...item,topics},campaign.brand)};
    });
    const productForAsset=(asset:typeof assets[number])=>posts.find(post=>post.id===asset.contentItemId)?.productSubject;
    const visibleAssets=assets.filter(asset=>asset.kind==="campaign_video" || reelPhotoMatchesProduct(productForAsset(asset),asset));
    const productVerified=(asset:typeof assets[number])=>!productForAsset(asset) || (asset.kind==="campaign_video" ? (asset.metadata as {productSubject?:string})?.productSubject===productForAsset(asset) : true);

    return NextResponse.json({ organizationId: ctx.organizationId, campaign: { id: campaign.id, title: campaign.title }, brand: { id: campaign.brand.id, name: campaign.brand.name, industry: campaign.brand.industry, color: campaign.brand.primaryColor || "#132342", accent: campaign.brand.accentColor || "#dec184", website: campaign.brand.websiteUrl || "", logo: campaign.brand.logoUrl ? `/api/reels/media?brandId=${campaign.brand.id}` : undefined }, posts, savedReels: visibleAssets.filter(asset => productVerified(asset) && asset.kind === "campaign_video" && asset.provider === "reel-editor" && (asset.metadata as {contentType?:string})?.contentType === "video/mp4").map(asset => ({id: asset.id, contentItemId: asset.contentItemId})), sources: visibleAssets.map(asset => ({ productVerified: productVerified(asset), id: asset.id, kind: asset.kind !== "campaign_video" ? "image" : "video", src: asset.kind !== "campaign_video" ? `/api/reels/media?assetId=${asset.id}` : `/api/video/media/${asset.id}`, contentItemId: asset.contentItemId, sceneId: typeof (asset.metadata as {sceneId?:string})?.sceneId === "string" ? (asset.metadata as {sceneId:string}).sceneId : undefined, label: typeof (asset.metadata as {label?:string})?.label === "string" ? (asset.metadata as {label:string}).label : asset.kind === "campaign_video" ? "Post video" : "Post photo", seconds: typeof (asset.metadata as {duration?:number})?.duration === "number" ? Math.min(15,Math.max(3,(asset.metadata as {duration:number}).duration)) : undefined })) });
  } catch (error) { return apiError(error, "Could not load reel sources."); }
}
