import sharp from "sharp";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { editablePicture, normalizePicture, PictureError, savedPictureRecipe } from "./replace-picture";
import { WEEKLY_DESIGN_CHOICES, WEEKLY_DESIGN_FAMILIES, isWeeklyDesign } from "@/lib/render/weekly-layouts";
import { renderSocialSvg } from "@/lib/render/svg";
import { svgToPublishJpeg, weeklyDesignFonts } from "@/lib/render/raster";
import { pictureRecipe } from "@/lib/render/picture-recipe";
import { manifestOf } from "@/lib/weekly/plan";

type Context = { organizationId: string; userId: string };
type Database = PrismaClient | Prisma.TransactionClient;
const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
const PAGE_SIZE = 6;

async function weeklySlot(db: Database, ctx: Context, campaignId: string, id: string) {
  const record = await db.job.findFirst({ where: { organizationId: ctx.organizationId, type: { in: ["WEEKLY_PACK", "EXTRA_CREATION"] }, payload: { path: ["campaignId"], equals: campaignId } } });
  const manifest = manifestOf(record?.payload);
  const items = object(record?.result).items;
  const mapping = Array.isArray(items) ? items.find(row => row?.contentItemId === id) : null;
  return { record, manifest, slot: manifest?.slots.find(slot => slot.key === mapping?.slotKey) };
}

async function designSnapshot(ctx: Context, id: string, expectedMediaUrl: string) {
  const snapshot = await editablePicture(prisma, ctx, id), { item, creative } = snapshot;
  if (item.mediaUrl !== expectedMediaUrl) throw new PictureError("This ad changed. Close the chooser and refresh before trying again.");
  const meta = object(creative.metadata), recipe = await savedPictureRecipe(snapshot);
  const scope = { organizationId: ctx.organizationId, campaignId: item.campaignId, contentItemId: id, kind: { in: ["product_photo", "ai_image", "reel_scene_image"] }, status: { in: ["ready", "superseded"] }, url: { not: null } };
  const selected = typeof meta.sourceAssetId === "string" ? await prisma.mediaAsset.findFirst({ where: { ...scope, id: meta.sourceAssetId } }) : null;
  let sourceUrl = selected?.url || (typeof meta.sourceImageUrl === "string" ? meta.sourceImageUrl : null);
  if (meta.sourceAssetId && !selected) throw new PictureError("The saved source photo is unavailable. Use Replace picture to choose it again.");
  if (!sourceUrl) {
    // Legacy exports may have only one source. Never guess between multiple
    // photos or use the flattened ad as the new layout's product picture.
    const sources = await prisma.mediaAsset.findMany({ where: { ...scope, createdAt: { lte: creative.createdAt } }, select: { url: true }, take: 120 });
    const urls = [...new Set(sources.map(source => source.url).filter((url): url is string => !!url))];
    if (urls.length === 1) sourceUrl = urls[0];
  }
  if (!sourceUrl) throw new PictureError("Choose a photo with Replace picture first, then try another design.");
  const imageUrl = await normalizePicture(sourceUrl);
  return { ...snapshot, meta, recipe, sourceUrl, imageUrl, designFonts: await weeklyDesignFonts() };
}

export async function designChoices(ctx: Context, id: string, input: { expectedMediaUrl: string; page?: number; family?: string; layout?: string }) {
  if (input.layout && !isWeeklyDesign(input.layout)) throw new PictureError("Choose a design from the library.", 400);
  const snapshot = await designSnapshot(ctx, id, input.expectedMediaUrl);
  const filtered = WEEKLY_DESIGN_CHOICES.filter(choice => !input.family || choice.family === input.family);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), page = Math.min(input.page || 0, pageCount - 1);
  const choices = input.layout ? WEEKLY_DESIGN_CHOICES.filter(choice => choice.value === input.layout) : filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const previews = [];
  for (const choice of choices) {
    const jpeg = await svgToPublishJpeg(renderSocialSvg({ ...snapshot.recipe, imageUrl: snapshot.imageUrl, designStyle: choice.value, designFonts: snapshot.designFonts }));
    const preview = input.layout ? jpeg : await sharp(jpeg).resize({ width: 360 }).jpeg({ quality: 82 }).toBuffer();
    previews.push({ id: choice.value, label: choice.label, family: choice.family, src: `data:image/jpeg;base64,${preview.toString("base64")}` });
  }
  return { choices: previews, currentDesign: snapshot.recipe.designStyle, page, pageCount, total: filtered.length, families: WEEKLY_DESIGN_FAMILIES };
}

export async function changeDesign(ctx: Context, id: string, input: { expectedMediaUrl: string; layout: string }) {
  if (!isWeeklyDesign(input.layout)) throw new PictureError("Choose a design from the library.", 400);
  const snapshot = await designSnapshot(ctx, id, input.expectedMediaUrl), { item, creative, meta, recipe } = snapshot;
  if (recipe.designStyle === input.layout) throw new PictureError("That is already this ad’s design. Choose another layout.", 400);
  const updatedRecipe = { ...recipe, designStyle: input.layout };
  const jpeg = await svgToPublishJpeg(renderSocialSvg({ ...updatedRecipe, imageUrl: snapshot.imageUrl, designFonts: snapshot.designFonts }));
  return prisma.$transaction(async tx => {
    const current = await editablePicture(tx, ctx, id);
    if (current.item.mediaUrl !== item.mediaUrl || current.item.headline !== item.headline || current.item.caption !== item.caption || current.item.status !== item.status) throw new PictureError("This ad changed while preparing the design. Refresh before trying again.");
    const updated = await tx.mediaAsset.create({ data: {
      organizationId: ctx.organizationId, campaignId: item.campaignId, contentItemId: id, kind: "social_creative", provider: "internal-raster", status: "ready",
      url: `data:image/jpeg;base64,${jpeg.toString("base64")}`,
      metadata: { ...meta, designStyle: input.layout, pictureRecipe: pictureRecipe(updatedRecipe), sourceImageUrl: snapshot.sourceUrl, previousCreativeId: creative.id, customerChangedDesign: true },
    } });
    await tx.contentItem.update({ where: { id }, data: { mediaUrl: `/api/media/${updated.id}`, status: "draft" } });
    // Subsequent weekly packs should remember the customer's chosen layout.
    const { record, manifest, slot } = await weeklySlot(tx, ctx, item.campaignId, id);
    if (record && manifest && slot && manifest.brandId === item.campaign.brandId) {
      await tx.job.update({ where: { id: record.id }, data: { payload: { ...object(record.payload), slots: manifest.slots.map(saved => saved.key === slot.key ? { ...saved, layout: input.layout } : saved) } as Prisma.InputJsonObject } });
    }
    await tx.auditLog.create({ data: { organizationId: ctx.organizationId, userId: ctx.userId, action: "weekly.design_changed", resource: "content_item", resourceId: id, metadata: { previousCreativeId: creative.id, creativeId: updated.id, previousLayout: recipe.designStyle || "classic", layout: input.layout } } });
    return { mediaUrl: `/api/media/${updated.id}`, status: "draft" };
  }, { isolationLevel: "Serializable" });
}
