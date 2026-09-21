import { NextResponse } from "next/server";
import { z } from "zod";
import { renderSocialSvg } from "@/lib/render/svg";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";

const S = z.object({
  campaignId: z.string().optional(),
  contentItemId: z.string().optional(),
  headline: z.string().min(1),
  subheadline: z.string().optional(),
  cta: z.string().optional(),
  imageUrl: z.string().optional(),
  textPosition: z.enum(["left", "right", "top"]).optional(),
  format: z
    .enum(["square", "portrait", "story"])
    .default("portrait"),
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

    const brand = await prisma.brand.findFirst({
      where: {
        organizationId: ctx.organizationId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!brand) {
      return NextResponse.json(
        { error: "BRAND_NOT_FOUND" },
        { status: 404 }
      );
    }

    // SVGs stored as data URLs cannot reliably display remote
    // website images. Embed remote product photos as base64 first.
    let embeddedImageUrl = parsed.data.imageUrl;

    if (
      embeddedImageUrl &&
      /^https?:\/\//i.test(embeddedImageUrl)
    ) {
      const imageResponse = await fetch(embeddedImageUrl, {
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

      embeddedImageUrl =
        `data:${contentType};base64,${bytes.toString("base64")}`;
    }

    const svg = renderSocialSvg({
      headline: parsed.data.headline,
      subheadline: parsed.data.subheadline,
      cta: parsed.data.cta,
      imageUrl: embeddedImageUrl,
      format: parsed.data.format,
      textPosition: parsed.data.textPosition || "left",

      brand: brand.name,
      logoUrl: brand.logoUrl || undefined,
      primaryColor: brand.primaryColor || undefined,
      secondaryColor: brand.secondaryColor || undefined,
      accentColor: brand.accentColor || undefined,
      headingFont: brand.headingFont || undefined,
      bodyFont: brand.bodyFont || undefined,
      designStyle: brand.designStyle || undefined,
    });

    const dataUrl =
      "data:image/svg+xml;base64," +
      Buffer.from(svg).toString("base64");

    const existingAsset = parsed.data.contentItemId
      ? await prisma.mediaAsset.findFirst({
          where: {
            organizationId: ctx.organizationId,
            contentItemId: parsed.data.contentItemId,
            kind: "social_creative",
            provider: "internal-svg",
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
      provider: "internal-svg",
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
        designStyle: brand.designStyle,
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
