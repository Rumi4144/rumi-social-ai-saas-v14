import type { Prisma, PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { requiresVideo } from "@/lib/campaign/content-plan";
import { lockedDeliveryStatuses, savedItemMedia } from "@/components/weekly/item-policy";
import { fetchPublicBytes } from "@/lib/reels/public-fetch";
import { renderSocialSvg, type SocialSvgInput } from "@/lib/render/svg";
import { pictureRecipe } from "@/lib/render/picture-recipe";
import { isWeeklyDesign } from "@/lib/render/weekly-layouts";
import { logoToPngDataUrl, svgToPublishJpeg, weeklyDesignFonts } from "@/lib/render/raster";

export class PictureError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
type Context = { organizationId: string; userId: string; isSuperAdmin?: boolean };
type Database = PrismaClient | Prisma.TransactionClient;
const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const photoKinds = ["product_photo", "ai_image", "reel_scene_image"];

export async function editablePicture(db: Database, ctx: Context, id: string, allowPendingPhotoSelection = false) {
  const item = await db.contentItem.findFirst({ where: { id, campaign: { brand: { organizationId: ctx.organizationId } } }, include: { campaign: { include: { brand: true } } } });
  if (!item) throw new PictureError("Post not found in this workspace.", 404);
  if (requiresVideo(item.type)) throw new PictureError("Picture replacement is available for image ads. Request a change for a reel.");
  if (!["draft", "approved"].includes(item.status)) throw new PictureError("Scheduled and posted ads keep their saved picture. Cancel scheduling before changing a draft.");
  const active = await db.publishJob.findFirst({ where: { organizationId: ctx.organizationId, contentItemId: id, status: { in: lockedDeliveryStatuses } } });
  if (active) throw new PictureError("This ad has a scheduled or completed delivery. Its picture cannot be changed here.");
  if (!allowPendingPhotoSelection && !ctx.isSuperAdmin) {
    const request = await db.job.findFirst({ where: { organizationId: ctx.organizationId, type: "CONTENT_CHANGE_REQUEST", status: "pending", payload: { path: ["contentItemId"], equals: id } } });
    if (request) throw new PictureError("Admin is already working on your requested changes. Try again when they are finished.");
  }
  // Photo selection remains available while Admin reviews a change request.
  // Replacing artwork does not resolve the request or approve the post.
  const reference = savedItemMedia(item.mediaUrl);
  if (!reference || reference.kind !== "image") throw new PictureError("Wait for the finished design before replacing its picture.");
  const creative = await db.mediaAsset.findFirst({ where: { id: reference.id, organizationId: ctx.organizationId, campaignId: item.campaignId, contentItemId: id, kind: "social_creative", status: "ready", url: { not: null } } });
  if (!creative) throw new PictureError("The finished design is unavailable. Request a change from Admin.");
  return { item, creative };
}

export async function savedPictureRecipe({ item, creative }: Awaited<ReturnType<typeof editablePicture>>): Promise<SocialSvgInput> {
  const meta = object(creative.metadata), brand = item.campaign.brand;
  return meta.pictureRecipe || {
    headline: item.headline || "", cta: "Discover More", brand: brand.name,
    format: meta.format || "portrait", designStyle: meta.designStyle || brand.designStyle || "classic",
    textPosition: meta.textPosition || "left", logoUrl: await logoToPngDataUrl(brand.logoUrl, brand.websiteUrl),
    primaryColor: brand.primaryColor || undefined, secondaryColor: brand.secondaryColor || undefined,
    accentColor: brand.accentColor || undefined, headingFont: brand.headingFont || undefined, bodyFont: brand.bodyFont || undefined,
  };
}

async function sourceWhere(ctx: Context, brandId: string): Promise<Prisma.MediaAssetWhereInput> {
  const campaigns = await prisma.campaign.findMany({ where: { brandId, brand: { organizationId: ctx.organizationId } }, select: { id: true } });
  return { organizationId: ctx.organizationId, kind: { in: photoKinds }, status: { in: ["ready", "superseded"] }, url: { not: null }, OR: [
    { campaignId: { in: campaigns.map(row => row.id) } },
    { campaignId: null, metadata: { path: ["brandId"], equals: brandId } },
  ] };
}

export async function pictureChoices(ctx: Context, id: string) {
  const { item } = await editablePicture(prisma, ctx, id, true);
  const assets = await prisma.mediaAsset.findMany({ where: await sourceWhere(ctx, item.campaign.brandId), orderBy: { createdAt: "desc" }, take: 120, select: { id: true, url: true, kind: true, metadata: true } });
  const seen = new Set<string>();
  return assets.filter(row => { if (!row.url || seen.has(row.url)) return false; seen.add(row.url); return true; }).slice(0, 60).map(row => {
    const meta = object(row.metadata);
    return { id: row.id, src: `/api/reels/media?assetId=${encodeURIComponent(row.id)}&thumbnail=1`, label: String(meta.productName || meta.label || (row.kind === "ai_image" ? "Saved AI photo" : "Saved photo")).slice(0, 200) };
  });
}

/** Decode and cap both uploads and saved remote sources before rendering. */
export async function normalizePicture(source: Buffer | string) {
  let bytes: Buffer;
  if (Buffer.isBuffer(source)) bytes = source;
  else if (source.startsWith("data:")) {
    const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(source);
    if (!match || match[1].length > 28_000_000) throw new PictureError("Choose a JPEG, PNG or WebP picture.", 400);
    bytes = Buffer.from(match[1], "base64");
  } else bytes = (await fetchPublicBytes(source, 20_000_000)).bytes;
  try {
    const photo = sharp(bytes, { limitInputPixels: 30_000_000, animated: false });
    const metadata = await photo.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format || "")) throw new Error("Unsupported picture");
    photo.rotate().resize(2048, 2048, { fit: "inside", withoutEnlargement: true });
    const normalized = await (metadata.hasAlpha ? photo.png() : photo.jpeg({ quality: 92 })).toBuffer();
    return `data:image/${metadata.hasAlpha ? "png" : "jpeg"};base64,${normalized.toString("base64")}`;
  } catch { throw new PictureError("This picture could not be opened. Choose a JPEG, PNG or WebP file.", 400); }
}

