import {campaignSetupPhotos,attachSetupPhoto} from "@/lib/campaign/setup-photos";
import { NextResponse } from "next/server";
import {generateImage, ImageRejectedError} from "@/lib/ai/image-provider";
export const maxDuration=180;
import { prisma } from "@/lib/prisma";
import { saveCreativeRevision } from "@/lib/creative/save-revision";
import { recentBrandConcepts, regenerationVariationIndex } from "@/lib/ai/visual-history";
import { generateCampaign } from "@/lib/ai/campaign";
import { applyContentPlan, type ContentSlot } from "@/lib/campaign/content-plan";
import { matchingWebsitePhoto, modelCodes, type PhotoEvidence } from "@/lib/campaign/photo-matching";
import { renderSocialSvg } from "@/lib/render/svg";
import { automaticShowcaseStyle } from "@/lib/render/showcase";
import { occasionVisualConcept, savedPostOccasion } from "@/lib/ai/occasion";
import { buildVisualDirection } from "@/lib/ai/visual-director";
import { buildVisualConcept, isSubjectCategory, recentVisualConcept, type VisualBusinessContext, type VisualConcept, type RecentVisualConcept } from "@/lib/ai/visual-plan";
import { imageToJpegDataUrl, logoToPngDataUrl, svgToPublishJpeg, weeklyDesignFonts } from "@/lib/render/raster";
import type { WeeklySlot, WeeklyItemMapping } from "@/lib/weekly/types";
import { photoGroups, weeklyProductKey, type WeeklyPhoto } from "@/lib/weekly/plan";
import type { Job } from "@prisma/client";


function calendarDraftPlan(plan: Array<{day:number;date:string}>|undefined,days:number): Map<number,Date> {
 if(!Number.isInteger(days)||days<1||days>31)throw new Error("The campaign needs its complete planned calendar. No dates were changed to today.");
 const dates=new Map<number,Date>(),seenDates=new Set<string>();
 if(plan===undefined||(Array.isArray(plan)&&plan.length===0))return dates;
 if(!Array.isArray(plan)||plan.length!==days)throw new Error("The campaign needs its complete planned calendar. No dates were changed to today.");
 for(const item of plan){
  if(!Number.isInteger(item.day)||item.day<1||item.day>days||dates.has(item.day)||!/^\d{4}-\d{2}-\d{2}$/.test(item.date))throw new Error("The campaign contains a missing, duplicate or invalid planned day.");
  const value=new Date(item.date+"T12:00:00Z");
  if(!Number.isFinite(value.getTime())||value.toISOString().slice(0,10)!==item.date||seenDates.has(item.date))throw new Error("Choose valid, distinct campaign calendar dates.");
  dates.set(item.day,value);seenDates.add(item.date);
 }
 return dates;
}

