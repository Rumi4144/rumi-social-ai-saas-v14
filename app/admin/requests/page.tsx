import { requestAlertSettings } from "@/lib/admin/request-notifications";
import Link from "next/link";
import { redirect } from "next/navigation";
import AdminTabs from "@/components/AdminTabs";
import AdminCustomerFilter from "@/components/AdminCustomerFilter";
import { superAdminContext } from "@/lib/admin/context";
import { adminCustomerSelection, customerChangeRequests, allCustomerChangeRequests } from "@/lib/admin/customer-history";

export const dynamic = "force-dynamic";

export default async function ChangeRequests({ searchParams }: { searchParams: Promise<{ organizationId?: string; after?: string; q?: string; completed?: string; saved?: string; alerts?: string }> }) {
  try { await superAdminContext(); }
  catch (error) { redirect(error instanceof Error && error.message === "UNAUTHENTICATED" ? "/login" : "/dashboard"); }
  const alertSettings = await requestAlertSettings();
  const query = await searchParams, completed = query.completed === "1";
  const selected = await adminCustomerSelection(query.organizationId, query.q);
  const selection = { ...selected, organization: query.organizationId || query.q ? selected.organization : null };
  const history = selection.organization ? await customerChangeRequests(selection.organization.id, query.after, completed) : await allCustomerChangeRequests(query.after, completed);
  return <>
    <AdminTabs active="requests" />
    <div className="eyebrow">MASTER ADMIN</div><h1>Customer requests</h1>
    <p>Review feedback, update the creative in the customer's campaign, then mark the request handled. The customer still approves the revised post.</p>
    {query.saved === "1" && <p role="status">Request marked handled. The post still requires customer approval.</p>}
    <details className="card" style={{ marginBottom: 20 }}><summary>Email alerts · {alertSettings.enabled && alertSettings.configured ? alertSettings.email : "setup needed"}</summary>
      {query.alerts === "saved" && <p role="status">Email alert preferences saved.</p>}
      <p>Receive an email when a customer submits or updates a change request.</p>
      {!alertSettings.configured && <p role="status">Email delivery needs a configured sender and email service. Requests remain visible in this inbox.</p>}
      <form method="post" action="/api/admin/requests/notifications">
        <label>Notification email<input type="email" name="email" defaultValue={alertSettings.email} required maxLength={254} /></label>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="enabled" value="yes" defaultChecked={alertSettings.enabled} /> Email me customer change requests</label>
        <button type="submit">Save email alerts</button>
      </form>
    </details>
    <AdminCustomerFilter action="/admin/requests" {...selection} search={query.q} completed={completed} allowAll />
    {<>
      <h2>{selection.organization?.name || "All customers"}</h2>
      <nav aria-label="Request status" style={{ display: "flex", gap: 20, marginBottom: 24 }}>
        <Link href={`/admin/requests?organizationId=${encodeURIComponent(selection.organization?.id || "")}`} aria-current={!completed ? "page" : undefined}>Pending</Link>
        <Link href={`/admin/requests?organizationId=${encodeURIComponent(selection.organization?.id || "")}&completed=1`} aria-current={completed ? "page" : undefined}>Handled</Link>
      </nav>
    </>}

    {history && !history.requests.length && <p>No {completed ? "handled" : "pending"} requests on this page.</p>}
    {history?.requests.map(request => <article key={request.id} className="card" style={{ marginBottom: 20 }}>
      {"customerName" in request && <strong>{String(request.customerName)}</strong>}
      <h3>{request.item?.headline || "Post change request"}</h3>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{request.comment}</p>
      <p>{request.createdAt.toLocaleString("en-US", { timeZone: "UTC" })} UTC · {request.item?.campaign.title || "Original post is unavailable"}</p>
      {request.item && <Link href={`/admin/enter/${encodeURIComponent(request.organizationId)}?campaignId=${encodeURIComponent(request.item.campaign.id)}`} prefetch={false}>Open campaign to make changes →</Link>}
      {!completed && request.item && <form action={`/api/admin/requests/${encodeURIComponent(request.id)}/complete`} method="post" style={{ marginTop: 20 }}>
        <input type="hidden" name="organizationId" value={request.organizationId} />
        <label><input type="checkbox" name="changesReviewed" value="yes" required /> I have addressed this request in the campaign.</label>
        <button type="submit" style={{ marginTop: 12 }}>Mark handled</button>
      </form>}
    </article>)}
    {history?.nextCursor && <Link className="button" href={`/admin/requests?organizationId=${encodeURIComponent(selection.organization?.id || "")}&after=${encodeURIComponent(history.nextCursor)}${completed ? "&completed=1" : ""}`}>Older requests →</Link>}
  </>;
}
