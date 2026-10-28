import ReelEditor from "../ReelEditor";
import { studioPageContext } from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
import { prisma } from "@/lib/prisma";
export default async function ReelPage({ searchParams }: { searchParams: Promise<{ campaignId?: string; contentItemId?: string; clips?: string }> }) {
  const params = await searchParams;
  const { context: ctx, recovery } = await studioPageContext();
  if (recovery) return <StudioRecovery recovery={recovery} />;
  const campaigns = await prisma.campaign.findMany({ where: { brand: { organizationId: ctx.organizationId } }, select: { id: true, title: true }, orderBy: { createdAt: "desc" }, take: 100 });
  const ids = [...new Set((params.clips || "").split(",").filter(id => /^[a-zA-Z0-9-]{10,80}$/.test(id)))].slice(0, 6);
  const assets = ids.length ? await prisma.mediaAsset.findMany({ where: { id: { in: ids }, organizationId: ctx.organizationId, status: "ready", provider: "runway", kind: { in: ["ai_video", "campaign_video"] } }, select: { id: true } }) : [];
  const initialClips = ids.length && assets.length === ids.length ? ids.map((id, index) => ({ id, src: `/api/video/file?jobId=${id}`, kind: "video" as const, seconds: 5, label: `Saved clip ${index + 1}` })) : [];
  return <ReelEditor quick initialClips={initialClips} initialCampaigns={campaigns} initialCampaignId={params.campaignId || ""} initialContentItemId={params.contentItemId || ""} />;
}
