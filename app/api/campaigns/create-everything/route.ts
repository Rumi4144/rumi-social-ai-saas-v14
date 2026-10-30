import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { spendCredits } from "@/lib/services/credits";
import { tenantContext } from "@/lib/auth/context";
import { z } from "zod";
import { verifyPhotoEvidence } from "@/lib/campaign/photo-matching";
import { buildContentPlan, buildQuantityContentPlan, applyCampaignTopics } from "@/lib/campaign/content-plan";

import {campaignSetupPhotos} from "@/lib/campaign/setup-photos";

const S = z.object({
  organizationId: z.string().optional(),
  brandId: z.string().optional(),
  brief: z.string().min(10),
  goal: z.string().default("launch"),
  campaignTopics: z.array(z.string().trim().min(1).max(160)).max(60).default([]),
  days: z.number().int().min(1).max(30).default(14),
  photoSource: z.enum(["website", "ai", "none", "saved", "upload"]).default("ai"),
  campaignPhotoIds: z.array(z.string().min(1)).max(20).default([]),
  contentQuantities: z.object({post:z.number().int().min(0).max(30),reel_post:z.number().int().min(0).max(30),story_post:z.number().int().min(0).max(30),presenter_post:z.number().int().min(0).max(30)}).optional(),
  extraSpecialDays: z.array(z.object({date:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),label:z.string().trim().min(1).max(100)})).max(30).default([]),
  photoReceipt: z.string().max(160000).optional(),
  imageUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).max(60).optional(),
  dailyPlan: z.array(
    z.object({
      day: z.number().int().min(1).max(30),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      specialDay: z.string().max(100).nullable().optional(),
      contentType: z.enum(["post", "reel_post", "presenter_post", "story_post"]).default("post"),
      platforms: z.array(
        z.enum([
          "facebook",
          "instagram",
          "threads",
          "linkedin",
          "tiktok",
          "youtube",
          "google_business",
        ])
      ),
    })
  ).max(30).optional(),
});

export async function POST(req: Request) {
  const p = S.safeParse(await req.json());

  if (!p.success) {
    return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  }

  try {
    let contentPlan;
    try {
      if (p.data.dailyPlan?.length) contentPlan = p.data.contentQuantities ? buildQuantityContentPlan(p.data.dailyPlan, p.data.days, p.data.contentQuantities, p.data.extraSpecialDays) : buildContentPlan(p.data.dailyPlan, p.data.days, p.data.extraSpecialDays);
      else if (p.data.contentQuantities || p.data.extraSpecialDays.length) throw new Error("Supply a complete campaign calendar for special-day posts.");
      if(p.data.campaignTopics.length){if(!contentPlan)throw new Error("Supply a campaign calendar for mixed topics.");contentPlan=applyCampaignTopics(contentPlan,p.data.campaignTopics);}
    } catch (error) { return NextResponse.json({error:error instanceof Error?error.message:"Invalid campaign plan."},{status:400}); }
    const ctx = await tenantContext();
    if (!ctx.isSuperAdmin) return NextResponse.json({ error: "Campaign design is managed in Admin. Prepare your seven-day pack from This Week." }, { status: 403 });
    if (p.data.organizationId && p.data.organizationId !== ctx.organizationId) return NextResponse.json({error:"Your selected workspace changed. Refresh this page before creating the campaign."},{status:409});

    let brand;

    if (p.data.brandId) {
      brand = await prisma.brand.findFirst({
        where: {
          id: p.data.brandId,
          organizationId: ctx.organizationId,
        },
      });
    } else {
      brand = await prisma.brand.findFirst({
        where: {
          organizationId: ctx.organizationId,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }

    if (!brand) {
      return NextResponse.json(
        { error: "No Brand Brain found for this workspace" },
        { status: 404 },
      );
    }

    if(ctx.role === "viewer") return NextResponse.json({error:"Your role cannot create campaigns."},{status:403});
    const usingSaved = ["saved","upload"].includes(p.data.photoSource);
    if(usingSaved){
      if(!p.data.campaignPhotoIds.length)return NextResponse.json({error:"Select at least one photo for this campaign."},{status:400});
      try{await campaignSetupPhotos(prisma,ctx.organizationId,brand.id,p.data.campaignPhotoIds);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Choose photos again."},{status:400});}
    }
    let websitePhotoEvidence;
    try { websitePhotoEvidence = p.data.photoReceipt && brand.websiteUrl ? verifyPhotoEvidence(p.data.photoReceipt, ctx.organizationId, brand.websiteUrl) : []; }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Find website photos again." }, { status: 400 }); }

    const onboarding = await prisma.onboardingState.findUnique({
      where: {
        organizationId: ctx.organizationId,
      },
      select: {
        businessType: true,
        website: true,
        goal: true,
      },
    });

    const campaign = await prisma.campaign.create({
      data: {
        brandId: brand.id,
        title: p.data.brief.slice(0, 70),
        goal: p.data.goal,
        status: "generating",
      },
    });

    await spendCredits(
      ctx.organizationId,
      p.data.photoSource === "ai" ? 3 : 1,
      p.data.photoSource === "website"
        ? "campaign_generation_website_photo"
        : "campaign_generation",
      campaign.id,
    );

    const job = await prisma.job.create({
      data: {
        organizationId: ctx.organizationId,
        type: "CREATE_EVERYTHING",
        payload: {
          campaignId: campaign.id,
          brief: p.data.brief,
          goal: p.data.goal,
          days: p.data.days,
          dailyPlan: p.data.dailyPlan ?? [],
          contentPlan,
          photoSource: usingSaved ? "none" : p.data.photoSource,
          campaignPhotoIds: usingSaved ? p.data.campaignPhotoIds : [],
          imageUrl: p.data.imageUrl,
          imageUrls: p.data.imageUrls,
          websitePhotoEvidence,
          brandContext: {
            name: brand.name,
            voice: brand.voice,
            positioning: brand.positioning,
            industry: brand.industry,
            description: brand.description,
            targetAudience: brand.targetAudience,
            contentGoals: brand.contentGoals ?? onboarding?.goal ?? null,
            website: brand.websiteUrl ?? onboarding?.website ?? null,
            postingFrequency: brand.postingFrequency,
            approvalRequired: brand.approvalRequired,
            businessType: onboarding?.businessType ?? null,
            primaryGoal: onboarding?.goal ?? null,
          },
        },
      },
    });

    return NextResponse.json(
      {
        campaignId: campaign.id,
        jobId: job.id,
        brandId: brand.id,
        status: "queued",
      },
      { status: 202 },
    );
  } catch (e) {
    const m = e instanceof Error ? e.message : "Unable to queue campaign";

    return NextResponse.json(
      { error: m },
      {
        status: m === "UNAUTHENTICATED" ? 401 : m === "FORBIDDEN" ? 403 : 402,
      },
    );
  }
}
