import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Snapshot = { id: string; campaignId: string; mediaUrl: string | null; headline: string | null; caption: string | null };
/** Each published media URL is immutable; selecting a revision needs fresh approval. */
export async function saveCreativeRevision(data: Prisma.MediaAssetUncheckedCreateInput, snapshot?: Snapshot | null) {
  if (!snapshot) return prisma.mediaAsset.create({ data });
  return prisma.$transaction(async tx => {
    const current = await tx.contentItem.findFirst({ where: { id: snapshot.id, campaignId: snapshot.campaignId, campaign: { brand: { organizationId: data.organizationId } } } });
    if (!current) throw new Error("Post not found in this workspace.");
    if (!["draft", "approved"].includes(current.status)) throw new Error("Cancel scheduled posting before changing this design.");
    if (current.mediaUrl !== snapshot.mediaUrl || current.headline !== snapshot.headline || current.caption !== snapshot.caption) throw new Error("This post changed during preparation. Refresh before saving the design.");
    const delivery = await tx.publishJob.findFirst({ where: { organizationId: data.organizationId, contentItemId: snapshot.id, status: { in: ["scheduled", "retry", "publishing", "processing", "verification_pending", "published"] } } });
    if (delivery) throw new Error("Cancel scheduled posting before changing this design.");
    const asset = await tx.mediaAsset.create({ data });
    await tx.contentItem.update({ where: { id: snapshot.id }, data: { mediaUrl: `/api/media/${asset.id}`, status: "draft" } });
    return asset;
  }, { isolationLevel: "Serializable" });
}
