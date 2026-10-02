import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resvg } from "@resvg/resvg-js";
import sharp from "sharp";
import { readFile } from "fs/promises";
import { join } from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const asset = await prisma.mediaAsset.findUnique({
      where: { id },
    });

    if (
      !asset ||
      asset.status !== "ready" ||
      !asset.url ||
      asset.kind !== "social_creative"
    ) {
      return new NextResponse("Not found", { status: 404 });
    }

    let source: Buffer;

    if (asset.url.startsWith("data:")) {
      const match = asset.url.match(
        /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/s
      );

      if (!match) {
        return new NextResponse("Invalid media", { status: 500 });
      }

      source = Buffer.from(match[2], "base64");
    } else {
      const response = await fetch(asset.url, {
        cache: "no-store",
      });

      if (!response.ok) {
        return new NextResponse("Source media unavailable", {
          status: 502,
        });
      }

      source = Buffer.from(await response.arrayBuffer());
    }

    let renderSource = source;
    const sourceText = source.toString("utf8");

    // For branded social creatives, locate the original photograph
    // belonging to the same campaign/content item.
    let originalImageDataUrl: string | null = null;

    if (
      asset.kind === "social_creative" &&
      asset.campaignId &&
      asset.contentItemId
    ) {
      const candidateImages = await prisma.mediaAsset.findMany({
        where: {
          campaignId: asset.campaignId,
          contentItemId: asset.contentItemId,
          status: "ready",
          kind: "ai_image",
          NOT: { id: asset.id },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      // Match the same image-selection logic used by the campaign page.
      const originalImage =
        candidateImages.find(
          (candidate) => candidate.provider === "openai"
        ) ||
        candidateImages.find(
          (candidate) =>
            candidate.provider === "internal" ||
            candidate.provider === "website"
        );

      if (originalImage?.url) {
        try {
          let originalBytes: Buffer;
          let originalType = "image/jpeg";

          if (originalImage.url.startsWith("data:")) {
            const match = originalImage.url.match(
              /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/s
            );

            if (match) {
              originalType = match[1];
              originalBytes = Buffer.from(match[2], "base64");

              originalImageDataUrl =
                `data:${originalType};base64,` +
                originalBytes.toString("base64");
            }
          } else {
            const originalResponse = await fetch(originalImage.url, {
              cache: "no-store",
              headers: {
                "User-Agent": "Mozilla/5.0 RumiSocialAI/2.0",
                Accept: "image/*",
              },
            });

            if (originalResponse.ok) {
              originalType =
                originalResponse.headers.get("content-type") ||
                "image/jpeg";

              originalBytes = Buffer.from(
                await originalResponse.arrayBuffer()
              );

              originalImageDataUrl =
                `data:${originalType};base64,` +
                originalBytes.toString("base64");
            }
          }
        } catch (error) {
          console.error("PUBLISH_ORIGINAL_IMAGE_ERROR", error);
        }
      }
    }

    if (sourceText.trimStart().startsWith("<svg")) {
      let svg = sourceText;

      if (originalImageDataUrl) {
        svg = svg.replace(
          /href=(["'])https?:\/\/[^"'<>]+\1/,
          `href="${originalImageDataUrl}"`
        );
      }

      // Embed every remote SVG image before Resvg renders it.
      const hrefRegex = /href=(["'])(https?:\/\/[^"'<>]+)\1/g;
      const matches = [...svg.matchAll(hrefRegex)];

      for (const match of matches) {
        const originalHref = match[0];
        const quote = match[1];
        const escapedUrl = match[2];

        // SVG URLs may contain XML entities such as &amp;.
        const remoteUrl = escapedUrl.replace(/&amp;/g, "&");

        try {
          const imageResponse = await fetch(remoteUrl, {
            cache: "no-store",
            headers: {
              "User-Agent": "Mozilla/5.0 RumiSocialAI/2.0",
              Accept: "image/*",
            },
          });

          if (!imageResponse.ok) {
            console.error(
              "PUBLISH_EMBED_IMAGE_FAILED",
              imageResponse.status,
              remoteUrl
            );
            continue;
          }

          const contentType =
            imageResponse.headers.get("content-type") || "image/jpeg";

          const imageBytes = Buffer.from(
            await imageResponse.arrayBuffer()
          );

          const dataUrl =
            `data:${contentType};base64,${imageBytes.toString("base64")}`;

          svg = svg.replace(
            originalHref,
            `href=${quote}${dataUrl}${quote}`
          );
        } catch (error) {
          console.error(
            "PUBLISH_EMBED_IMAGE_ERROR",
            remoteUrl,
            error
          );
        }
      }

      const fontPath = join(
        process.cwd(),
        "public",
        "fonts",
        "Arial.ttf"
      );

      // Resvg receives the font directly.
      // No Fontconfig or operating-system font lookup is required.
      const resvg = new Resvg(svg, {
        fitTo: {
          mode: "original",
        },
        font: {
          fontFiles: [fontPath],
          loadSystemFonts: false,
          defaultFontFamily: "Arial",
          sansSerifFamily: "Arial",
          serifFamily: "Arial",
        },
      });

      const rendered = resvg.render();
      const png = rendered.asPng();

      renderSource = Buffer.from(png);
    }

    // Facebook-friendly JPEG.
    const jpeg = await sharp(renderSource)
      .flatten({ background: "#ffffff" })
      .jpeg({
        quality: 88,
        mozjpeg: true,
      })
      .toBuffer();

    if (jpeg.length >= 10 * 1024 * 1024) {
      return new NextResponse(
        "Rendered image exceeds Facebook limit",
        { status: 413 }
      );
    }

    return new NextResponse(new Uint8Array(jpeg), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(jpeg.length),
        "Cache-Control":
          "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("PUBLISH_MEDIA_RENDER_ERROR", error);

    return new NextResponse("Media render error", {
      status: 500,
    });
  }
}
