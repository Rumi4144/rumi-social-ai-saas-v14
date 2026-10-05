import { prisma } from "@/lib/prisma";
import { isSubjectCategory, type VisualConcept, type RecentVisualConcept } from "./visual-plan";

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
    const concept = payload.visualConcept;
    return [{ subjectCategory: isSubjectCategory(concept?.subjectCategory) ? concept.subjectCategory : undefined, direction: (payload.originalDirection || payload.prompt || concept?.direction || "").slice(0, 600) }];
  });
}

