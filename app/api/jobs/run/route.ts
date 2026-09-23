import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { generateCampaign } from "@/lib/ai/campaign";
import { renderSocialSvg } from "@/lib/render/svg";

export async function POST(req: Request) {
  const secret = req.headers.get("x-worker-secret");

  if (
    !process.env.WORKER_SECRET ||
    secret !== process.env.WORKER_SECRET
  ) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const body = await req.json().catch(() => ({}));

  const organizationId =
    typeof body?.organizationId === "string"
      ? body.organizationId.trim()
      : "";

  if (!organizationId) {
    return NextResponse.json(
      { error: "ORGANIZATION_ID_REQUIRED" },
      { status: 400 }
    );
  }

  // Process only the next queued job belonging to this organization.
  // This safely handles CREATE_EVERYTHING first, followed by its
  // GENERATE_IMAGE jobs, without touching another customer's queue.
  const job = await prisma.job.findFirst({
    where: {
      organizationId,
      status: "queued",
      type: {
        in: ["CREATE_EVERYTHING", "GENERATE_IMAGE"],
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  if (!job) {
    return NextResponse.json({ status: "idle" });
  }

  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: "running",
      progress: 10,
      attempts: { increment: 1 },
    },
  });

  try {
    if (job.type === "GENERATE_IMAGE") {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY_MISSING");
      }

      const p = job.payload as {
        campaignId: string;
        contentItemId: string;
        prompt: string;
        format?: "square" | "portrait" | "story";
        sourceImageUrl?: string;
        photoSource?: "website" | "ai";
    textPosition?: "left" | "right" | "top";
      };

      const format = p.format || "portrait";

      const size: "1024x1024" | "1024x1536" =
        format === "square" ? "1024x1024" : "1024x1536";

      let dataUrl: string;
    let imageProvider: "website" | "openai";

    if (p.sourceImageUrl) {
      // Use the real product photograph selected from the website.
      dataUrl = p.sourceImageUrl;
      imageProvider = "website";
    } else {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error("OPENAI_API_KEY_MISSING");
      }

      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const result = await client.images.generate({
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
        prompt: p.prompt,
        size,
        quality: "medium",
        output_format: "png",
        n: 1,
      });

      const base64 = result.data?.[0]?.b64_json;

      if (!base64) {
        throw new Error("IMAGE_GENERATION_EMPTY");
      }

      dataUrl = `data:image/png;base64,${base64}`;
      imageProvider = "openai";
    }

    const existingImage = await prisma.mediaAsset.findFirst({
        where: {
          organizationId: job.organizationId,
          contentItemId: p.contentItemId,
          kind: "ai_image",
          provider: "openai",
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const imageData = {
        organizationId: job.organizationId,
        campaignId: p.campaignId,
        contentItemId: p.contentItemId,
        kind: "ai_image",
        status: "ready",
        url: dataUrl,
        prompt: p.prompt,
        metadata: {
          model:
            process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
          format,
          size,
        },
      };

      const asset = existingImage
        ? await prisma.mediaAsset.update({
            where: { id: existingImage.id },
            data: imageData,
          })
        : await prisma.mediaAsset.create({
            data: imageData,
          });

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

        // Remote website photos must be embedded before they are
      // placed inside the SVG data URL.
      let renderImageUrl: string | undefined =
        asset.url || undefined;

      if (
        renderImageUrl &&
        /^https?:\/\//i.test(renderImageUrl)
      ) {
        const imageResponse = await fetch(renderImageUrl, {
          cache: "no-store",
          headers: {
            "User-Agent": "Mozilla/5.0 RumiSocialAI/1.0",
            Accept: "image/*",
          },
        });

        if (!imageResponse.ok) {
          throw new Error(
            `SOURCE_IMAGE_FETCH_FAILED_${imageResponse.status}`
          );
        }

        const contentType =
          imageResponse.headers.get("content-type") || "image/jpeg";

        const bytes = Buffer.from(
          await imageResponse.arrayBuffer()
        );

        renderImageUrl =
          `data:${contentType};base64,${bytes.toString("base64")}`;
      }

      const svg = renderSocialSvg({
          headline:
            contentItem.headline || "Campaign Creative",
          cta: "Discover More",
          brand: brand.name,
          format,
          imageUrl: renderImageUrl,
      textPosition: p.textPosition || "left",
          logoUrl: brand.logoUrl || undefined,
          primaryColor: brand.primaryColor || undefined,
          secondaryColor: brand.secondaryColor || undefined,
          accentColor: brand.accentColor || undefined,
          headingFont: brand.headingFont || undefined,
          bodyFont: brand.bodyFont || undefined,
          designStyle: brand.designStyle || undefined,
        });

        const creativeUrl =
          "data:image/svg+xml;base64," +
          Buffer.from(svg).toString("base64");

        const existingCreative =
          await prisma.mediaAsset.findFirst({
            where: {
              organizationId: job.organizationId,
              contentItemId: p.contentItemId,
              kind: "social_creative",
              provider: "internal-svg",
            },
            orderBy: {
              createdAt: "desc",
            },
          });

        const creativeData = {
          organizationId: job.organizationId,
          campaignId: p.campaignId,
          contentItemId: p.contentItemId,
          kind: "social_creative",
          provider: "internal-svg",
          status: "ready",
          url: creativeUrl,
          metadata: {
            format,
            width: 1080,
            height:
              format === "story"
                ? 1920
                : format === "portrait"
                  ? 1350
                  : 1080,
            brandId: brand.id,
            designStyle: brand.designStyle,
          },
        };

        if (existingCreative) {
          await prisma.mediaAsset.update({
            where: { id: existingCreative.id },
            data: creativeData,
          });
        } else {
          await prisma.mediaAsset.create({
            data: creativeData,
          });
        }
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
      photoSource?: "website" | "ai";
      imageUrl?: string;
    imageUrls?: string[];
    };

    const campaign = await prisma.campaign.findUnique({
      where: { id: p.campaignId },
      include: { brand: true },
    });

    if (!campaign) {
      throw new Error("CAMPAIGN_NOT_FOUND");
    }

    const pack = await generateCampaign({
      brief: p.brief,
      goal: p.goal,
      days: p.days,
      brand: campaign.brand,
    });

    await prisma.$transaction(async (tx: any) => {
      await tx.contentItem.deleteMany({
        where: { campaignId: campaign.id },
      });

      let imageJobsCreated = 0;
      let websitePhotoIndex = 0;
    let creativeLayoutIndex = 0;

    const creativeLayouts: Array<"left" | "right" | "top"> = [
      "top",
      "left",
      "right",
      "left",
    ];

      const websitePhotos =
        p.imageUrls?.length
          ? p.imageUrls
          : p.imageUrl
            ? [p.imageUrl]
            : [];

      for (const x of pack.posts) {
        const item = await tx.contentItem.create({
          data: {
            campaignId: campaign.id,
            type: x.type,
            platform: x.platform,
            headline: x.headline,
            caption: x.caption,
            status: "draft",
          },
        });

        if (
        x.visualDirection &&
        (
          p.photoSource === "website"
            ? imageJobsCreated < websitePhotos.length
            : imageJobsCreated < 3
        )
      ) {
          await tx.job.create({
            data: {
              organizationId: job.organizationId,
              type: "GENERATE_IMAGE",
              payload: {
                campaignId: campaign.id,
                contentItemId: item.id,
                sourceImageUrl:
                  p.photoSource === "website" &&
                  websitePhotos.length > 0
                    ? websitePhotos[
                        websitePhotoIndex %
                          websitePhotos.length
                      ]
                    : undefined,
                photoSource: p.photoSource || "ai",
              textPosition:
                creativeLayouts[
                  creativeLayoutIndex % creativeLayouts.length
                ],
                prompt: `${x.visualDirection}

Create premium social-media campaign photography for ${campaign.brand.name}.
Campaign: ${pack.title}.
Content headline: ${x.headline}.
Preserve realistic product proportions and craftsmanship.

COMPOSITION: Position the primary product predominantly on the RIGHT side
of the portrait frame. Keep the complete product visually important and
unobstructed. Reserve generous, visually calm NEGATIVE SPACE on the LEFT
side for professional editorial typography that Rumi Social AI will add
later. Do not place important product details in the left typography zone.
Maintain a balanced premium advertising composition and natural perspective.

IMPORTANT: Generate ONLY the underlying photography/artwork. The final image must contain absolutely NO typography, words, letters, numbers, dates, captions, headlines, labels, logos, brand marks, signatures, watermarks, signs, posters, packaging text, or UI elements. Leave clean negative space where appropriate for Rumi Social AI to add professional typography later. Do not render the campaign title or content headline inside the image. No people unless explicitly required by the visual direction.`,
                format: "portrait",
              },
            },
          });

          imageJobsCreated++;
          creativeLayoutIndex++;

          if (
            p.photoSource === "website" &&
            websitePhotos.length > 0
          ) {
            websitePhotoIndex++;
          }
        }
      }

      for (const x of pack.stories) {
        await tx.contentItem.create({
          data: {
            campaignId: campaign.id,
            type: "story",
            platform: "instagram",
            headline: `Story ${x.frame}`,
            caption: x.text,
            status: "draft",
          },
        });
      }

      await tx.contentItem.create({
        data: {
          campaignId: campaign.id,
          type: "reel",
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
          result: pack as any,
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
    const msg =
      e instanceof Error ? e.message : "Unknown worker error";

    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "failed",
        error: msg,
        progress: 100,
      },
    });

    return NextResponse.json(
      {
        status: "failed",
        jobId: job.id,
        error: msg,
      },
      { status: 500 }
    );
  }
}
