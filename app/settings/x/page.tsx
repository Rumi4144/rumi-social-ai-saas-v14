import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { xCredentials } from "@/lib/x/connection";

export const dynamic = "force-dynamic";
const errors: Record<string, string> = {
  setup: "X setup needs attention from Rumi’s administrator. Please contact support.",
  credentials: "Rumi could not verify its X app settings. Please contact support.",
  session: "This sign-in session expired or changed. Select Connect X to start again.",
  cancelled: "X sign-in was cancelled. Your existing connections are unchanged.",
  credits: "X could not verify this account because its API balance needs attention. Please contact support.",
  permissions: "X did not grant posting access. Reconnect and allow posting. If this continues, please contact support.",
  rate: "X is temporarily limiting requests. Wait a few minutes, then reconnect.",
  connection: "X could not finish connecting. Sign in to Rumi with permission to manage this workspace, then try again.",
};
export default async function XSettings({ searchParams }: { searchParams: Promise<{ reason?: string; status?: string }> }) {
  const ctx = await tenantContext(), query = await searchParams;
  let configured = false;
  try { configured = Boolean(await xCredentials(ctx.organizationId)); } catch { /* Show setup help without exposing credentials. */ }
  const accounts = await prisma.socialConnection.findMany({ where: { organizationId: ctx.organizationId, provider: "x", status: { in: ["linked", "connected"] } }, select: { id: true, accountName: true, status: true } });
  const writer = ["owner", "admin", "member", "superadmin"].includes(ctx.role);
  return <div className="card" style={{ maxWidth: 800 }}>
    <a href="/settings">Back to connections</a>
    <h1>Connect X (Twitter)</h1>
    <p>Connect X to publish approved text, photos and finished reels, now or at a scheduled time.</p>
    {query.reason && <p role="alert">{errors[query.reason] || errors.connection}</p>}
    {query.status === "linked" && accounts.length > 0 && <p role="status">Your X account is linked.</p>}
    {query.status === "connected" && accounts.some(account => account.status === "connected") && <p role="status">X posting is enabled. Return to your post, refresh accounts and select X.</p>}
    {query.status === "disconnected" && <p role="status">X disconnected. Its stored account details and tokens were removed, and queued X posts were cancelled.</p>}
    {query.status === "revoke_manually" && <p role="status">X disconnected from Rumi. Also remove this app in <a href="https://x.com/settings/connected_apps" target="_blank" rel="noreferrer">X connected apps</a>.</p>}
    {accounts.map(account => <div key={account.id}>
      <p><strong>{account.status === "connected" ? "Ready to post" : "Linked"} as @{account.accountName}</strong></p>
      {account.status === "linked" && <p>One more authorization is needed to post. Select Enable X posting below.</p>}
      {writer && <form action="/api/social/x/disconnect" method="POST">
        <input type="hidden" name="connectionId" value={account.id} />
        <button type="submit">Disconnect @{account.accountName}</button>
      </form>}
    </div>)}
    {configured && writer && <form action="/api/social/x/connect" method="POST" style={{ marginTop: 24 }}>
      <p>Sign in to the X account for this business. Rumi will publish only the posts you approve for X.</p>
      <label><input type="checkbox" name="consent" value="yes" required /> I authorize Rumi to connect my X account and publish posts I approve under the <a href="/privacy" target="_blank">Privacy Policy</a> and <a href="/terms" target="_blank">Terms of Service</a>.</label>
      <p><button type="submit">{accounts.some(account => account.status === "linked") ? "Enable X posting" : accounts.length ? "Reconnect X" : "Connect X"}</button></p>
    </form>}
    {!writer && <p>Ask a workspace administrator to connect X.</p>}
    {!configured && <p>X setup needs attention from Rumi’s administrator.</p>}
    {ctx.isSuperAdmin && <p><a href="/admin/social-apps">Manage X app settings in Admin</a></p>}
  </div>;
}
