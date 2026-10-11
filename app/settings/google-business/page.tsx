import { tenantContext } from "@/lib/auth/context";
import { googleBusinessConfigured, googleBusinessRedirectUri, listBusinessLocations, type BusinessLocation } from "@/lib/google-business/client";
import { googleSelection } from "@/lib/google-business/session";
export const dynamic = "force-dynamic";
const messages: Record<string, string> = {
  setup: "The app's Google Business Profile connection needs setup before you can connect.",
  cancelled: "Google connection was cancelled. You can try again.",
  session: "Your connection session expired or changed. Start again below.",
  connection: "Google sign-in could not finish. Check the app setup and allow Business Profile access when reconnecting.",
  selection: "We could not save that business location. Check your Google account's access and start the connection again.",
};
export default async function GoogleBusinessSettings({ searchParams }: { searchParams: Promise<{ selection?: string; reason?: string }> }) {
  const ctx = await tenantContext();
  const query = await searchParams;
  const canEdit = ["owner", "admin", "member", "superadmin"].includes(ctx.role);
  const configured = googleBusinessConfigured();
  let locations: BusinessLocation[] = [], error = messages[query.reason || ""] || "";
  if (query.selection && canEdit) {
    try { const { grant } = await googleSelection(query.selection, ctx); locations = await listBusinessLocations(grant.accessToken); if (!locations.length) error = "No business locations were found. Sign in with the Google account that manages your Business Profile."; }
    catch (cause) { error = cause instanceof Error ? cause.message : "Business locations could not load."; }
  }
  return <><div className="eyebrow">CONNECTIONS</div><h1>Google Business Profile</h1><p>Connect the Google account that manages your business, then choose the location for this workspace. Approved text and photo posts can be published now or scheduled.</p><p><a href="/settings">Back to connections</a></p>
    {error && <p role="alert">{error}</p>}
    {!canEdit ? <p>Ask your workspace owner or administrator to connect the business.</p> : locations.length ? <section className="card"><h2>Choose your business location</h2><form action="/api/social/google-business/select" method="POST"><input type="hidden" name="selectionId" value={query.selection}/><label htmlFor="google-business-location">Business location</label><select id="google-business-location" name="location" required defaultValue=""><option value="" disabled>Choose a location</option>{locations.map(location => <option key={location.name} value={location.name}>{location.title}{location.address ? ` · ${location.address}` : ""}</option>)}</select><button type="submit">Connect this location</button></form></section> : configured ? <section className="card"><h2>Connect your Google account</h2><form action="/api/social/google-business/connect" method="POST"><label><input type="checkbox" name="consent" value="yes" required/> I authorize Rumi Social AI to connect my business location and publish the posts I approve, and agree to the <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms of Service</a>.</label><button type="submit">Continue with Google</button></form></section> : <section className="card"><h2>Google connection setup needed</h2><p>The app administrator needs to connect Google Business Profile before accounts can be added.</p>{["owner", "admin", "superadmin"].includes(ctx.role) && <details><summary>Administrator setup</summary><p>Use a Google Cloud project approved for Business Profile API access. Enable Account Management, Business Information and Google My Business APIs, and allow the business.manage scope on the OAuth consent screen.</p><p>Add GOOGLE_BUSINESS_CLIENT_ID and GOOGLE_BUSINESS_CLIENT_SECRET to the app's production environment, then redeploy. Add this authorized redirect URI to the Google OAuth web client:</p><code>{process.env.NEXT_PUBLIC_APP_URL ? googleBusinessRedirectUri() : "https://rumisocialai.com/api/social/google-business/callback"}</code><p><a href="https://developers.google.com/my-business/content/basic-setup" target="_blank" rel="noreferrer">Google's setup guide</a></p></details>}</section>}
  </>;
}
