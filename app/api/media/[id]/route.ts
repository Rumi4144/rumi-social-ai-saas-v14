import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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
      return new NextResponse("Not found", {
        status: 404,
      });
    }

    if (!asset.url.startsWith("data:")) {
      return NextResponse.redirect(asset.url);
    }

    const match = asset.url.match(
      /^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.+)$/s
    );

    if (!match) {
      return new NextResponse("Invalid media", {
        status: 500,
      });
    }

    const contentType = match[1];
    const bytes = Buffer.from(match[2], "base64");

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control":
          "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    console.error("MEDIA_SERVE_ERROR", error);

    return new NextResponse("Media error", {
      status: 500,
    });
  }
}
