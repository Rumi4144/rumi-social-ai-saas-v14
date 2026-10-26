import { prisma } from "@/lib/prisma";
import { recentVisualConcept, type VisualConcept, type RecentVisualConcept } from "./visual-plan";

// Use the persisted full sequence; bounded recent-history size is not a sequence.
export function regenerationVariationIndex(contentItemId: string, concept?: VisualConcept, postRank?: number): number {
  if (typeof concept?.variationIndex === "number" && Number.isSafeInteger(concept.variationIndex) && concept.variationIndex >= 0) return concept.variationIndex;
  if (postRank !== undefined && Number.isInteger(postRank) && postRank >= 0) return postRank;
  const slot = concept?.direction?.match(/campaign casting slot (\d+):/);
  if (slot && Number(slot[1]) >= 1 && Number(slot[1]) <= 7) return Number(slot[1]) - 1;
  // Legacy posts have no saved slot. Stable identity prevents concurrent requests
  // from all selecting the same slot merely because they share the same history.
  return Array.from(contentItemId).reduce((hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0, 0);
}

export async function recentBrandConcepts(organizationId: string, brandId: string, before?: Date): Promise<RecentVisualConcept[]> {
  const campaigns = await prisma.campaign.findMany({
    where: { brandId, brand: { organizationId } },
    orderBy: { createdAt: "desc" }, take: 8, select: { id: true },
  });
  if (!campaigns.length) return [];
  const jobs = await prisma.job.findMany({
    where: {
      organizationId, type: "GENERATE_IMAGE", status: { in: ["queued", "running", "succeeded"] },
      ...(before ? { createdAt: { lt: before } } : {}),
      OR: campaigns.map(campaign => ({ payload: { path: ["campaignId"], equals: campaign.id } })),
    },
    orderBy: { createdAt: "desc" }, take: 12, select: { payload: true },
  });
  return jobs.reverse().flatMap(job => {
    const payload = job.payload as { visualConcept?: VisualConcept; originalDirection?: string; prompt?: string };
    return [recentVisualConcept(payload.visualConcept, payload.originalDirection || payload.prompt)];
  });
}

