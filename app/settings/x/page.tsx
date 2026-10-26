import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { canConfigureX, xCallbackUrl, xCredentials, xOrigin } from "@/lib/x/connection";

export const dynamic = "force-dynamic";
const errors: Record<string, string> = {
  setup: "Save your X app credentials below, then connect again.",
  credentials: "Check the OAuth 2.0 Client ID and Client Secret from your X Web App. API keys and bearer tokens cannot be used here.",
  session: "This sign-in session expired or changed. Select Connect X to start again.",
  cancelled: "X sign-in was cancelled. Your existing connections are unchanged.",
  credits: "X requires API credits to verify this account. Check the balance in your X Developer Console, then reconnect.",
  permissions: "X did not allow account verification. Check your app permissions and API access in the X Developer Console.",
  rate: "X is temporarily limiting requests. Wait a few minutes, then reconnect.",
  connection: "X could not finish connecting. Sign in to Rumi with permission to manage this workspace, then try again.",
  save: "The X app settings could not be saved. Please try again.",
  disconnect_first: "Disconnect your linked X accounts before replacing the app credentials.",
};
export default async function XSettings({ searchParams }: { searchParams: Promise<{ reason?: string; status?: string }> }) {
  const ctx = await tenantContext(), query = await searchParams;
  const configured = Boolean(await xCredentials(ctx.organizationId));
  const accounts = await prisma.socialConnection.findMany({ where: { organizationId: ctx.organizationId, provider: "x", status: "linked" }, select: { id: true, accountName: true } });
  const writer = ["owner", "admin", "member", "superadmin"].includes(ctx.role);
  return <div className="card" style={{ maxWidth: 800 }}>
    <a href="/settings">Back to connections</a>
    <h1>Connect X (Twitter)</h1>
    <p>Link your X account to this workspace. Publishing to X from Rumi is not available yet.</p>
    {query.reason && <p role="alert">{errors[query.reason] || errors.connection}</p>}
    {query.status === "saved" && <p role="status">App settings saved. Select Connect X below.</p>}
    {query.status === "linked" && accounts.length > 0 && <p role="status">Your X account is linked.</p>}
    {query.status === "disconnected" && <p role="status">X disconnected. Its stored account details and tokens were removed.</p>}
    {query.status === "revoke_manually" && <p role="status">X disconnected from Rumi. Also remove this app in <a href="https://x.com/settings/connected_apps" target="_blank" rel="noreferrer">X connected apps</a>.</p>}
    {accounts.map(account => <div key={account.id}>
      <p><strong>Linked as @{account.accountName}</strong></p>
      {writer && <form action="/api/social/x/disconnect" method="POST">
        <input type="hidden" name="connectionId" value={account.id} />
        <button type="submit">Disconnect @{account.accountName}</button>
      </form>}
    </div>)}
    {configured && writer && <form action="/api/social/x/connect" method="POST" style={{ marginTop: 24 }}>
      <p>Rumi will read your account identity and save an encrypted authorization token. X may charge your developer balance for verifying the account.</p>
      <label><input type="checkbox" name="consent" value="yes" required /> I authorize Rumi to link my X account under the <a href="/privacy" target="_blank">Privacy Policy</a> and <a href="/terms" target="_blank">Terms of Service</a>.</label>
      <p><button type="submit">{accounts.length ? "Connect another X account" : "Connect X"}</button></p>
    </form>}
    {!writer && <p>Ask a workspace administrator to connect X.</p>}
    {canConfigureX(ctx) ? <details open={!configured} style={{ marginTop: 24 }}>
      <summary>X app setup{configured ? " · Saved" : ""}</summary>
      <p>In your X app’s authentication settings, enable OAuth 2.0 and select <strong>Web App</strong>. Enter these addresses:</p>
      <label>Callback URL<input readOnly value={xCallbackUrl()} /></label>
      <label>Website URL<input readOnly value={xOrigin()} /></label>
      <p>Privacy policy: {xOrigin()}/privacy<br />Terms: {xOrigin()}/terms</p>
      <p>Save in X, then copy its OAuth 2.0 Client ID and Client Secret into the fields below. The secret is encrypted and is never displayed after saving.</p>
      {accounts.length ? <p>Disconnect the linked X accounts before replacing credentials.</p> : <form action="/api/social/x/configure" method="POST">
        <label>Client ID<input name="clientId" required minLength={8} maxLength={2048} autoComplete="off" spellCheck={false} /></label>
        <label>Client Secret<input name="clientSecret" type="password" required minLength={8} maxLength={2048} autoComplete="new-password" /></label>
        <p><button type="submit">Save X app settings</button></p>
      </form>}
    </details> : !configured && <p>A workspace administrator needs to finish the X app setup.</p>}
  </div>;
}
