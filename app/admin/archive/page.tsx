import Link from "next/link";
import { redirect } from "next/navigation";
import AdminTabs from "@/components/AdminTabs";
import AdminCustomerFilter from "@/components/AdminCustomerFilter";
import AdminDeliveryList from "@/components/AdminDeliveryList";
import { superAdminContext } from "@/lib/admin/context";
import { adminCustomerSelection, publishedCustomerHistory } from "@/lib/admin/customer-history";

export const dynamic = "force-dynamic";

export default async function PublishedArchive({ searchParams }: { searchParams: Promise<{ organizationId?: string; after?: string; q?: string }> }) {
  try { await superAdminContext(); }
  catch (error) { redirect(error instanceof Error && error.message === "UNAUTHENTICATED" ? "/login" : "/dashboard"); }
  const query = await searchParams;
  const selection = await adminCustomerSelection(query.organizationId, query.q);
  const history = selection.organization ? await publishedCustomerHistory(selection.organization.id, query.after) : null;
  return <>
    <AdminTabs active="archive" />
    <div className="eyebrow">MASTER ADMIN</div><h1>Published archive</h1>
    <p>Each customer's published posts stay with their original campaign. Account outcomes remain visible, including deliveries that still need attention.</p>
    <AdminCustomerFilter action="/admin/archive" {...selection} search={query.q} />
    {selection.organization && <h2>{selection.organization.name}</h2>}
    {!selection.organization && <p>No matching customer found.</p>}
    {history && !history.items.length && <p>No published posts on this page.</p>}
    {history?.deliverySummaryLimited && <p>Showing recent delivery outcomes below. Open a post's complete delivery history for every account outcome.</p>}
    {history?.items.map(item => <article key={item.id} className="card" style={{ marginBottom: 20 }}>
      <div className="eyebrow">{item.campaign.brand.name} · {item.type}</div>
      <h3>{item.headline || "Untitled post"}</h3>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.caption || "No caption"}</p>
      <p>{item.campaign.title} · Created {item.createdAt.toLocaleDateString("en-US", { timeZone: "UTC" })}</p>
      {item.deliveries.length ? <AdminDeliveryList deliveries={item.deliveries} /> : <p>{history.deliverySummaryLimited ? "Open delivery history to see this post's outcomes." : "Recorded as published in the original campaign. No account-level delivery record is available."}</p>}
      <p><Link href={`/admin/archive/${encodeURIComponent(item.id)}?organizationId=${encodeURIComponent(selection.organization!.id)}`}>View complete delivery history →</Link></p>
      <Link href={`/admin/enter/${encodeURIComponent(selection.organization!.id)}?campaignId=${encodeURIComponent(item.campaign.id)}`} prefetch={false}>Open original campaign in this customer's workspace →</Link>
    </article>)}
    {history?.nextCursor && <Link className="button" href={`/admin/archive?organizationId=${encodeURIComponent(selection.organization!.id)}&after=${encodeURIComponent(history.nextCursor)}`}>Older posts →</Link>}
  </>;
}
