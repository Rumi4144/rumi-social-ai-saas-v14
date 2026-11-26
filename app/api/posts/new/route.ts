import { NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { prisma } from "@/lib/prisma";
import { MAX_CLIP_BYTES } from "@/lib/video/clips";
import { assertMp4Video } from "@/lib/video/mp4";

const fields = z.object({
  brandId: z.string().min(1).max(100),
  caption: z.string().trim().min(1).max(2200),
  requestId: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const workspace = await tenantContext();
    if (workspace.role === "viewer") throw new Error("FORBIDDEN");
    const form = await request.formData();
    const parsed = fields.safeParse({
      brandId: form.get("brandId"), caption: form.get("caption"), requestId: form.get("requestId"),
    });
    const media = form.get("media");
    if (!parsed.success || !(media instanceof File) || !media.size || media.size > MAX_CLIP_BYTES) {
      return NextResponse.json({ error: "Choose a brand, add a caption, and attach a photo or MP4 up to 3 MB." }, { status: 400 });
    }

    const { brandId, caption, requestId } = parsed.data;
    const brand = await prisma.brand.findFirst({
      where: { id: brandId, organizationId: workspace.organizationId }, select: { id: true },
    });
    if (!brand) throw new Error("FORBIDDEN");
    const campaignId = `manual_${brand.id}_${requestId}`;
    const contentItemId = `post_${campaignId}`;
    const bytes = Buffer.from(await media.arrayBuffer());
    const isVideo = media.type === "video/mp4" || /\.mp4$/i.test(media.name);
    let dataUrl: string;
    try {
      if (isVideo) {
        assertMp4Video(bytes);
        dataUrl = `data:video/mp4;base64,${bytes.toString("base64")}`;
      } else {
        const image = sharp(bytes, { limitInputPixels: 40_000_000 });
        const { format } = await image.metadata();
        if (!format || !["jpeg", "png", "webp"].includes(format)) throw new Error("Unsupported photo");
        const jpeg = await image.rotate().resize({ width: 1440, height: 1440, fit: "inside", withoutEnlargement: true }).flatten({ background: "#ffffff" }).jpeg().toBuffer();
        dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
      }
    } catch {
      return NextResponse.json({ error: "Choose a valid JPG, PNG, WebP, or MP4 file." }, { status: 400 });
    }

    await prisma.$transaction(async tx => {
      await tx.campaign.upsert({
        where: { id: campaignId },
        update: {},
        create: { id: campaignId, title: caption.slice(0, 100), goal: "Manual social post", brandId },
      });
      const existing = await tx.contentItem.findUnique({ where: { id: contentItemId }, select: { id: true } });
      if (existing) return;

      const asset = await tx.mediaAsset.create({
        data: {
          organizationId: workspace.organizationId, campaignId, contentItemId,
          kind: isVideo ? "campaign_video" : "social_creative",
          provider: "upload", url: dataUrl, status: "ready",
          metadata: { contentType: isVideo ? "video/mp4" : "image/jpeg" },
        },
      });
      await tx.contentItem.create({
        data: {
          id: contentItemId, campaignId, caption, platform: "multi",
          type: isVideo ? "reel_post" : "post", status: "approved",
          mediaUrl: isVideo ? `/api/video/media/${asset.id}` : `/api/media/${asset.id}`,
        },
      });
    });

    return NextResponse.json({ contentItemId });
  } catch (error) {
    return apiError(error, "Could not save your post. Try again.");
  }
}
