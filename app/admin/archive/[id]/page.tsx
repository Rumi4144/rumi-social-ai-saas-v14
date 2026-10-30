import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import AdminTabs from "@/components/AdminTabs";
import AdminDeliveryList from "@/components/AdminDeliveryList";
import { superAdminContext } from "@/lib/admin/context";
import { adminCustomerSelection, customerDeliveryHistory } from "@/lib/admin/customer-history";

export const dynamic = "force-dynamic";

export default async function DeliveryHistory({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ organizationId?: string; after?: string }> }) {
  try { await superAdminContext(); }
  catch (error) { redirect(error instanceof Error && error.message === "UNAUTHENTICATED" ? "/login" : "/dashboard"); }
  const { id } = await params, query = await searchParams;
  if (!query.organizationId) notFound();
  const { organization } = await adminCustomerSelection(query.organizationId);
  const history = organization ? await customerDeliveryHistory(organization.id, id, query.after) : null;
  if (!organization || !history) notFound();
  return <>
    <AdminTabs active="archive" />
    <Link href={`/admin/archive?organizationId=${encodeURIComponent(organization.id)}`}>← {organization.name} archive</Link>
    <div className="eyebrow" style={{ marginTop: 24 }}>{organization.name}</div>
    <h1>Delivery history</h1><h2>{history.item.headline || "Untitled post"}</h2><p>{history.item.campaign.title}</p>
    <section className="card">
      <AdminDeliveryList deliveries={history.deliveries} />
      {!history.deliveries.length && <p>No account-level delivery records on this page. Older posts may only have the campaign's published status.</p>}
    </section>
    {history.nextCursor && <Link className="button" href={`/admin/archive/${encodeURIComponent(id)}?organizationId=${encodeURIComponent(organization.id)}&after=${encodeURIComponent(history.nextCursor)}`}>Older deliveries →</Link>}
  </>;
}
