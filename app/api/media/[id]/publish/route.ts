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

    const png = await sharp(source, {
      density: 144,
    })
      .png({
        compressionLevel: 9,
      })
      .toBuffer();

    if (png.length >= 10 * 1024 * 1024) {
      return new NextResponse("Rendered image exceeds Facebook limit", {
        status: 413,
      });
    }

    return new NextResponse(new Uint8Array(png), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(png.length),
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
