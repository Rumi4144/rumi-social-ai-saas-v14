import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { savedPostOccasion } from "@/lib/ai/occasion";
import { automaticReelPlan, type AutoPlanPost } from "@/lib/reels/auto-plan";

const schema = z.object({ organizationId: z.string().min(1).max(200), campaignId: z.string().min(1).max(200), contentItemId: z.string().min(1).max(200) });
export async function POST(req: Request) {
  let step = "checking your workspace";
  try {
    const ctx = await tenantContext();
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Choose a workspace, campaign and post first." }, { status: 400 });
    const p = parsed.data;
    if (p.organizationId !== ctx.organizationId) return NextResponse.json({ error: "Your workspace changed. Reopen this reel first." }, { status: 409 });
    // Resolve ownership and campaign membership before reading any media or jobs.
    step = "loading the selected post";
    const post = await prisma.contentItem.findFirst({ where: { id: p.contentItemId, campaignId: p.campaignId, campaign: { brand: { organizationId: ctx.organizationId } } }, include: { campaign: { include: { brand: true } } } });
    if (!post) return NextResponse.json({ error: "Post not found in this campaign and workspace." }, { status: 404 });
    const brandRecord = post.campaign.brand;
    step = "loading this brand’s campaigns";
    const campaigns = await prisma.campaign.findMany({ where: { brandId: brandRecord.id, brand: { organizationId: ctx.organizationId } }, select: { id: true } });
    const ids = campaigns.map(campaign => campaign.id);
    step = "loading saved photos and captions";
    const read = async <T,>(label: string, promise: PromiseLike<T>): Promise<T> => {
      try { return await promise; }
      catch (error) { throw Object.assign(new Error("Reel source read failed", { cause: error }), { reelStep: label }); }
    };
    const [assets, posts, jobs] = await Promise.all([
      read("loading saved photo details", prisma.mediaAsset.findMany({ where: { organizationId: ctx.organizationId, campaignId: { in: ids }, status: "ready", url: { not: null }, kind: { in: ["ai_image", "product_photo", "reel_scene_image"] } }, select: { id: true, organizationId: true, campaignId: true, contentItemId: true, kind: true, status: true, prompt: true, metadata: true }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] })),
      read("loading saved captions", prisma.contentItem.findMany({ where: { campaignId: { in: ids } }, select: { id: true, campaignId: true, type: true, headline: true, caption: true } })),
      read("loading saved campaign history", prisma.job.findMany({ where: { organizationId: ctx.organizationId, type: "CREATE_EVERYTHING", status: "succeeded", OR: ids.map(id => ({ payload: { path: ["campaignId"], equals: id } })) }, select: { payload: true, result: true }, orderBy: { createdAt: "desc" } })),
    ]);
    // Generated photos are stored as multi-megabyte data URLs. Planning needs
    // their identity, not their pixels: hash them in PostgreSQL so the photo
    // library never travels through the query engine as one enormous response.
    step = "identifying saved photos";
    const identities = assets.length ? await prisma.$queryRaw<Array<{ id: string; url: string }>>(Prisma.sql`
      SELECT "id", CASE WHEN "url" LIKE 'data:%' THEN 'saved-photo:' || md5("url") ELSE "url" END AS "url"
      FROM "MediaAsset"
      WHERE "organizationId" = ${ctx.organizationId} AND "id" IN (${Prisma.join(assets.map(asset => asset.id))})
    `) : [];
    const photoUrls = new Map(identities.map(asset => [asset.id, asset.url]));
    step = "reading the saved campaign plan";
    function enrich(item: { id: string; campaignId: string; type: string; headline: string | null; caption: string | null }): AutoPlanPost {
      const job = jobs.find(job => (job.payload as { campaignId?: string })?.campaignId === item.campaignId);
      const planned = (job?.result as { posts?: Array<{ type?: string; headline?: string; caption?: string; visualDirection?: string }> })?.posts;
      const direction = Array.isArray(planned) ? planned.find(saved => saved.type === item.type && saved.headline === item.headline && saved.caption === item.caption)?.visualDirection : undefined;
      return { id: item.id, type: item.type, headline: item.headline, caption: item.caption, visualDirection: direction, occasion: savedPostOccasion(job?.payload, job?.result, item) };
    }
    const sourcePosts = new Map(posts.map(item => [item.id, enrich(item)]));
    const brand = { id: brandRecord.id, name: brandRecord.name, industry: brandRecord.industry, designStyle: brandRecord.designStyle, color: brandRecord.primaryColor || "#132342", accent: brandRecord.accentColor || "#dec184", website: brandRecord.websiteUrl || "", ...(brandRecord.logoUrl ? { logo: `/api/reels/media?brandId=${encodeURIComponent(brandRecord.id)}` } : {}) };
    const enrichedPost = enrich(post);
    step = "arranging the reel scenes";
    const plan = automaticReelPlan({ organizationId: ctx.organizationId, campaignId: post.campaignId, brand, post: enrichedPost, assets: assets.filter(asset => asset.campaignId && ids.includes(asset.campaignId)).map(asset => ({ ...asset, url: photoUrls.get(asset.id) || null, campaignId: asset.campaignId!, brandId: brand.id, post: asset.contentItemId ? sourcePosts.get(asset.contentItemId) : undefined })) });
    return NextResponse.json({ organizationId: ctx.organizationId, campaign: { id: post.campaign.id, title: post.campaign.title }, post: { id: post.id, headline: post.headline, caption: post.caption }, brand, ...plan }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error && typeof error === "object" && "reelStep" in error && typeof error.reelStep === "string") {
      step = error.reelStep;
      error = error instanceof Error ? error.cause : error;
    }
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^P\d{4}$/.test(error.code) ? error.code : undefined;
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error("Automatic reel failed", { step, name, code });
    return apiError(error, `Reel draft failed while ${step}. Please report this message${code ? ` (${code})` : ""}.`);
  }
}
