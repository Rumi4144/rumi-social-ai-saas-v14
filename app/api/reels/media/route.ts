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
    if (query.get("assetId")) {
      let campaignIds: string[] | undefined;
      if (query.get("campaignId")) {
        const current = await prisma.campaign.findFirst({ where: { id: query.get("campaignId")!, brand: { organizationId: ctx.organizationId } }, select: { brandId: true } });
        if (!current) return new NextResponse("Image not found", { status: 404 });
        campaignIds = (await prisma.campaign.findMany({ where: { brandId: current.brandId, brand: { organizationId: ctx.organizationId } }, select: { id: true } })).map(campaign => campaign.id);
      }
      source = (await prisma.mediaAsset.findFirst({ where: { id: query.get("assetId")!, organizationId: ctx.organizationId, ...(campaignIds ? { campaignId: { in: campaignIds } } : {}), kind: { in: ["ai_image", "product_photo", "reel_scene_image", "social_creative"] }, status: { in: ["ready", "superseded"] } } }))?.url || null;
    }
    else if (query.get("brandId")) source = (await prisma.brand.findFirst({ where: { id: query.get("brandId")!, organizationId: ctx.organizationId } }))?.logoUrl || null;
    if (!source) return new NextResponse("Image not found", { status: 404 });
    let bytes: Buffer;
    if (source.startsWith("data:")) {
      const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(source);
      if (!match || match[1].length > 28_000_000) throw new Error("Invalid image"); bytes = Buffer.from(match[1], "base64");
    } else {
      bytes = (await fetchPublicBytes(source, 20_000_000)).bytes;
    }
    const size = query.get("thumbnail") === "1" ? 256 : 1920;
    const image = await sharp(bytes, { limitInputPixels: 30_000_000 }).rotate().resize(size, size, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return new NextResponse(new Uint8Array(image), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", ...(query.get("download") === "1" ? { "Content-Disposition": "attachment; filename=creative-photo.png" } : {}) } });
  } catch (error) { return apiError(error, "Could not load this image. Upload its photo instead."); }
}
