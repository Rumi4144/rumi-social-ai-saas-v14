import ReelEditor from "./ReelEditor";
export default async function ReelPage({ searchParams }: { searchParams: Promise<{ campaignId?: string; contentItemId?: string }> }) {
  const params = await searchParams;
  return <ReelEditor initialCampaignId={params.campaignId || ""} initialContentItemId={params.contentItemId || ""} />;
}
