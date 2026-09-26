"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Organization = {
  id: string;
  name: string;
  status: string;
  memberships: {
    id: string;
    role: string;
    user: {
      id: string;
      email: string;
      name: string | null;
    };
  }[];
  brands: {
    id: string;
    name: string;
    _count: {
      campaigns: number;
    };
  }[];
  subscription: {
    plan: string;
    credits: number;
  } | null;
};

export default function AdminOrganizationGrid({
  organizations,
}: {
  organizations: Organization[];
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "suspended">("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return organizations.filter((org) => {
      const matchesStatus = filter === "all" || org.status === filter;

      const matchesSearch =
        !q ||
        org.name.toLowerCase().includes(q) ||
        org.memberships.some(
          (membership) =>
            membership.user.email.toLowerCase().includes(q) ||
            membership.user.name?.toLowerCase().includes(q),
        );

      return matchesStatus && matchesSearch;
    });
  }, [organizations, search, filter]);

  return (
    <>
      <div
        className="card"
        style={{
          marginTop: 28,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          type="search"
          placeholder="Search organizations or users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: "1 1 320px",
            minWidth: 220,
          }}
        />

        {(["all", "active", "suspended"] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={filter === value ? "button" : ""}
            onClick={() => setFilter(value)}
          >
            {value === "all"
              ? "All"
              : value === "active"
                ? "Active"
                : "Suspended"}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 20,
          marginTop: 20,
        }}
      >
        {filtered.map((org) => {
          const campaignCount = org.brands.reduce(
            (total, brand) => total + brand._count.campaigns,
            0,
          );

          return (
            <section className="card" key={org.id}>
              <div className="eyebrow">ORGANIZATION</div>

              <h2>{org.name}</h2>
              <p style={{ fontSize: 11, opacity: 0.65 }}>
                DEBUG ID: {org.id}
              </p>

              <p>
                <strong>{org.memberships.length}</strong>{" "}
                {org.memberships.length === 1 ? "member" : "members"} ·{" "}
                <strong>{org.brands.length}</strong>{" "}
                {org.brands.length === 1 ? "brand" : "brands"} ·{" "}
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

      {filtered.length === 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3>No organizations found</h3>
          <p>Try another search or status filter.</p>
        </div>
      )}
    </>
  );
}
