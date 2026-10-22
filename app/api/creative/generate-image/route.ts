import {saveGeneratedPhoto} from "@/lib/creative/image-history";
import { NextResponse } from "next/server";
import { z } from "zod";
import {generateImage, ImagePendingError} from "@/lib/ai/image-provider";
export const maxDuration=180;
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { occasionVisualConcept, savedPostOccasion } from "@/lib/ai/occasion";
import { buildVisualDirection } from "@/lib/ai/visual-director";
import { buildVisualConcept } from "@/lib/ai/visual-plan";
import { recentBrandConcepts } from "@/lib/ai/visual-history";

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
    const brand = contentItem.campaign.brand;
    const onboarding = await prisma.onboardingState.findUnique({ where: { organizationId: ctx.organizationId }, select: { businessType: true } });
    const businessContext = { businessType: onboarding?.businessType, industry: brand.industry, description: brand.description, targetAudience: brand.targetAudience };
    const recentConcepts = await recentBrandConcepts(ctx.organizationId, brand.id);
    let occasion: string | undefined;
    if (contentItem.type === "holiday_post") {
      const planningJob = await prisma.job.findFirst({where:{organizationId:ctx.organizationId,type:"CREATE_EVERYTHING",status:"succeeded",payload:{path:["campaignId"],equals:p.data.campaignId}},orderBy:{createdAt:"desc"},select:{payload:true,result:true}});
      occasion = savedPostOccasion(planningJob?.payload,planningJob?.result,contentItem) || contentItem.headline || "This post's special day";
    }
    const concept = occasion ? occasionVisualConcept(occasion) : buildVisualConcept({ businessContext, variationIndex: recentConcepts.length, recentConcepts });
    const prompt = buildVisualDirection({ brand, businessContext, occasion, campaignGoal: contentItem.campaign.goal, headline: contentItem.headline, contentType: contentItem.type, platform: contentItem.platform, visualDirection: p.data.prompt, visualConcept: concept, recentConcepts, variationIndex: recentConcepts.length });

    const generated = await generateImage({organizationId:ctx.organizationId,requestId:`manual:${p.data.contentItemId}:${p.data.requestId}`,prompt,requestDescription:p.data.prompt,format:p.data.format});
    const base64=generated.base64;

    const dataUrl = `data:image/png;base64,${base64}`;

    const assetData = {
      organizationId: ctx.organizationId,
      campaignId: p.data.campaignId,
      contentItemId: p.data.contentItemId,
      kind: "ai_image",
      provider: generated.provider,
      status: "ready",
      url: dataUrl,
      prompt,
      metadata: {
        model: generated.model,
        format: p.data.format,
        ...(generated.size ? {size:generated.size} : {}),
        subjectCategory: concept.subjectCategory,
        occasion: occasion || null,
      },
    };

    // Keep every paid generation available for later reuse instead of overwriting it.
    const asset = await saveGeneratedPhoto(assetData);

    await prisma.job.create({ data: {
      organizationId: ctx.organizationId, type: "GENERATE_IMAGE", status: "succeeded", progress: 100,
      payload: { campaignId: p.data.campaignId, contentItemId: p.data.contentItemId, visualConcept: concept, occasion: occasion || null, originalDirection: p.data.prompt, format: p.data.format },
      result: { assetId: asset.id, regenerated: true },
    } });

    return NextResponse.json({
      assetId: asset.id,
      url: dataUrl,
      format: p.data.format,
    });
  } catch (e) {
    if(e instanceof ImagePendingError)return NextResponse.json({error:e.message},{status:409});
    const message =
      e instanceof Error ? e.message : "IMAGE_GENERATION_FAILED";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
