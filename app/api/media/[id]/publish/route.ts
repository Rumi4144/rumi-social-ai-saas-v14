import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import sharp from "sharp";

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

    // Make stored SVG creatives completely self-contained before
    // rasterizing them for social publishing.
    let renderSource = source;

    const sourceText = source.toString("utf8");

    if (sourceText.trimStart().startsWith("<svg")) {
      let svg = sourceText;

      // Embed every remote image referenced by the SVG.
      const remoteUrls = Array.from(
        new Set(
          [...svg.matchAll(/href=["'](https?:[^"']+)["']/g)]
            .map((match) => match[1])
        )
      );

      for (const remoteUrl of remoteUrls) {
        try {
          const imageResponse = await fetch(remoteUrl, {
            cache: "no-store",
            headers: {
              "User-Agent": "Mozilla/5.0 RumiSocialAI/1.0",
              Accept: "image/*",
            },
          });

          if (!imageResponse.ok) {
            console.error(
              "PUBLISH_EMBED_IMAGE_FAILED",
              remoteUrl,
              imageResponse.status
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

          svg = svg.split(remoteUrl).join(dataUrl);
        } catch (error) {
          console.error(
            "PUBLISH_EMBED_IMAGE_ERROR",
            remoteUrl,
            error
          );
        }
      }

      // Vercel's Sharp/libvips environment may not have the custom
      // brand fonts. Use common fallback families for the publishing
      // raster only so text remains readable.
      svg = svg.replace(
        /font-family="[^"]*"/g,
        'font-family="sans-serif"'
      );

      renderSource = Buffer.from(svg);
    }

    const jpeg = await sharp(renderSource, {
      density: 120,
    })
      .flatten({ background: "#ffffff" })
      .jpeg({
        quality: 88,
        mozjpeg: true,
      })
      .toBuffer();

    if (jpeg.length >= 10 * 1024 * 1024) {
      return new NextResponse("Rendered image exceeds Facebook limit", {
        status: 413,
      });
    }

    return new NextResponse(new Uint8Array(jpeg), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(jpeg.length),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("PUBLISH_MEDIA_RENDER_ERROR", error);

    return new NextResponse("Media render error", {
      status: 500,
    });
  }
}
