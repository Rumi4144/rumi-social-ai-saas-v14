import { NextResponse } from "next/server";
import { z } from "zod";
import {generateImage, ImagePendingError} from "@/lib/ai/image-provider";
export const maxDuration=180;
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { occasionVisualConcept, savedPostOccasion } from "@/lib/ai/occasion";
import { buildVisualDirection } from "@/lib/ai/visual-director";
import { buildVisualConcept } from "@/lib/ai/visual-plan";
import { recentBrandConcepts, regenerationVariationIndex } from "@/lib/ai/visual-history";

const S = z.object({
  requestId: z.string().uuid(),
  campaignId: z.string().optional(),
  contentItemId: z.string().optional(),
  prompt: z.string().min(10),
  format: z.enum(["square", "portrait", "story"]).default("square"),
});

export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer") return NextResponse.json({error:"FORBIDDEN"},{status:403});

    const p = S.safeParse(await req.json());

    if (!p.success) {
      return NextResponse.json(
        { error: p.error.flatten() },
        { status: 400 }
      );
    }

    if (!p.data.campaignId || !p.data.contentItemId) {
      return NextResponse.json({ error: "CAMPAIGN_AND_CONTENT_REQUIRED" }, { status: 400 });
    }
    const contentItem = await prisma.contentItem.findFirst({
      where: { id: p.data.contentItemId, campaignId: p.data.campaignId, campaign: { brand: { organizationId: ctx.organizationId } } },
      include: { campaign: { include: { brand: true } } },
    });
    if (!contentItem) return NextResponse.json({ error: "CONTENT_NOT_FOUND" }, { status: 404 });
    const delivery = await prisma.publishJob.findFirst({where: {organizationId: ctx.organizationId, contentItemId: contentItem.id, status: {in: ['scheduled', 'retry', 'publishing', 'published']}}});
    if (delivery || ['scheduled', 'published'].includes(contentItem.status)) return NextResponse.json({error: 'Cancel scheduled posting before changing this photo.'}, {status: 409});
    const brand = contentItem.campaign.brand;
    const onboarding = await prisma.onboardingState.findUnique({ where: { organizationId: ctx.organizationId }, select: { businessType: true } });
    const businessContext = { businessType: onboarding?.businessType, industry: brand.industry, description: brand.description, targetAudience: brand.targetAudience };
    const recentConcepts = await recentBrandConcepts(ctx.organizationId, brand.id);
    let occasion: string | undefined;
    if (contentItem.type === "holiday_post") {
      const planningJob = await prisma.job.findFirst({where:{organizationId:ctx.organizationId,type:"CREATE_EVERYTHING",status:"succeeded",payload:{path:["campaignId"],equals:p.data.campaignId}},orderBy:{createdAt:"desc"},select:{payload:true,result:true}});
      occasion = savedPostOccasion(planningJob?.payload,planningJob?.result,contentItem) || contentItem.headline || "This post's special day";
    }
    const priorPlan = await prisma.job.findFirst({
      where: { organizationId: ctx.organizationId, type: "GENERATE_IMAGE", payload: { path: ["contentItemId"], equals: contentItem.id } },
      orderBy: { createdAt: "desc" }, select: { payload: true },
    });
    const savedConcept = (priorPlan?.payload as { visualConcept?: Parameters<typeof regenerationVariationIndex>[1] } | undefined)?.visualConcept;
    const campaignPosts = await prisma.contentItem.findMany({
      where: { campaignId: contentItem.campaignId || p.data.campaignId, campaign: { brand: { organizationId: ctx.organizationId } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true },
    });
    const variationIndex = regenerationVariationIndex(contentItem.id, savedConcept, campaignPosts.findIndex(post => post.id === contentItem.id));
    const concept = occasion ? occasionVisualConcept(occasion) : buildVisualConcept({ businessContext, variationIndex, recentConcepts });
    const prompt = buildVisualDirection({ brand, businessContext, occasion, campaignGoal: contentItem.campaign.goal, headline: contentItem.headline, contentType: contentItem.type, platform: contentItem.platform, visualDirection: p.data.prompt, visualConcept: concept, recentConcepts, variationIndex });

    const generated = await generateImage({organizationId:ctx.organizationId,requestId:`manual:${p.data.contentItemId}:${p.data.requestId}`,prompt,requestDescription:p.data.prompt,format:p.data.format});
    const {selectReviewedPhoto} = await import('@/lib/ai/reviewed-photo');
    const reviewed = await selectReviewedPhoto({
      organizationId: ctx.organizationId,
      campaignId: p.data.campaignId,
      contentItemId: p.data.contentItemId,
      requestId: `manual:${p.data.contentItemId}:${p.data.requestId}`,
      generated, prompt, format: p.data.format, previousMediaUrl: contentItem.mediaUrl,
      context: {brandId: brand.id, brandName: brand.name, headline: contentItem.headline || '', caption: contentItem.caption || '',
        business: [brand.industry, brand.description].filter(Boolean).join(': '), audience: brand.targetAudience || '', voice: brand.voice || '',
        visualRules: brand.visualRules || '', goal: contentItem.campaign.goal || '', occasion: occasion || '', direction: p.data.prompt},
      metadata: {
        subjectCategory: concept.subjectCategory,
        occasion: occasion || null,
      },
    });
    const asset = reviewed.asset;

    await prisma.job.create({ data: {
      organizationId: ctx.organizationId, type: "GENERATE_IMAGE", status: "succeeded", progress: 100,
      payload: { campaignId: p.data.campaignId, contentItemId: p.data.contentItemId, visualConcept: concept, occasion: occasion || null, originalDirection: p.data.prompt, format: p.data.format },
      result: { assetId: asset.id, regenerated: true },
    } });

    return NextResponse.json({
      assetId: asset.id,
      url: asset.url,
      format: p.data.format,
      needsReview: !reviewed.selected,
      review: reviewed.review,
    });
  } catch (e) {
    if(e instanceof ImagePendingError)return NextResponse.json({error:e.message,pending:true},{status:202});
    const message =
      e instanceof Error ? e.message : "IMAGE_GENERATION_FAILED";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
