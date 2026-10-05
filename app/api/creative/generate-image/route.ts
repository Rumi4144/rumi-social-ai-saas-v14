import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { buildVisualDirection } from "@/lib/ai/visual-director";
import { buildVisualConcept } from "@/lib/ai/visual-plan";
import { recentBrandConcepts } from "@/lib/ai/visual-history";

const S = z.object({
  campaignId: z.string().optional(),
  contentItemId: z.string().optional(),
  prompt: z.string().min(10),
  format: z.enum(["square", "portrait", "story"]).default("square"),
});

export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();

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
    const concept = buildVisualConcept({ businessContext, variationIndex: recentConcepts.length, recentConcepts });
    const prompt = buildVisualDirection({ brand, businessContext, campaignGoal: contentItem.campaign.goal, headline: contentItem.headline, contentType: contentItem.type, platform: contentItem.platform, visualDirection: p.data.prompt, visualConcept: concept, recentConcepts, variationIndex: recentConcepts.length });

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY_MISSING" },
        { status: 500 }
      );
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const size =
      p.data.format === "square"
        ? "1024x1024"
        : "1024x1536";

    const result = await client.images.generate({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt,
      size,
      quality: "medium",
      output_format: "png",
      n: 1,
    });

    const base64 = result.data?.[0]?.b64_json;

    if (!base64) {
      throw new Error("IMAGE_GENERATION_EMPTY");
    }

    const dataUrl = `data:image/png;base64,${base64}`;

    const existingAsset = p.data.contentItemId
      ? await prisma.mediaAsset.findFirst({
          where: {
            organizationId: ctx.organizationId,
            contentItemId: p.data.contentItemId,
            kind: "ai_image",
            provider: "openai",
          },
          orderBy: {
            createdAt: "desc",
          },
        })
      : null;

    const assetData = {
      organizationId: ctx.organizationId,
      campaignId: p.data.campaignId,
      contentItemId: p.data.contentItemId,
      kind: "ai_image",
      provider: "openai",
      status: "ready",
      url: dataUrl,
      prompt,
      metadata: {
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
        format: p.data.format,
        size,
        subjectCategory: concept.subjectCategory,
      },
    };

    const asset = existingAsset
      ? await prisma.mediaAsset.update({
          where: { id: existingAsset.id },
          data: assetData,
        })
      : await prisma.mediaAsset.create({
          data: assetData,
        });

    await prisma.job.create({ data: {
      organizationId: ctx.organizationId, type: "GENERATE_IMAGE", status: "succeeded", progress: 100,
      payload: { campaignId: p.data.campaignId, contentItemId: p.data.contentItemId, visualConcept: concept, originalDirection: p.data.prompt, format: p.data.format },
      result: { assetId: asset.id, regenerated: true },
    } });

    return NextResponse.json({
      assetId: asset.id,
      url: dataUrl,
      format: p.data.format,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "IMAGE_GENERATION_FAILED";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
