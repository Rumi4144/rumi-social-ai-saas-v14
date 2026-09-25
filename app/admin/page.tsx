import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { superAdminContext } from "@/lib/admin/context";
import AdminOrganizationGrid from "@/components/AdminOrganizationGrid";
import AdminCreateOrganization from "@/components/AdminCreateOrganization";

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

      <AdminCreateOrganization />

      <AdminOrganizationGrid organizations={organizations} />
    </>
  );
}
