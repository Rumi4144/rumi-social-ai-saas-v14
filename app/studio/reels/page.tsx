import ReelEditor from "./ReelEditor";
import { studioPageContext } from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
import { prisma } from "@/lib/prisma";
export default async function ReelPage({ searchParams }: { searchParams: Promise<{ campaignId?: string; contentItemId?: string }> }) {
  const params = await searchParams;
  const { context: ctx, recovery } = await studioPageContext();
  if (recovery) return <StudioRecovery recovery={recovery} />;
  const campaigns = await prisma.campaign.findMany({ where: { brand: { organizationId: ctx.organizationId } }, select: { id: true, title: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return <ReelEditor initialCampaigns={campaigns} initialCampaignId={params.campaignId || ""} initialContentItemId={params.contentItemId || ""} />;
}
