import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { xCredentials } from "@/lib/x/connection";
import { CheckCircle2 } from "lucide-react";

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
  const hasConnectedAccount = accounts.some(account => account.status === "connected");
  const hasLinkedAccount = accounts.some(account => account.status === "linked");
  const readyToPost = configured && hasConnectedAccount && !query.reason;
  const needsAuthorization = !hasConnectedAccount || hasLinkedAccount || Boolean(query.reason);
  return <div className="card" style={{ maxWidth: 800 }}>
    <a href="/settings">Back to connections</a>
    <h1>{readyToPost ? "X connected" : "Connect X (Twitter)"}</h1>
    {!readyToPost && <p>Connect X to publish approved text, photos and finished reels, now or at a scheduled time.</p>}
    {query.reason && <p role="alert">{errors[query.reason] || errors.connection}</p>}
    {query.status === "disconnected" && <p role="status">X disconnected. Its stored account details and tokens were removed, and queued X posts were cancelled.</p>}
    {query.status === "revoke_manually" && <p role="status">X disconnected from Rumi. Also remove this app in <a href="https://x.com/settings/connected_apps" target="_blank" rel="noreferrer">X connected apps</a>.</p>}
    {accounts.map(account => <div key={account.id} style={{ marginTop: 20 }}>
      {account.status === "connected" && readyToPost ? <div role="status" style={{ display: "flex", alignItems: "center", gap: 14, padding: 20, borderRadius: 12, background: "var(--rumi-soft)", color: "var(--rumi-ink)" }}>
        <CheckCircle2 size={30} aria-hidden="true" style={{ color: "var(--rumi-teal)", flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <strong style={{ display: "block", fontSize: 24, overflowWrap: "anywhere" }}>@{account.accountName}</strong>
          <span>Connected to Rumi Social AI. Ready to publish your approved posts.</span>
        </div>
      </div> : <p><strong>{account.status === "connected" ? "Saved account" : "Linked"} as @{account.accountName}</strong></p>}
      {account.status === "linked" && <p>One more authorization is needed to post. Select Enable X posting below.</p>}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 20 }}>
        {account.status === "connected" && readyToPost && <a className="button" href="/dashboard">Back to This Week</a>}
        {writer && <form action="/api/social/x/disconnect" method="POST" style={{ margin: 0 }}>
          <input type="hidden" name="connectionId" value={account.id} />
          <button type="submit" aria-label={`Disconnect @${account.accountName}`}>Disconnect</button>
        </form>}
      </div>
    </div>)}
    {configured && writer && needsAuthorization && <form action="/api/social/x/connect" method="POST" style={{ marginTop: 24 }}>
      <p>Sign in to the X account for this business. Rumi will publish only the posts you approve for X.</p>
      <label><input type="checkbox" name="consent" value="yes" required /> I authorize Rumi to connect my X account and publish posts I approve under the <a href="/privacy" target="_blank">Privacy Policy</a> and <a href="/terms" target="_blank">Terms of Service</a>.</label>
      <p><button type="submit">{hasLinkedAccount ? "Enable X posting" : accounts.length ? "Reconnect X" : "Connect X"}</button></p>
    </form>}
    {!writer && needsAuthorization && <p>Ask a workspace administrator to connect X.</p>}
    {!configured && <p>X setup needs attention from Rumi’s administrator.</p>}
    {ctx.isSuperAdmin && <p><a href="/admin/social-apps">Manage X app settings in Admin</a></p>}
  </div>;
}
