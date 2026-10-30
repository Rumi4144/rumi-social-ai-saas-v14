import Link from "next/link";

export default function AdminTabs({ active }: { active: "overview" | "activity" | "design-formats" | "archive" | "requests" | "annual-plan" }) {
  return <nav aria-label="Admin sections" style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 24px" }}>
    {[
      ["overview", "/admin", "Control Center"],
      ["activity", "/admin/activity", "User Activity"],
      ["design-formats", "/admin/design-formats", "Design Formats"],
      ["annual-plan", "/admin/annual-plan", "Annual Plan"],
      ["requests", "/admin/requests", "Customer Requests"],
      ["archive", "/admin/archive", "Published Archive"],
    ].map(([key, href, label]) => <Link key={key} href={href} aria-current={active === key ? "page" : undefined} style={{ background: active === key ? "#17675c" : "#fff", color: active === key ? "#fff" : "#174b40", border: "1px solid #ccdcd6", padding: "11px 16px", borderRadius: 10 }}>{label}</Link>)}
  </nav>;
}