export async function replacePicture(ctx: Context, id: string, input: { expectedMediaUrl: string; assetId?: string; upload?: Buffer }) {
  const snapshot = await editablePicture(prisma, ctx, id, true), { item, creative } = snapshot;
  if (item.mediaUrl !== input.expectedMediaUrl) throw new PictureError("This ad changed. Refresh it before choosing another picture.");
  const source = input.assetId ? await prisma.mediaAsset.findFirst({ where: { ...await sourceWhere(ctx, item.campaign.brandId), id: input.assetId } }) : null;
  if (!input.upload && !source?.url) throw new PictureError("Saved picture not found for this business.", 404);
  const imageUrl = await normalizePicture(input.upload || source!.url!);
  const meta = object(creative.metadata), brand = item.campaign.brand;
  // Older exports did not store a full recipe. Recover their saved format/layout;
  // new exports retain the exact brand settings, wording and supporting images.
  const recipe = await savedPictureRecipe(snapshot);
  const rendered = await svgToPublishJpeg(renderSocialSvg({ ...recipe, imageUrl, ...(isWeeklyDesign(recipe.designStyle) ? { designFonts: await weeklyDesignFonts() } : {}) }));
  // Rendering happens before this transaction: failed fetches/exports leave the
  // original artwork and approval intact. Recheck delivery and review races here.
  return prisma.$transaction(async tx => {
    const current = await editablePicture(tx, ctx, id, true);
    if (current.item.mediaUrl !== item.mediaUrl || current.item.headline !== item.headline || current.item.caption !== item.caption || current.item.status !== item.status) throw new PictureError("This ad changed while preparing the picture. Refresh before trying again.");
    const selected = await tx.mediaAsset.create({ data: {
      organizationId: ctx.organizationId, campaignId: item.campaignId, contentItemId: id,
      kind: source?.kind || "product_photo", provider: input.upload ? "upload" : "reuse", status: "ready", url: imageUrl,
      metadata: { ...object(source?.metadata), brandId: brand.id, sourceAssetId: source?.id || null, userSelected: true, label: "Customer-selected picture" },
    } });
    const updated = await tx.mediaAsset.create({ data: {
      organizationId: ctx.organizationId, campaignId: item.campaignId, contentItemId: id, kind: "social_creative", provider: "internal-raster", status: "ready",
      url: `data:image/jpeg;base64,${rendered.toString("base64")}`,
      metadata: { ...meta, pictureRecipe: pictureRecipe(recipe), sourceAssetId: selected.id, previousCreativeId: creative.id, customerReplacedPicture: true },
    } });
    await tx.contentItem.update({ where: { id }, data: { mediaUrl: `/api/media/${updated.id}`, status: "draft" } });
    await tx.auditLog.create({ data: { organizationId: ctx.organizationId, userId: ctx.userId, action: "weekly.picture_replaced", resource: "content_item", resourceId: id, metadata: { previousCreativeId: creative.id, creativeId: updated.id, sourceAssetId: selected.id } } });
    return { mediaUrl: `/api/media/${updated.id}`, status: "draft" };
  }, { isolationLevel: "Serializable" });
}
