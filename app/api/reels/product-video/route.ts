import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { runwayConfigured, runwayModel } from "@/lib/video/runway";
import { pageBelongsToBrand, photoKey } from "@/lib/reels/product-photos";
import { reelPhotoMatchesProduct, reelProductSubject } from "@/lib/reels/product-identity";
import { PRODUCT_REEL_COST, productReelShots, type ProductReelPlan } from "@/lib/reels/product-video-plan";
import { productReelView, productScenePayload, startProductScene } from "@/lib/reels/product-video-jobs";

export const maxDuration = 180;
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("plan"), requestId: z.string().uuid(), campaignId: z.string().min(1), contentItemId: z.string().min(1), assetIds: z.array(z.string().min(1)).min(1).max(20) }),
  z.object({ action: z.literal("start"), requestId: z.string().uuid(), campaignId: z.string().min(1), contentItemId: z.string().min(1), consent: z.literal(true), expectedCost: z.literal(PRODUCT_REEL_COST) }),
]);

export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer") return reply({ error: "Your workspace role cannot create product reels." }, 403);
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return reply({ error: "Choose a campaign post and product photos. Review the displayed cost before starting." }, 400);
    const p = parsed.data;
    const existing = await prisma.job.findFirst({ where: { id: p.requestId, organizationId: ctx.organizationId, type: "PRODUCT_REEL" } });
    if (existing) {
      const plan = existing.payload as unknown as ProductReelPlan;
      if (plan.campaignId !== p.campaignId || plan.contentItemId !== p.contentItemId) return reply({ error: "This reel belongs to another post." }, 409);
      if (p.action === "plan") return reply({ job: await productReelView(existing) });
    } else if (p.action === "start") return reply({ error: "Prepare this product reel before generating." }, 404);
    const post = await prisma.contentItem.findFirst({ where: { id: p.contentItemId, campaignId: p.campaignId, campaign: { brand: { organizationId: ctx.organizationId } } }, include: { campaign: { include: { brand: { include: { products: true } } } } } });
    if (!post) return reply({ error: "Post not found in this workspace." }, 404);
    const brand = post.campaign.brand;
    if (p.action === "plan") {
      const assets = await prisma.mediaAsset.findMany({ where: { id: { in: p.assetIds }, organizationId: ctx.organizationId, campaignId: p.campaignId, contentItemId: p.contentItemId, kind: "product_photo", status: "ready" } });
      if (new Set(p.assetIds).size !== assets.length) return reply({ error: "Use website photos imported for this exact post." }, 400);
      const photos = p.assetIds.map(id => assets.find(asset => asset.id === id)!);
      const metadata = photos[0].metadata as { productName?: string; sourceUrl?: string } | null;
      const sourceUrl = metadata?.sourceUrl || "", productName = metadata?.productName?.trim().slice(0, 180) || "";
      if (!productName || !pageBelongsToBrand(sourceUrl, brand.websiteUrl || "", brand.products)) return reply({ error: "This page needs a product name and photos. Use its exact product page." }, 400);
      const subject = reelProductSubject(post, brand);
      if (photos.some(asset => !asset.url || (asset.metadata as { sourceUrl?: string })?.sourceUrl !== sourceUrl || !reelPhotoMatchesProduct(subject, asset))) return reply({ error: "All reference photos must show this post’s product and come from the same product page." }, 400);
      const seen = new Set<string>();
      const references = photos.filter(asset => { const key = photoKey(asset.url!); if (seen.has(key)) return false; seen.add(key); return true; });
      const plan: ProductReelPlan = { campaignId: p.campaignId, contentItemId: p.contentItemId, sourceUrl, productName, productSubject: subject,
        brand: { name: brand.name, website: brand.websiteUrl || "", industry: brand.industry, color: brand.primaryColor || "#132342", accent: brand.accentColor || "#dec184", ...(brand.logoUrl ? { logo: `/api/reels/media?brandId=${encodeURIComponent(brand.id)}` } : {}) },
        shots: productReelShots(productName, references.map(asset => ({ id: asset.id, url: asset.url! }))) };
      const job = await prisma.job.create({ data: { id: p.requestId, organizationId: ctx.organizationId, type: "PRODUCT_REEL", status: "draft", payload: json(plan) } });
      return reply({ job: await productReelView(job) });
    }
    if (!runwayConfigured()) return reply({ error: "Connect Runway and private video storage before generating. No credits were charged." }, 503);
    const plan = existing!.payload as unknown as ProductReelPlan;
    // A single transaction claims the plan, reserves the exact displayed cost,
    // and records all scene IDs. Retrying never creates a second paid batch.
    await prisma.$transaction(async tx => {
      const claim = await tx.job.updateMany({ where: { id: existing!.id, organizationId: ctx.organizationId, status: "draft" }, data: { status: "running" } });
      if (!claim.count) return;
      const spent = await tx.subscription.updateMany({ where: { organizationId: ctx.organizationId, credits: { gte: PRODUCT_REEL_COST } }, data: { credits: { decrement: PRODUCT_REEL_COST } } });
      if (!spent.count) throw new Error("INSUFFICIENT_CREDITS");
      const sub = await tx.subscription.findUniqueOrThrow({ where: { organizationId: ctx.organizationId } });
      await tx.creditLedger.create({ data: { organizationId: ctx.organizationId, delta: -PRODUCT_REEL_COST, balanceAfter: sub.credits, reason: "product_reel", referenceId: existing!.id } });
      const sceneIds = plan.shots.map(() => randomUUID());
      for (let index = 0; index < sceneIds.length; index++) await tx.job.create({ data: { id: sceneIds[index], organizationId: ctx.organizationId, type: "RUNWAY_VIDEO", status: "queued", payload: json(productScenePayload(plan, existing!.id, index, runwayModel())) } });
      await tx.job.update({ where: { id: existing!.id }, data: { result: { sceneIds } } });
    });
    const current = await prisma.job.findUniqueOrThrow({ where: { id: existing!.id } });
    const sceneIds = (current.result as { sceneIds: string[] }).sceneIds;
    const children = await prisma.job.findMany({ where: { id: { in: sceneIds }, organizationId: ctx.organizationId, type: "RUNWAY_VIDEO" } });
    const started = await Promise.allSettled(children.map(startProductScene));
    if (started.some(result => result.status === "rejected")) console.error("PRODUCT_REEL_SCENE_SAVE_DELAYED", { jobId: current.id });
    return reply({ job: await productReelView(current) }, 202);
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") return reply({ error: `This reel needs ${PRODUCT_REEL_COST} Rumi credits. No generation was started.` }, 402);
    if ((error as { code?: string })?.code === "P2002") return reply({ error: "This reel request already exists. Check its status before trying again." }, 409);
    return apiError(error, "Could not prepare or start this product reel. Check its status before trying again.");
  }
}

export async function GET(req: Request) {
  try {
    const ctx = await tenantContext(), params = new URL(req.url).searchParams;
    const id = params.get("jobId"), campaignId = params.get("campaignId"), contentItemId = params.get("contentItemId");
    if (!id && (!campaignId || !contentItemId)) return reply({ error: "Choose a campaign post." }, 400);
    const job = await prisma.job.findFirst({ where: { organizationId: ctx.organizationId, type: "PRODUCT_REEL", ...(id ? { id } : { AND: [{ payload: { path: ["campaignId"], equals: campaignId! } }, { payload: { path: ["contentItemId"], equals: contentItemId! } }] }) }, orderBy: { createdAt: "desc" } });
    // GET only refreshes existing tasks; it never starts a paid generation.
    return reply({ job: job ? await productReelView(job, true) : null });
  } catch (error) { return apiError(error, "Could not check this product reel. Your existing generation will not be restarted."); }
}
