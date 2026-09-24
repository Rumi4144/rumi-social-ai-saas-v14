import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: {
      createdAt: "desc",
    },
    include: {
      brand: true,
      _count: {
        select: {
          items: true,
        },
      },
    },
  });

  return (
    <>
      <div className="eyebrow">CAMPAIGNS</div>

      <h1>All Campaigns</h1>

      <p style={{ marginBottom: 28 }}>
        Open, review and edit your existing campaigns.
      </p>

      {campaigns.length === 0 ? (
        <section className="card">
          <h2>No campaigns yet</h2>
          <p>Create your first campaign with Create Everything.</p>

          <Link href="/create">Create Everything</Link>
        </section>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 18,
          }}
        >
          {campaigns.map((campaign) => (
            <section className="card" key={campaign.id}>
              <div className="eyebrow">
                {campaign.status.toUpperCase()}
              </div>

              <h2>{campaign.title || "Untitled Campaign"}</h2>

              <p>
                {campaign.brand?.name
                  ? `${campaign.brand.name} · `
                  : ""}
                {campaign._count.items} creative
                {campaign._count.items === 1 ? "" : "s"}
              </p>

              <p style={{ opacity: 0.7 }}>
                Created{" "}
                {campaign.createdAt.toLocaleDateString()}
              </p>

              <Link href={`/campaigns/${campaign.id}`}>
                Open Campaign
              </Link>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
