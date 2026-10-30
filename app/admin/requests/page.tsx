import Link from "next/link";
import { redirect } from "next/navigation";
import AdminTabs from "@/components/AdminTabs";
import AdminCustomerFilter from "@/components/AdminCustomerFilter";
import { superAdminContext } from "@/lib/admin/context";
import { adminCustomerSelection, customerChangeRequests } from "@/lib/admin/customer-history";

export const dynamic = "force-dynamic";

export default async function ChangeRequests({ searchParams }: { searchParams: Promise<{ organizationId?: string; after?: string; q?: string; completed?: string; saved?: string }> }) {
  try { await superAdminContext(); }
  catch (error) { redirect(error instanceof Error && error.message === "UNAUTHENTICATED" ? "/login" : "/dashboard"); }
  const query = await searchParams, completed = query.completed === "1";
  const selection = await adminCustomerSelection(query.organizationId, query.q);
  const history = selection.organization ? await customerChangeRequests(selection.organization.id, query.after, completed) : null;
  return <>
    <AdminTabs active="requests" />
    <div className="eyebrow">MASTER ADMIN</div><h1>Customer requests</h1>
    <p>Review feedback, update the creative in the customer's campaign, then mark the request handled. The customer still approves the revised post.</p>
    {query.saved === "1" && <p role="status">Request marked handled. The post still requires customer approval.</p>}
    <AdminCustomerFilter action="/admin/requests" {...selection} search={query.q} completed={completed} />
    {selection.organization && <>
      <h2>{selection.organization.name}</h2>
      <nav aria-label="Request status" style={{ display: "flex", gap: 20, marginBottom: 24 }}>
        <Link href={`/admin/requests?organizationId=${encodeURIComponent(selection.organization.id)}`} aria-current={!completed ? "page" : undefined}>Pending</Link>
        <Link href={`/admin/requests?organizationId=${encodeURIComponent(selection.organization.id)}&completed=1`} aria-current={completed ? "page" : undefined}>Handled</Link>
      </nav>
    </>}
    {!selection.organization && <p>No matching customer found.</p>}
    {history && !history.requests.length && <p>No {completed ? "handled" : "pending"} requests on this page.</p>}
    {history?.requests.map(request => <article key={request.id} className="card" style={{ marginBottom: 20 }}>
      <h3>{request.item?.headline || "Post change request"}</h3>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{request.comment}</p>
      <p>{request.createdAt.toLocaleString("en-US", { timeZone: "UTC" })} UTC · {request.item?.campaign.title || "Original post is unavailable"}</p>
      {request.item && <Link href={`/admin/enter/${encodeURIComponent(selection.organization!.id)}?campaignId=${encodeURIComponent(request.item.campaign.id)}`} prefetch={false}>Open campaign to make changes →</Link>}
      {!completed && request.item && <form action={`/api/admin/requests/${encodeURIComponent(request.id)}/complete`} method="post" style={{ marginTop: 20 }}>
        <input type="hidden" name="organizationId" value={selection.organization!.id} />
        <label><input type="checkbox" name="changesReviewed" value="yes" required /> I have addressed this request in the campaign.</label>
        <button type="submit" style={{ marginTop: 12 }}>Mark handled</button>
      </form>}
    </article>)}
    {history?.nextCursor && <Link className="button" href={`/admin/requests?organizationId=${encodeURIComponent(selection.organization!.id)}&after=${encodeURIComponent(history.nextCursor)}${completed ? "&completed=1" : ""}`}>Older requests →</Link>}
  </>;
}
