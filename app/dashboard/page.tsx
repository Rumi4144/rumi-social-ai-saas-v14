import Link from "next/link";
import { redirect } from "next/navigation";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";

export default async function Dashboard() {
  const ctx = await tenantContext();

  const [campaigns, scheduled, published, sub, approval, onboarding] =
    await Promise.all([
      prisma.campaign.findMany({
        where: {
          brand: {
            organizationId: ctx.organizationId,
          },
        },
        include: {
          brand: true,
          _count: {
            select: { items: true },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 6,
      }),

      prisma.publishJob.count({
        where: {
          organizationId: ctx.organizationId,
          status: "scheduled",
        },
      }),

      prisma.publishJob.count({
        where: {
          organizationId: ctx.organizationId,
          status: "published",
        },
      }),

      prisma.subscription.findUnique({
        where: {
          organizationId: ctx.organizationId,
        },
      }),

      prisma.approvalShare.count({
        where: {
          organizationId: ctx.organizationId,
          status: "pending",
        },
      }),

      prisma.onboardingState.findUnique({
        where: {
          organizationId: ctx.organizationId,
        },
      }),
    ]);

  if (!ctx.isSuperAdmin && !onboarding?.completed) {
    redirect("/onboarding");
  }

  return (
    <>
      <section className="hero v2">
        <div>
          <div className="eyebrow">
            {ctx.organization.name.toUpperCase()} · CREATIVE OS
          </div>

          <h1>What should we create today?</h1>

          <p>
            Turn a product, service or idea into a complete campaign—then
            approve what goes live.
          </p>

          <Link className="button gold" href="/create">
            ✦ Create Everything
          </Link>

          {!onboarding?.completed && (
            <Link className="ghost" href="/get-started">
              Finish guided setup
            </Link>
          )}
        </div>

        <div className="orb">
          AI
          <small>READY</small>
        </div>
      </section>

      <div className="grid">
        {[
          ["CAMPAIGNS", campaigns.length],
          ["SCHEDULED", scheduled],
          ["PUBLISHED", published],
          ["AI CREDITS", sub?.credits || 0],
        ].map((x: any) => (
          <div className="card" key={String(x[0])}>
            <span className="eyebrow">{x[0]}</span>
            <div className="metric">{x[1]}</div>
          </div>
        ))}
      </div>

      {campaigns.length === 0 ? (
        <section className="emptylaunch">
          <span className="eyebrow">YOUR FIRST WIN</span>
          <h2>Create your first campaign in minutes.</h2>
          <p>
            Your Brand Brain is ready. Give us one product, service or idea and
            Rumi Social AI will build your first campaign.
          </p>
          <Link className="button" href="/create">
            Create Everything →
          </Link>
        </section>
      ) : (
        <section style={{ marginTop: 32 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "end",
              marginBottom: 16,
            }}
          >
            <div>
              <span className="eyebrow">YOUR CAMPAIGNS</span>
              <h2 style={{ margin: "6px 0 0" }}>Recent campaigns</h2>
            </div>

            <Link className="button" href="/create">
              + New Campaign
            </Link>
          </div>

          <div className="grid">
            {campaigns.map((campaign) => (
              <Link
                href={`/campaigns/${campaign.id}`}
                key={campaign.id}
                className="card"
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "block",
                }}
              >
                <span className="eyebrow">
                  {campaign.status.toUpperCase()} ·{" "}
                  {campaign.brand.name.toUpperCase()}
                </span>

                <h3 style={{ margin: "12px 0 8px", fontSize: 22 }}>
                  {campaign.title}
                </h3>

                <p style={{ margin: "0 0 16px" }}>
                  Goal: {campaign.goal} · {campaign._count.items} content items
                </p>

                <strong>Open campaign →</strong>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="twocol">
        <section>
          <h2>Workspace activity</h2>

          <div className="pipeline">
            <div>
              <b>{campaigns.length}</b>
              <span>Campaigns</span>
            </div>

            <div>
              <b>{approval}</b>
              <span>Awaiting approval</span>
            </div>

            <div>
              <b>{scheduled}</b>
              <span>Scheduled</span>
            </div>

            <div>
              <b>{published}</b>
              <span>Published</span>
            </div>
          </div>
        </section>

        <aside className="nextbest">
          <span>AI WORKFLOW</span>
          <h3>Keep approvals ahead of the publishing queue.</h3>
          <p>You stay in control: AI prepares; your team approves.</p>

          <Link className="button" href="/publishing">
            Open Publishing Center
          </Link>
        </aside>
      </div>
    </>
  );
}
