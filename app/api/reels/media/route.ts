import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import sharp from "sharp";
import { fetchPublicBytes } from "@/lib/reels/public-fetch";

export async function GET(req: Request) {
  try {
    const ctx = await tenantContext(), query = new URL(req.url).searchParams;
    let source: string | null = null;
    if (query.get("assetId")) source = (await prisma.mediaAsset.findFirst({ where: { id: query.get("assetId")!, organizationId: ctx.organizationId, kind: { in: ["ai_image", "product_photo", "reel_scene_image"] }, status: "ready" } }))?.url || null;
    else if (query.get("brandId")) source = (await prisma.brand.findFirst({ where: { id: query.get("brandId")!, organizationId: ctx.organizationId } }))?.logoUrl || null;
    if (!source) return new NextResponse("Image not found", { status: 404 });
    let bytes: Buffer;
    if (source.startsWith("data:")) {
      const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(source);
      if (!match || match[1].length > 28_000_000) throw new Error("Invalid image"); bytes = Buffer.from(match[1], "base64");
    } else {
      bytes = (await fetchPublicBytes(source, 20_000_000)).bytes;
    }
    const image = await sharp(bytes, { limitInputPixels: 30_000_000 }).rotate().resize(1920, 1920, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return new NextResponse(new Uint8Array(image), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error, "Could not load this image. Upload its photo instead."); }
}
