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

    if (sourceText.trimStart().startsWith("<svg")) {
      let svg = sourceText;

      // Make every remote image inside the SVG self-contained.
      const remoteUrls = Array.from(
        new Set(
          [...svg.matchAll(/href=["'](https?:[^"']+)["']/g)].map(
            (match) => match[1]
          )
        )
      );

      for (const remoteUrl of remoteUrls) {
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
              imageResponse.status
            );
            continue;
          }

          const contentType =
            imageResponse.headers.get("content-type") ||
            "image/jpeg";

          const imageBytes = Buffer.from(
            await imageResponse.arrayBuffer()
          );

          const dataUrl =
            `data:${contentType};base64,` +
            imageBytes.toString("base64");

          svg = svg.split(remoteUrl).join(dataUrl);
        } catch (error) {
          console.error("PUBLISH_EMBED_IMAGE_ERROR", error);
        }
      }

      const fontPath = join(
        process.cwd(),
        "public",
        "fonts",
        "noto-sans-latin-400-normal.woff"
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
          defaultFontFamily: "Noto Sans",
          sansSerifFamily: "Noto Sans",
          serifFamily: "Noto Sans",
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
