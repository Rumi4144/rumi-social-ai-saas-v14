import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { superAdminContext } from "@/lib/admin/context";

export default async function AdminPage() {
  try {
    await superAdminContext();
  } catch (error: any) {
    if (error?.message === "UNAUTHENTICATED") {
      redirect("/login");
    }
    redirect("/dashboard");
  }

  const organizations = await prisma.organization.findMany({
    orderBy: {
      name: "asc",
    },
    include: {
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      },
      brands: {
        include: {
          _count: {
            select: {
              campaigns: true,
            },
          },
        },
      },
      subscription: true,
    },
  });

  const totals = organizations.reduce(
    (acc, org) => {
      acc.users += org.memberships.length;
      acc.brands += org.brands.length;
      acc.campaigns += org.brands.reduce(
        (sum, brand) => sum + brand._count.campaigns,
        0,
      );
      acc.credits += org.subscription?.credits ?? 0;
      return acc;
    },
    {
      users: 0,
      brands: 0,
      campaigns: 0,
      credits: 0,
    },
  );

  return (
    <>
      <section className="hero v2">
        <div>
          <div className="eyebrow">MASTER ADMIN · RUMI SOCIAL AI</div>

          <h1>Control Center</h1>

          <p>
            Manage organizations, users, brands, campaigns, plans and usage
            across the platform.
          </p>
        </div>

        <div className="orb">
          ADMIN
          <small>SECURE</small>
        </div>
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
          gap: 14,
          marginTop: 28,
        }}
      >
        {[
          ["Organizations", organizations.length],
          ["Users", totals.users],
          ["Brands", totals.brands],
          ["Campaigns", totals.campaigns],
          ["AI Credits", totals.credits],
        ].map(([label, value]) => (
          <div className="card" key={label}>
            <div className="eyebrow">{label}</div>
            <div
              style={{
                fontSize: 36,
                fontWeight: 800,
                marginTop: 8,
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 20,
          marginTop: 28,
        }}
      >
        {organizations.map((org) => {
          const campaignCount = org.brands.reduce(
            (total, brand) => total + brand._count.campaigns,
            0,
          );

          return (
            <section className="card" key={org.id}>
              <div className="eyebrow">ORGANIZATION</div>

              <h2>{org.name}</h2>

              <p>
                <strong>{org.memberships.length}</strong>{" "}
                {org.memberships.length === 1 ? "member" : "members"}
                {" · "}
                <strong>{org.brands.length}</strong>{" "}
                {org.brands.length === 1 ? "brand" : "brands"}
                {" · "}
                <strong>{campaignCount}</strong>{" "}
                {campaignCount === 1 ? "campaign" : "campaigns"}
              </p>

              <div
                style={{
                  marginTop: 18,
                  paddingTop: 18,
                  borderTop: "1px solid rgba(0,0,0,.12)",
                }}
              >
                <strong>Users</strong>

                {org.memberships.map((membership) => (
                  <p key={membership.id} style={{ margin: "8px 0" }}>
                    {membership.user.name || membership.user.email}
                    <br />
                    <small>
                      {membership.user.email} · {membership.role}
                    </small>
                  </p>
                ))}
              </div>

              <div
                style={{
                  marginTop: 18,
                  paddingTop: 18,
                  borderTop: "1px solid rgba(0,0,0,.12)",
                }}
              >
                <strong>Subscription</strong>

                <p>
                  {org.subscription
                    ? `${org.subscription.plan} · ${org.subscription.credits} credits`
                    : "No subscription"}
                </p>
              </div>

              <p style={{ marginTop: 16 }}>
                <strong>Status:</strong>{" "}
                {org.status === "suspended" ? "Suspended" : "Active"}
              </p>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  marginTop: 20,
                }}
              >
                <Link
                  className="button"
                  href={`/admin/organizations/${org.id}`}
                  scroll={true}
                >
                  Manage Organization
                </Link>

                <Link className="button gold" href={`/admin/enter/${org.id}`}>
                  Enter Workspace
                </Link>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