export async function POST(req: Request) {
  const secret = req.headers.get("x-worker-secret");

  if (!process.env.WORKER_SECRET || secret !== process.env.WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const organizationId =
    typeof body?.organizationId === "string" ? body.organizationId.trim() : "";

  const requestedJobId =
    typeof body?.jobId === "string" ? body.jobId.trim() : "";

  let requestedCampaignId = "";
  let requestedQueuedJob: Job | null = null;

  if (requestedJobId) {
    const requestedJob = await prisma.job.findFirst({
      where: {
        id: requestedJobId,
        organizationId,
      },
    });

    if (!requestedJob) return NextResponse.json({ error: "JOB_NOT_FOUND" }, { status: 404 });
    if (requestedJob.status === "queued" && ["CREATE_EVERYTHING", "GENERATE_IMAGE"].includes(requestedJob.type)) requestedQueuedJob = requestedJob;

    const requestedPayload =
      requestedJob?.payload &&
      typeof requestedJob.payload === "object" &&
      !Array.isArray(requestedJob.payload)
        ? requestedJob.payload
        : null;

    requestedCampaignId =
      requestedPayload &&
      "campaignId" in requestedPayload &&
      typeof requestedPayload.campaignId === "string"
        ? requestedPayload.campaignId
        : "";
  }

  if (!organizationId) {
    return NextResponse.json(
      { error: "ORGANIZATION_ID_REQUIRED" },
      { status: 400 },
    );
  }

  // Process only the next queued job belonging to this organization.
  // This safely handles CREATE_EVERYTHING first, followed by its
  // GENERATE_IMAGE jobs, without touching another customer's queue.
  // Prioritize campaign creation so new campaigns do not sit behind
  // previously queued image-generation work for the same organization.
  const currentCampaignImage = requestedCampaignId
    ? await prisma.job.findFirst({
        where: {
          organizationId,
          status: "queued",
          type: "GENERATE_IMAGE",
          payload: {
            path: ["campaignId"],
            equals: requestedCampaignId,
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      })
    : null;

  const job =
    requestedQueuedJob ?? currentCampaignImage ??
    (await prisma.job.findFirst({
      where: {
        organizationId,
        status: "queued",
        type: "CREATE_EVERYTHING",
        ...(requestedCampaignId ? { payload: { path: ["campaignId"], equals: requestedCampaignId } } : {}),
      },
      orderBy: {
        createdAt: "asc",
      },
    })) ??
    (await prisma.job.findFirst({
      where: {
        organizationId,
        status: "queued",
        type: "GENERATE_IMAGE",
        ...(requestedCampaignId ? { payload: { path: ["campaignId"], equals: requestedCampaignId } } : {}),
      },
      orderBy: {
        createdAt: "asc",
      },
    }));

  if (!job) {
    return NextResponse.json({ status: "idle" });
  }

  const claimed = await prisma.job.updateMany({
    where: { id: job.id, organizationId, status: job.status },
    data: {
      status: "running",
      progress: 10,
      attempts: { increment: 1 },
    },
  });
  if (claimed.count !== 1) return NextResponse.json({ status: "idle" });

  let imageRequested=false;
  try {
    if (job.type === "GENERATE_IMAGE") {
      const p = job.payload as {
        campaignId: string;
        contentItemId: string;
        prompt: string;
        frozenImagePrompt?: string;
        format?: "square" | "portrait" | "story";
        sourceImageUrl?: string;
        sourceEvidence?: PhotoEvidence;
        photoSource?: "website" | "ai";
        textPosition?: "left" | "right" | "top";
        variationIndex?: number;
        visualConcept?: VisualConcept;
        businessContext?: VisualBusinessContext;
        recentConcepts?: RecentVisualConcept[];
        occasion?: string;
        designStyle?: string;
      };

      const format = p.format || "portrait";

    const visualContentItem = await prisma.contentItem.findUnique({
      where: { id: p.contentItemId, campaignId: p.campaignId, campaign: { brand: { organizationId: job.organizationId } } },
      include: {
        campaign: {
          include: {
            brand: true,
          },
        },
      },
    });

    if (!visualContentItem) {
      throw new Error("CONTENT_ITEM_NOT_FOUND");
    }

    if (p.photoSource === "website") {
      const evidence = p.sourceEvidence || (p.sourceImageUrl ? { imageUrl: p.sourceImageUrl, sourceUrl: "", title: "" } : null);
      if (!p.sourceImageUrl || !evidence || (modelCodes(visualContentItem.headline || "").length && !matchingWebsitePhoto(visualContentItem, [evidence], [p.sourceImageUrl]))) throw new Error("This website photo is not verified for the product in this post. Choose its matching photo before creating the image.");
    }

    const visualCampaign = visualContentItem.campaign;
    const visualBrand = visualCampaign.brand;
    const recentConcepts = p.recentConcepts || await recentBrandConcepts(job.organizationId, visualBrand.id, job.createdAt);
    const businessContext: VisualBusinessContext = {
      ...p.businessContext,
      industry: visualBrand.industry || p.businessContext?.industry,
      description: visualBrand.description || p.businessContext?.description,
      targetAudience: visualBrand.targetAudience || p.businessContext?.targetAudience,
    };

    let occasion = p.occasion;
    if (visualContentItem.type === "holiday_post" && !occasion) {
      const planningJob = await prisma.job.findFirst({where:{organizationId:job.organizationId,type:"CREATE_EVERYTHING",status:"succeeded",payload:{path:["campaignId"],equals:p.campaignId}},orderBy:{createdAt:"desc"},select:{payload:true,result:true}});
      occasion = savedPostOccasion(planningJob?.payload,planningJob?.result,visualContentItem) || visualContentItem.headline || "This post's special day";
    }
    if (visualContentItem.type === "holiday_post" && p.sourceImageUrl) throw new Error("This special-day draft needs an occasion photo. Generate a matching image instead of reusing an unrelated website photo.");

    const visualDirectorPrompt = buildVisualDirection({
      brand: {
        name: visualBrand.name,
        voice: visualBrand.voice,
        positioning: visualBrand.positioning,
        visualRules: visualBrand.visualRules,
        primaryColor: visualBrand.primaryColor,
        secondaryColor: visualBrand.secondaryColor,
        accentColor: visualBrand.accentColor,
        designStyle: visualBrand.designStyle,
      },
      occasion,
      campaignGoal: visualCampaign.goal,
      platform: visualContentItem.platform,
      contentType: visualContentItem.type,
      headline: visualContentItem.headline,
      visualDirection: p.prompt,
      businessContext,
      visualConcept: isSubjectCategory(p.visualConcept?.subjectCategory) ? p.visualConcept : undefined,
      recentConcepts,
      variationIndex: p.variationIndex ?? regenerationVariationIndex(visualContentItem.id, p.visualConcept),
      textPosition: p.textPosition,
    });

      let dataUrl: string;
      let imageProvider: string;
      let imageModel: string = "website";
      let generatedSize: string | undefined;
      let reviewedPhoto: Awaited<ReturnType<typeof import('@/lib/ai/reviewed-photo').selectReviewedPhoto>> | undefined;

      if (p.sourceImageUrl) {
        // Use the real product photograph selected from the website.
        dataUrl = p.sourceImageUrl;
        imageProvider = "website";
      } else {
        const frozenPrompt=p.frozenImagePrompt || visualDirectorPrompt;
        if(!p.frozenImagePrompt)await prisma.job.update({where:{id:job.id},data:{payload:{...p,frozenImagePrompt:frozenPrompt}}});
        imageRequested=true;
        const generated=await generateImage({organizationId:job.organizationId,requestId:`worker:${job.id}`,prompt:frozenPrompt,format});
        dataUrl = `data:image/png;base64,${generated.base64}`;
        imageProvider = generated.provider;
        imageModel = generated.model;
        generatedSize = generated.size;
        const {selectReviewedPhoto} = await import('@/lib/ai/reviewed-photo');
        reviewedPhoto = await selectReviewedPhoto({organizationId: job.organizationId, campaignId: p.campaignId, contentItemId: p.contentItemId,
          requestId: `worker:${job.id}`, generated, prompt: frozenPrompt, format, previousMediaUrl: visualContentItem.mediaUrl,
          context: {brandId: visualBrand.id, brandName: visualBrand.name, headline: visualContentItem.headline || '', caption: visualContentItem.caption || '',
            business: [visualBrand.industry, visualBrand.description].filter(Boolean).join(': '), audience: visualBrand.targetAudience || '', voice: visualBrand.voice || '',
            visualRules: visualBrand.visualRules || '', goal: visualCampaign.goal || '', occasion: occasion || '', direction: p.prompt},
          metadata: {subjectCategory: p.visualConcept?.subjectCategory || 'unrecorded', occasion: occasion || null},
        });
        if (!reviewedPhoto.selected) {
          await prisma.job.update({where: {id: job.id}, data: {status: 'succeeded', progress: 100, result: {assetId: reviewedPhoto.asset.id, contentItemId: p.contentItemId, needsReview: true}}});
          return NextResponse.json({status: 'succeeded', type: 'GENERATE_IMAGE', jobId: job.id, needsReview: true, assetId: reviewedPhoto.asset.id});
        }
        dataUrl = reviewedPhoto.asset.url!;
      }

      const imageData = {
        organizationId: job.organizationId,
        campaignId: p.campaignId,
        contentItemId: p.contentItemId,
        kind: "ai_image",
        provider: imageProvider,
        status: "ready",
        url: dataUrl,
        prompt: p.prompt,
        metadata: {
          model: imageModel,
          format,
          ...(generatedSize ? {size:generatedSize} : {}),
          subjectCategory: p.visualConcept?.subjectCategory || "unrecorded",
          occasion: occasion || null,
          sourceEvidence: p.sourceEvidence || null,
        },
      };

      const {saveGeneratedPhoto} = await import("@/lib/creative/image-history");
      const asset = reviewedPhoto?.asset || await saveGeneratedPhoto(imageData);

      // Automatically turn the clean AI source image into
      // a finished Brand Brain creative.
      const [contentItem, campaign] = await Promise.all([
        prisma.contentItem.findUnique({
          where: { id: p.contentItemId },
        }),
        prisma.campaign.findUnique({
          where: { id: p.campaignId },
          include: { brand: true },
        }),
      ]);

      if (contentItem && campaign?.brand) {
        const brand = campaign.brand;

        let renderImageUrl: string | undefined = asset.url || undefined;
        if (renderImageUrl) {
          renderImageUrl = await imageToJpegDataUrl(renderImageUrl);
        }

        const designStyle = p.designStyle || automaticShowcaseStyle(contentItem.id, brand.designStyle);
        const logoUrl = await logoToPngDataUrl(brand.logoUrl);
        const svg = renderSocialSvg({
          headline: contentItem.headline || "Campaign Creative",
          cta: "Discover More",
          brand: brand.name,
          format,
          imageUrl: renderImageUrl,
          textPosition: p.textPosition || "left",
          logoUrl,
          primaryColor: brand.primaryColor || undefined,
          secondaryColor: brand.secondaryColor || undefined,
          accentColor: brand.accentColor || undefined,
          headingFont: brand.headingFont || undefined,
          bodyFont: brand.bodyFont || undefined,
          designStyle,
          ...(designStyle.startsWith("weekly-") ? { designFonts: await weeklyDesignFonts() } : {}),
        });

        const creativeJpeg = await svgToPublishJpeg(svg);
        const creativeUrl = `data:image/jpeg;base64,${creativeJpeg.toString("base64")}`;

        const creativeData = {
          organizationId: job.organizationId,
          campaignId: p.campaignId,
          contentItemId: p.contentItemId,
          kind: "social_creative",
          provider: "internal-raster",
          status: "ready",
          url: creativeUrl,
          metadata: {
            format,
            width: 1080,
            height:
              format === "story" ? 1920 : format === "portrait" ? 1350 : 1080,
            brandId: brand.id,
            designStyle,
          },
        };

      // Public media URLs are immutable. A revision gets a new identity so
      // customer previews and approval snapshots refer to the exact artwork.
      await saveCreativeRevision(creativeData, contentItem);
    }

      await prisma.job.update({
        where: { id: job.id },
        data: {
          status: "succeeded",
          progress: 100,
          result: {
            assetId: asset.id,
            contentItemId: p.contentItemId,
          },
        },
      });

      return NextResponse.json({
        status: "succeeded",
        type: "GENERATE_IMAGE",
        jobId: job.id,
        assetId: asset.id,
      });
    }

    const p = job.payload as {
      campaignId: string;
      brief: string;
      goal: string;
      days: number;
      contentPlan?: ContentSlot[];
      weeklyPackId?: string;
      weeklySlots?: WeeklySlot[];
      weeklySources?: WeeklyPhoto[];
    dailyPlan?: Array<{
      day: number;
      date: string;
      specialDay?: string | null;
      platforms: string[];
    }>;
      photoSource?: "website" | "ai" | "none";
      campaignPhotoIds?: string[];
      imageUrl?: string;
      imageUrls?: string[];
      websitePhotoEvidence?: PhotoEvidence[];
      brandContext?: {
        name: string;
        voice?: string | null;
        positioning?: string | null;
      industry?: string | null;
      description?: string | null;
      targetAudience?: string | null;
      contentGoals?: string | null;
      postingFrequency?: string | null;
      approvalRequired?: boolean;
        businessType?: string | null;
        website?: string | null;
        primaryGoal?: string | null;
      };
    };

    const campaign = await prisma.campaign.findUnique({
      where: { id: p.campaignId, brand: { organizationId: job.organizationId } },
      include: { brand: true },
    });

    if (!campaign) {
      throw new Error("CAMPAIGN_NOT_FOUND");
    }

    const plannedDates=calendarDraftPlan(p.dailyPlan,p.days);

    const businessContext: VisualBusinessContext = {
      businessType: p.brandContext?.businessType,
      industry: campaign.brand.industry || p.brandContext?.industry,
      description: campaign.brand.description || p.brandContext?.description,
      targetAudience: campaign.brand.targetAudience || p.brandContext?.targetAudience,
    };
    const recentConcepts = await recentBrandConcepts(job.organizationId, campaign.brandId);

    const cachedPack = job.result && typeof job.result === "object" && !Array.isArray(job.result) ? (job.result as unknown as { generatedPack?: Awaited<ReturnType<typeof generateCampaign>> }).generatedPack : undefined;
    const pack = cachedPack || await generateCampaign({
      brief: p.brief,
      goal: p.goal,
      days: p.days,
      contentPlan: p.contentPlan,
      recentConcepts,
    dailyPlan: p.dailyPlan ?? [],
      brand: campaign.brand,
      businessContext: p.brandContext
        ? {
            businessType: p.brandContext.businessType,
              industry: businessContext.industry,
              description: businessContext.description,
              targetAudience: businessContext.targetAudience,
              contentGoals: p.brandContext.contentGoals,
              postingFrequency: p.brandContext.postingFrequency,
              approvalRequired: p.brandContext.approvalRequired,
            website: p.brandContext.website,
            primaryGoal: p.brandContext.primaryGoal,
          }
        : businessContext,
    });

    // Preserve the purchased copy before validation/rendering. An Admin retry
    // can resume this exact result without another model request or debit.
    if (p.weeklyPackId && !cachedPack) await prisma.job.update({ where: { id: job.id }, data: { result: { generatedPack: pack } as any } });

    pack.posts = applyContentPlan(pack.posts, p.contentPlan);
    if(plannedDates.size&&pack.posts.some(post=>!plannedDates.has(post.day)))throw new Error("A campaign post does not match its planned calendar day.");
    await prisma.$transaction(async (tx: any) => {
      if (p.weeklyPackId && await tx.contentItem.count({ where: { campaignId: campaign.id } })) throw new Error("This weekly pack already has saved items. Review the existing items instead of recreating them.");
      await tx.contentItem.deleteMany({
        where: { campaignId: campaign.id },
      });

      const setupPhotos = p.campaignPhotoIds?.length ? await campaignSetupPhotos(tx,job.organizationId,campaign.brandId,p.campaignPhotoIds) : [];
      let setupPhotoIndex = 0;
      let imageJobsCreated = 0;
      const photoWarnings: string[] = [];
      let creativeLayoutIndex = 0;
      const weeklyItems: WeeklyItemMapping[] = [];
      const plannedConcepts = [...recentConcepts];

      const creativeLayouts: Array<"left" | "right" | "top"> = [
        "top",
        "left",
        "right",
        "left",
      ];

      const websitePhotos = p.imageUrls?.length
        ? p.imageUrls
        : p.imageUrl
          ? [p.imageUrl]
          : [];

      const photoChoices: PhotoEvidence[] = p.websitePhotoEvidence?.length ? p.websitePhotoEvidence : websitePhotos.map(imageUrl => ({ imageUrl, sourceUrl: "", title: "" }));
      for (const x of pack.posts) {
      const weeklySlot = p.weeklySlots?.find(slot => slot.key === x.planKey);
      const slotTopics = p.contentPlan?.find(slot => slot.planKey === x.planKey)?.topics;
      const assignedPhoto = weeklySlot?.sourceImageUrl ? photoChoices.find(photo => photo.imageUrl === weeklySlot.sourceImageUrl && photo.sourceUrl === weeklySlot.sourceUrl) : undefined;
      const matchedPhoto = p.photoSource === "website" ? assignedPhoto || matchingWebsitePhoto({ headline: x.headline, caption: x.caption, topics: slotTopics }, photoChoices, websitePhotos) : null;
      if (p.photoSource === "website" && !matchedPhoto && x.type !== "holiday_post") photoWarnings.push(`${x.headline}: choose a matching website photo; no unrelated image was assigned.`);
      const occasion = p.contentPlan?.find(slot=>slot.planKey===x.planKey && slot.extra)?.occasion;
      const concept = occasion ? occasionVisualConcept(occasion) : buildVisualConcept({ businessContext, variationIndex: creativeLayoutIndex, recentConcepts: plannedConcepts });
      const priorConcepts = plannedConcepts.slice(-6);
      plannedConcepts.push(recentVisualConcept(concept, x.visualDirection));
      const scheduledDay = p.dailyPlan?.find(
        (day) => day.day === x.day
      );

      const publishingPlatforms =
        scheduledDay
          ? scheduledDay.platforms
          : Array.isArray(x.platforms)
            ? x.platforms
            : [];

        const item = await tx.contentItem.create({
          data: {
            campaignId: campaign.id,
            type: x.type,
            scheduledFor: plannedDates.get(x.day)||null,
            platform: publishingPlatforms.join(","),
            headline: x.headline,
            caption: x.caption,
            status: "draft",
          },
        });

        if (weeklySlot) {
          weeklyItems.push({ slotKey: weeklySlot.key, contentItemId: item.id });
          // Real gallery images remain original assets, so motion reels can use
          // multiple views without generating a different version of a product.
          if (weeklySlot.kind !== "image" && weeklySlot.sourceUrl) {
            const gallery = photoGroups(p.weeklySources || []).find(group => weeklyProductKey(group[0]) === weeklyProductKey(weeklySlot)) || [];
            for (const [index, photo] of gallery.entries()) await tx.mediaAsset.create({ data: { organizationId: job.organizationId, campaignId: campaign.id, contentItemId: item.id, kind: "product_photo", provider: "product-website", status: "ready", url: photo.imageUrl, metadata: { brandId: campaign.brandId, productName: photo.productName, sourceUrl: photo.sourceUrl, label: `Product view ${index + 1}`, sourceEvidence: { imageUrl: photo.imageUrl, sourceUrl: photo.sourceUrl, title: photo.productName } } } });
          }
        }

        if(setupPhotos.length && x.type !== "holiday_post") await attachSetupPhoto(tx,job.organizationId,campaign.id,item.id,setupPhotos[setupPhotoIndex++ % setupPhotos.length]);
        if (
          p.photoSource !== "none" && (p.photoSource !== "website" || matchedPhoto) && !(x.type === "holiday_post" && p.photoSource === "website") && (
        x.visualDirection?.trim() ||
        x.headline?.trim() ||
        x.caption?.trim() ||
        `${campaign.brand.name} premium campaign creative`
      )
        ) {
          await tx.job.create({
            data: {
              organizationId: job.organizationId,
              type: "GENERATE_IMAGE",
              payload: {
                campaignId: campaign.id,
                contentItemId: item.id,
                ...(weeklySlot ? { designStyle: weeklySlot.layout, weeklyPackId: p.weeklyPackId, weeklySlotKey: weeklySlot.key } : {}),
                businessContext,
                visualConcept: concept,
                variationIndex: creativeLayoutIndex,
                recentConcepts: priorConcepts,
                originalDirection: x.visualDirection,
                occasion: occasion || undefined,
                sourceImageUrl:
                  p.photoSource === "website" ? matchedPhoto?.imageUrl : undefined,
                sourceEvidence: matchedPhoto || undefined,
                photoSource: p.photoSource || "ai",
                textPosition:
                  creativeLayouts[creativeLayoutIndex % creativeLayouts.length],
                prompt: `${x.visualDirection?.trim() ||
          x.headline?.trim() ||
          x.caption?.trim() ||
          `${campaign.brand.name} premium campaign creative`}

Create premium social-media campaign photography for ${campaign.brand.name}.
Campaign: ${pack.title}.
Content headline: ${x.headline}.
PRODUCT FIDELITY — CRITICAL:
When a source/product image is provided, the product shown in that image is authoritative. Preserve the actual product faithfully. Do NOT redesign, substitute, reinterpret, or invent a different product.

Maintain the original product's body shape, proportions, silhouette, materials, wood appearance, finish, hardware, decorative details, construction details, and identifying visual features.

Treat the source product as something being professionally photographed, not something being redesigned. You may improve the environment, background, lighting, shadows, camera angle, staging, and advertising composition while keeping the product itself visually faithful.

Preserve realistic product proportions and craftsmanship.

CAMPAIGN VISUAL DIVERSITY — CRITICAL:
Do not create a campaign that repeats essentially the same subject, product pose, background, camera angle, or composition day after day.

Treat the full campaign as a visual story. Each day's image should have a distinct visual purpose while remaining clearly connected to the same brand and campaign.

Rotate intelligently among:
- hero product or service imagery
- craftsmanship/process
- close-up details and materials
- environment or atmosphere
- lifestyle or real-world context
- heritage, inspiration, or story
- human interaction when appropriate
- emotional/conceptual imagery relevant to the message
- final product/service call-to-action imagery

A product does NOT need to dominate every image. When the product appears, preserve it faithfully. When it does not appear, create brand-relevant supporting imagery rather than inventing a substitute product.

Avoid seven variations of the same object centered in different rooms. Avoid repetitive poses, backgrounds, lighting, and camera angles.

The seven images should feel like one premium campaign with seven distinct chapters, not seven versions of the same advertisement.

COMPOSITION: Follow this post's assigned composition and keep calm negative space at the ${creativeLayouts[creativeLayoutIndex % creativeLayouts.length]} for typography.
Do not turn a human, experience, or service concept into a product hero.
Maintain a balanced premium advertising composition and natural perspective.

IMPORTANT: Generate ONLY the underlying photography/artwork. The final image must contain absolutely NO typography, words, letters, numbers, dates, captions, headlines, labels, logos, brand marks, signatures, watermarks, signs, posters, packaging text, or UI elements. Leave clean negative space where appropriate for Rumi Social AI to add professional typography later. Do not render the campaign title or content headline inside the image. Use people when the planned subject requires a human or lifestyle experience; do not imply a real customer endorsement.`,
                format: x.type === "story_post" ? "story" : "portrait",
              },
            },
          });

          imageJobsCreated++;
          creativeLayoutIndex++;


        }
      }

      if (p.weeklyPackId) await tx.job.updateMany({ where: { id: p.weeklyPackId, organizationId: job.organizationId, type: "WEEKLY_PACK" }, data: { status: "running", progress: 25, result: { items: weeklyItems } } });

    for (const x of (p.contentPlan?.length ? [] : pack.stories)) {
      const concept = buildVisualConcept({ businessContext, variationIndex: creativeLayoutIndex, recentConcepts: plannedConcepts });
      const priorConcepts = plannedConcepts.slice(-6);
      plannedConcepts.push(recentVisualConcept(concept, x.visualDirection));
      const storyItem = await tx.contentItem.create({
        data: {
          campaignId: campaign.id,
          type: "story",
          scheduledFor: plannedDates.get(x.frame)||plannedDates.get(1)||null,
          platform: "instagram",
          headline: x.text.length > 90 ? `${x.text.slice(0, 87)}...` : x.text,
          caption: x.text,
          status: "draft",
        },
      });

      if(setupPhotos.length) await attachSetupPhoto(tx,job.organizationId,campaign.id,storyItem.id,setupPhotos[setupPhotoIndex++ % setupPhotos.length]);
      const storyPhoto = p.photoSource === "website" ? matchingWebsitePhoto({ headline: x.text }, photoChoices, websitePhotos) : null;
      if (p.photoSource !== "none" && (p.photoSource !== "website" || storyPhoto)) await tx.job.create({
        data: {
          organizationId: job.organizationId,
          type: "GENERATE_IMAGE",
          payload: {
            campaignId: campaign.id,
            contentItemId: storyItem.id,
            businessContext,
            visualConcept: concept,
            variationIndex: creativeLayoutIndex,
            recentConcepts: priorConcepts,
            originalDirection: x.visualDirection,
            photoSource: p.photoSource || "ai",
            sourceImageUrl:
              p.photoSource === "website" ? storyPhoto?.imageUrl : undefined,
            sourceEvidence: storyPhoto || undefined,
            format: "story",
            textPosition:
              creativeLayouts[
                creativeLayoutIndex % creativeLayouts.length
              ],
            prompt: `Create premium Instagram Story campaign photography.

Brand: ${campaign.brand.name}
Campaign: ${pack.title}
Story message: ${x.text}
Original story direction: ${x.visualDirection}

Create a visually compelling vertical scene that communicates the
meaning and emotion of this specific story.

The image must accurately represent the actual brand and campaign.
Do not introduce unrelated products, treatments, equipment,
professions, facilities or services.

Avoid generic industry clichés and repetitive imagery.
Create a distinctive visual concept appropriate to this message.

Generate underlying photography or artwork only.
Do not generate text, logos, letters, numbers or watermarks.
Leave intentional negative space for Rumi Social AI typography.`,
          },
          status: "queued",
          progress: 0,
        },
      });


      creativeLayoutIndex++;
    }

      if (!p.contentPlan?.length) await tx.contentItem.create({
        data: {
          campaignId: campaign.id,
          type: "reel",
          scheduledFor: plannedDates.get(1)||null,
          platform: "instagram",
          headline: pack.reel.hook,
          caption: pack.reel.voiceover,
          status: "draft",
        },
      });

      await tx.campaign.update({
        where: { id: campaign.id },
        data: {
          status: "ready",
          title: pack.title,
        },
      });

      await tx.job.update({
        where: { id: job.id },
        data: {
          status: "succeeded",
          progress: 100,
          result: { ...pack, photoWarnings } as any,
        },
      });
    });

    return NextResponse.json({
      status: "succeeded",
      type: "CREATE_EVERYTHING",
      jobId: job.id,
      campaignId: campaign.id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown worker error";

    // Resume the same frozen image task after polling, download or layout storage errors.
    // Definitive provider rejection stops; uncertain paid submissions never auto-resubmit.
    const retryImage=job.type === "GENERATE_IMAGE" && imageRequested && !(e instanceof ImageRejectedError);
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: retryImage ? "queued" : "failed",
        error: msg,
        progress: retryImage ? 20 : 100,
      },
    });

    return NextResponse.json(
      {
        status: retryImage ? "queued" : "failed",
        jobId: job.id,
        error: msg,
      },
      { status: retryImage ? 202 : 500 },
    );
  }
}
