import { redirect } from "next/navigation";
import AdminTabs from "@/components/AdminTabs";
import { superAdminContext } from "@/lib/admin/context";
import { prisma } from "@/lib/prisma";
import { xCallbackUrl, xId, xOrigin, xPlatformCredentials } from "@/lib/x/connection";

export const dynamic = "force-dynamic";
const errors: Record<string, string> = {
  credentials: "Enter the OAuth 2.0 Client ID and Client Secret from your X Web App. API keys and bearer tokens cannot be used here.",
  source: "That business no longer has saved X app settings. Choose another source or enter the settings below.",
  in_use: "The shared X app is already used by connected accounts. Keep its Client ID to preserve those connections. You can update the secret for the same app.",
  save: "The X app settings could not be saved. Please try again.",
};

export default async function SocialApps({ searchParams }: { searchParams: Promise<{ reason?: string; status?: string }> }) {
  try { await superAdminContext(); }
  catch (error: any) { redirect(error?.message === "UNAUTHENTICATED" ? "/login" : "/dashboard"); }
  const query = await searchParams;
  let configured = false, invalid = false;
  try { configured = Boolean(await xPlatformCredentials()); } catch { invalid = true; }
  const saved = await prisma.socialConnection.findMany({ where: { provider: "x_app", status: "configured" }, select: { id: true, organizationId: true } });
  const sourceIds = saved.filter(row => row.id === xId("app", row.organizationId)).map(row => row.organizationId);
  const businesses = await prisma.organization.findMany({ where: { id: { in: sourceIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return <>
    <AdminTabs active="social-apps" />
    <div className="eyebrow">MASTER ADMIN</div>
    <h1>Social Apps</h1>
    <p>Manage the app settings businesses use to connect their social accounts.</p>
    <section className="card form" style={{ maxWidth: 800 }}>
      <h2>X (Twitter)</h2>
      <p><strong>{configured ? "Shared app settings saved" : "Shared app setup needed"}</strong></p>
      <p>Businesses sign in to their own X account. Existing business connections keep their original app settings.</p>
      {invalid && <p role="alert">The saved shared settings could not be read. Enter valid settings below.</p>}
      {query.reason && <p role="alert">{errors[query.reason] || errors.save}</p>}
      {query.status === "saved" && <p role="status">Shared X settings saved. Businesses without their own saved setup can now select Connect X in Settings. Account authorization still requires their sign-in.</p>}
      {businesses.length > 0 && <form action="/api/admin/social/x/configure" method="POST" style={{ marginTop: 24 }}>
        <h3>Use an existing setup</h3>
        <p>Reuse a business’s saved developer app settings. Its connected account and scheduled posts stay in place.</p>
        <label>Business<select name="sourceOrganizationId" required defaultValue="">
          <option value="" disabled>Choose a business</option>
          {businesses.map(business => <option key={business.id} value={business.id}>{business.name}</option>)}
        </select></label>
        <p><button type="submit">Use this app for Rumi</button></p>
      </form>}
      <details open={!configured && businesses.length === 0} style={{ marginTop: 24 }}>
        <summary>{configured ? "Update developer settings" : "Enter developer settings"}</summary>
        <p>In the X app’s authentication settings, select <strong>Read and write</strong> and <strong>Web App</strong>.</p>
        <label>Callback URL<input readOnly value={xCallbackUrl()} /></label>
        <label>Website URL<input readOnly value={xOrigin()} /></label>
        <p>Privacy policy: {xOrigin()}/privacy<br />Terms: {xOrigin()}/terms</p>
        <form action="/api/admin/social/x/configure" method="POST">
          <label>OAuth 2.0 Client ID<input name="clientId" required minLength={8} maxLength={2048} autoComplete="off" spellCheck={false} /></label>
          <label>Client Secret<input name="clientSecret" type="password" required minLength={8} maxLength={2048} autoComplete="new-password" /></label>
          <p>The settings are encrypted. Saved values are never displayed here.</p>
          <button type="submit">Save shared X settings</button>
        </form>
      </details>
      <p style={{ marginTop: 24 }}>X API charges use the developer app’s balance. Manage its billing and permissions in the <a href="https://console.x.com/" target="_blank" rel="noreferrer">X Developer Console</a>.</p>
    </section>
  </>;
}
