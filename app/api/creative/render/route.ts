import { NextResponse } from "next/server";
import { z } from "zod";
import { renderSocialSvg } from "@/lib/render/svg";
import { businessVisualMode } from "@/lib/ai/visual-plan";
import { isShowcaseStyle } from "@/lib/render/showcase";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { imageToJpegDataUrl, svgToPublishJpeg } from "@/lib/render/raster";

const S = z.object({
  campaignId: z.string().optional(),
  contentItemId: z.string().optional(),
  headline: z.string().min(1),
  subheadline: z.string().optional(),
  cta: z.string().optional(),
  imageUrl: z.string().optional(),
  designStyle: z.enum(["automatic", "classic", "heritage", "gallery-story", "bold-spotlight"]).optional(),
  textPosition: z.enum(["left", "right", "top"]).optional(),
  format: z
    .enum(["square", "portrait", "story"])
    .default("portrait"),
  prepareOnly: z.boolean().optional(),
  browserRasterDataUrl: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();

    const parsed = S.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const post = parsed.data.contentItemId ? await prisma.contentItem.findFirst({ where: { id: parsed.data.contentItemId, ...(parsed.data.campaignId ? { campaignId: parsed.data.campaignId } : {}), campaign: { brand: { organizationId: ctx.organizationId } } }, include: { campaign: { include: { brand: true } } } }) : null;
    if (parsed.data.contentItemId && !post) return NextResponse.json({ error: "Post not found in this workspace." }, { status: 404 });
    const campaign = post?.campaign || (parsed.data.campaignId ? await prisma.campaign.findFirst({ where: { id: parsed.data.campaignId, brand: { organizationId: ctx.organizationId } }, include: { brand: true } }) : null);
    if (parsed.data.campaignId && !campaign) return NextResponse.json({ error: "Campaign not found in this workspace." }, { status: 404 });
    const brand = campaign?.brand || await prisma.brand.findFirst({ where: { organizationId: ctx.organizationId }, orderBy: { createdAt: "desc" } });

    if (!brand) {
      return NextResponse.json(
        { error: "BRAND_NOT_FOUND" },
        { status: 404 }
      );
    }

    const variants = ["heritage", "gallery-story", "bold-spotlight"];
    const seed = [...(post?.id || parsed.data.headline)].reduce((n, c) => n + c.charCodeAt(0), 0);
    const designStyle = parsed.data.designStyle && parsed.data.designStyle !== "automatic" ? parsed.data.designStyle : isShowcaseStyle(brand.designStyle || undefined) ? brand.designStyle! : variants[seed % variants.length];

    // Browser-captured raster is the source of truth: save exactly what the user saw.
    if (parsed.data.browserRasterDataUrl) {
      if (!parsed.data.browserRasterDataUrl.startsWith("data:image/jpeg;base64,")) {
        return NextResponse.json({ error: "INVALID_BROWSER_RASTER" }, { status: 400 });
      }

      const existingAsset = parsed.data.contentItemId
        ? await prisma.mediaAsset.findFirst({
            where: {
              organizationId: ctx.organizationId,
              contentItemId: parsed.data.contentItemId,
              kind: "social_creative",
              provider: { in: ["internal-raster", "internal-svg"] },
            },
            orderBy: { createdAt: "desc" },
          })
        : null;

      const assetData = {
        organizationId: ctx.organizationId,
        campaignId: parsed.data.campaignId,
        contentItemId: parsed.data.contentItemId,
        kind: "social_creative",
        provider: "internal-raster",
        status: "ready",
        url: parsed.data.browserRasterDataUrl,
        metadata: {
          format: parsed.data.format,
          width: 1080,
          height: parsed.data.format === "story" ? 1920 : parsed.data.format === "portrait" ? 1350 : 1080,
          brandId: brand.id,
          designStyle,
          textPosition: parsed.data.textPosition || "left",
          rasterizedInBrowser: true,
        },
      };

      const asset = existingAsset
        ? await prisma.mediaAsset.update({ where: { id: existingAsset.id }, data: assetData })
        : await prisma.mediaAsset.create({ data: assetData });

      return NextResponse.json({ assetId: asset.id, url: parsed.data.browserRasterDataUrl, format: parsed.data.format });
    }

    let embeddedImageUrl = parsed.data.imageUrl;
    if (embeddedImageUrl) {
      embeddedImageUrl = await imageToJpegDataUrl(embeddedImageUrl);
    }

    const embeddedImages: string[] = [];
    if (isShowcaseStyle(designStyle) && post) {
      const photos = await prisma.mediaAsset.findMany({ where: { organizationId: ctx.organizationId, campaignId: post.campaignId, contentItemId: post.id, kind: { in: ["ai_image", "product_photo", "reel_scene_image"] }, status: "ready", url: { not: null } }, select: { url: true }, orderBy: { createdAt: "asc" }, take: 12 });
      const extras = [...new Set(photos.map(photo => photo.url).filter((url): url is string => Boolean(url) && url !== parsed.data.imageUrl))].slice(0, 2);
      const results = await Promise.allSettled(extras.map(url => imageToJpegDataUrl(url)));
      for (const result of results) if (result.status === "fulfilled") embeddedImages.push(result.value);
    }

    const svg = renderSocialSvg({
      headline: parsed.data.headline,
      subheadline: parsed.data.subheadline,
      cta: parsed.data.cta,
      imageUrl: embeddedImageUrl,
      imageUrls: embeddedImages,
      detailCrops: businessVisualMode({ industry: brand.industry, description: brand.description }) === "product",
      format: parsed.data.format,
      textPosition: parsed.data.textPosition || "left",

      brand: brand.name,
      logoUrl: brand.logoUrl || undefined,
      primaryColor: brand.primaryColor || undefined,
      secondaryColor: brand.secondaryColor || undefined,
      accentColor: brand.accentColor || undefined,
      headingFont: brand.headingFont || undefined,
      bodyFont: brand.bodyFont || undefined,
      designStyle,
    });

    if (parsed.data.prepareOnly) {
      return NextResponse.json({
        svgDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
        format: parsed.data.format,
      });
    }

    const jpeg = await svgToPublishJpeg(svg);
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;

    const existingAsset = parsed.data.contentItemId
      ? await prisma.mediaAsset.findFirst({
          where: {
            organizationId: ctx.organizationId,
            contentItemId: parsed.data.contentItemId,
            kind: "social_creative",
            provider: { in: ["internal-raster", "internal-svg"] },
          },
          orderBy: {
            createdAt: "desc",
          },
        })
      : null;

    const assetData = {
      organizationId: ctx.organizationId,
      campaignId: parsed.data.campaignId,
      contentItemId: parsed.data.contentItemId,
      kind: "social_creative",
      provider: "internal-raster",
      status: "ready",
      url: dataUrl,
      metadata: {
        format: parsed.data.format,
        width: 1080,
        height:
          parsed.data.format === "story"
            ? 1920
            : parsed.data.format === "portrait"
              ? 1350
              : 1080,
        brandId: brand.id,
        designStyle,
        textPosition: parsed.data.textPosition || "left",
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

    return NextResponse.json({
      assetId: asset.id,
      url: dataUrl,
      format: parsed.data.format,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "CREATIVE_RENDER_FAILED";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
