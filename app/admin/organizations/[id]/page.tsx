import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { superAdminContext } from "@/lib/admin/context";

export default async function AdminOrganizationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await superAdminContext();
  } catch (error: any) {
    if (error?.message === "UNAUTHENTICATED") {
      redirect("/login");
    }
    redirect("/dashboard");
  }

  const { id } = await params;

  const organization = await prisma.organization.findUnique({
    where: { id },
    include: {
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              isSuperAdmin: true,
            },
          },
        },
      },
      brands: {
        include: {
          campaigns: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              title: true,
              status: true,
              goal: true,
              createdAt: true,
            },
          },
        },
      },
      subscription: true,
    },
  });

  if (!organization) notFound();

  const campaigns = organization.brands.flatMap((brand) =>
    brand.campaigns.map((campaign) => ({
      ...campaign,
      brandName: brand.name,
    })),
  );

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <Link href="/admin" scroll={true}>
          ← Back to Control Center
        </Link>
      </div>

      <section className="hero v2">
        <div>
          <div className="eyebrow">MASTER ADMIN · ORGANIZATION</div>
          <h1>{organization.name}</h1>
          <p>
            {organization.memberships.length} members ·{" "}
            {organization.brands.length} brands · {campaigns.length} campaigns
          </p>

          <div style={{ marginTop: 20 }}>
            <Link
              className="button gold"
              href={`/admin/enter/${organization.id}`}
            >
              Enter {organization.name} Workspace →
            </Link>
          </div>
        </div>
      </section>

      <div className="twocol" style={{ marginTop: 28 }}>
        <section className="card">
          <h2>Users & Access</h2>

          {organization.memberships.map((membership) => (
            <div
              key={membership.id}
              style={{
                padding: "14px 0",
                borderBottom: "1px solid rgba(0,0,0,.1)",
              }}
            >
              <strong>{membership.user.name || membership.user.email}</strong>

              <p style={{ margin: "5px 0" }}>{membership.user.email}</p>

              <small>
                {membership.role}
                {membership.user.isSuperAdmin ? " · SUPER ADMIN" : ""}
              </small>
            </div>
          ))}
        </section>

        <section className="card">
          <h2>Plan & Usage</h2>

          {organization.subscription ? (
            <>
              <p>
                <strong>Plan:</strong> {organization.subscription.plan}
              </p>

              <p>
                <strong>Status:</strong> {organization.subscription.status}
              </p>

              <p>
                <strong>AI Credits:</strong> {organization.subscription.credits}
              </p>
            </>
          ) : (
            <p>No subscription.</p>
          )}

          <h2 style={{ marginTop: 28 }}>Brands</h2>

          {organization.brands.map((brand) => (
            <p key={brand.id}>
              <strong>{brand.name}</strong> · {brand.campaigns.length} campaigns
            </p>
          ))}
        </section>
      </div>

      <section className="card" style={{ marginTop: 24 }}>
        <h2>Campaigns</h2>

        {campaigns.length === 0 ? (
          <p>No campaigns.</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: 16,
              marginTop: 18,
            }}
          >
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                style={{
                  border: "1px solid rgba(0,0,0,.12)",
                  borderRadius: 16,
                  padding: 18,
                }}
              >
                <div className="eyebrow">
                  {campaign.status.toUpperCase()} · {campaign.brandName}
                </div>

                <h3>{campaign.title}</h3>
                <p>Goal: {campaign.goal}</p>

                <Link href={`/campaigns/${campaign.id}`}>View campaign →</Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
