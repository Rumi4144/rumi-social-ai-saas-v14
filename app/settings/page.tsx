import Link from "next/link";
import TikTokConnectionStatus from "./TikTokConnectionStatus";
import YouTubeDisconnect from "./YouTubeDisconnect";
import FacebookConnection from "./FacebookConnection";
import { canManageFacebook, facebookMessage } from "@/lib/social/facebook-connection";
import InstagramConnection from "./InstagramConnection";
import { canManageInstagram, instagramMessage } from "@/lib/social/instagram-connection";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ youtube?: string; googleBusiness?: string; tiktok?:string; instagram?: string; facebook?: string; reason?: string }> }) {
  const query = await searchParams;
  const ctx = await tenantContext();

  const instagramConnections = await prisma.socialConnection.findMany({
    where: {
      organizationId: ctx.organizationId,
      provider: "instagram",
      status: "connected",
    },
    select: { id: true, accountName: true },
  });

  const youtubeConnections = await prisma.socialConnection.findMany({
    where: {
      organizationId: ctx.organizationId,
      provider: "youtube",
      status: "connected",
    },
  });

  const tiktokConnections = await prisma.socialConnection.findMany({
    where: {
      organizationId: ctx.organizationId,
      provider: "tiktok",
      status: "connected",
    },
  });

  const facebookConnections = await prisma.socialConnection.findMany({
    where: {
      organizationId: ctx.organizationId,
      provider: "facebook",
      status: "connected",
    },
    select: { id: true, accountName: true },
  });

  const googleConnections = await prisma.socialConnection.findMany({ where: { organizationId: ctx.organizationId, provider: "google_business", status: "connected" } });
  const xConnections = await prisma.socialConnection.findMany({ where: { organizationId: ctx.organizationId, provider: "x", status: { in: ["linked", "connected"] } }, select: { accountName: true, status: true } });

  return (
    <>
      <div className="eyebrow">YOUR ACCOUNT</div>
      <h1>Settings</h1>
      <nav aria-label="Account settings" style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
        <Link className="button" href="/billing">Plan &amp; billing</Link>
        <Link className="button" href="/usage">Credits &amp; usage</Link>
        <Link className="button" href="/workspaces">Switch business</Link>
        <Link className="button" href="/team">Team access</Link>
      </nav>
      <h2>Connected accounts</h2>
      {query.facebook === "connected" && <p role="status">Facebook connected. Review any failed posts before trying them again.</p>}
      {query.facebook === "cancelled" && <p role="status">Facebook sign-in was cancelled. The previous connection was kept.</p>}
      {query.facebook === "disconnected" && <p role="status">Facebook disconnected from Rumi. Pending Facebook posts were stopped. Your published posts and account history remain.</p>}
      {query.facebook === "error" && <p role="alert">{facebookMessage(query.reason)}</p>}
      {query.instagram === "connected" && <p role="status">Instagram connected. Review any failed posts before trying them again.</p>}
      {query.instagram === "cancelled" && <p role="status">Instagram sign-in was cancelled. The previous connection was kept.</p>}
      {query.instagram === "disconnected" && <p role="status">Instagram disconnected from Rumi and its saved access token removed. Pending posts were stopped. Your published posts and account history remain.</p>}
      {query.instagram === "error" && <p role="alert">{instagramMessage(query.reason)}</p>}
      {query.youtube === "disconnected" ? <p role="status">YouTube disconnected. Its stored channel data and upload history were deleted. Your videos remain on YouTube.</p> : null}
      {query.youtube === "revoke_manually" ? <p role="status">Stored YouTube data was deleted. Please also revoke Rumi Social AI access in <a href="https://security.google.com/settings/security/permissions" target="_blank" rel="noreferrer">Google security settings</a>.</p> : null}

      {query.googleBusiness === "connected" && <p role="status">Google Business Profile connected. Text and photo posts can now be scheduled for your selected location.</p>}
      {query.googleBusiness === "disconnected" && <p role="status">Google Business Profile disconnected and stored connection credentials removed. You can also remove app access in <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">Google account settings</a>.</p>}
      {query.tiktok === "error" && <p role="alert">TikTok could not finish connecting. Confirm Content Posting API and video.publish are enabled in the TikTok developer app, then reconnect.</p>}
      <div className="settingsgrid">
        {[
          "Instagram Business",
          "Facebook Page",
          "YouTube",
          "TikTok",
          "X (Twitter)",
          "LinkedIn",
          "WooCommerce",
          "Shopify",
          "Google Business Profile",
        ].map((x: string) => (
          <div key={x} className="card">
            <h3>{x}</h3>

            {x === "Instagram Business" ? (
              <>
                {instagramConnections.map(connection => <InstagramConnection key={connection.id} connectionId={connection.id} accountName={connection.accountName} canManage={canManageInstagram(ctx.role)}/>)}
                {instagramConnections.length > 0 && canManageInstagram(ctx.role) && <p><a className="button" href="/api/social/instagram/connect">Add Instagram account</a></p>}
                {!instagramConnections.length && <><p>Not connected</p>{canManageInstagram(ctx.role) ? <a className="button" href="/api/social/instagram/connect">Connect Instagram</a> : <p>Ask a workspace owner or team member to connect Instagram.</p>}</>}
              </>
            ) : x === "Facebook Page" ? (
              <>
                {facebookConnections.map(connection => <FacebookConnection key={connection.id} connectionId={connection.id} accountName={connection.accountName} canManage={canManageFacebook(ctx.role)}/>)}
                {facebookConnections.length > 0 && canManageFacebook(ctx.role) && <p><a className="button" href="/api/social/facebook/connect">Add Facebook Page</a></p>}
                {!facebookConnections.length && <><p>Not connected</p>{canManageFacebook(ctx.role) ? <a className="button" href="/api/social/facebook/connect">Connect Facebook</a> : <p>Ask a workspace owner or team member to connect Facebook.</p>}</>}
              </>
            ) : x === "YouTube" ? (
              <>
                {!youtubeConnections.length && <p>Not connected</p>}
                {youtubeConnections.map(connection => <div key={connection.id} style={{ marginBottom: 24 }}><p>Channel: {connection.accountName || "YouTube"}</p><YouTubeDisconnect connectionId={connection.id} /></div>)}
                {ctx.role !== "viewer" && <a className="button" href="/settings/youtube">{youtubeConnections.length ? "Add YouTube channel" : "Connect YouTube"}</a>}
              </>
            ) : x === "Google Business Profile" ? (
              <>
                {!googleConnections.length && <p>Not connected</p>}
                {googleConnections.map(connection => <div key={connection.id} style={{ marginBottom: 24 }}><p>Location: {connection.accountName || "Business location"}</p>{ctx.role !== "viewer" && <form action="/api/social/google-business/disconnect" method="POST"><input type="hidden" name="connectionId" value={connection.id}/><button type="submit">Disconnect this location</button></form>}</div>)}
                {ctx.role !== "viewer" && <a className="button" href="/settings/google-business">{googleConnections.length ? "Add business location" : "Connect"}</a>}
              </>
            ) : x === "X (Twitter)" ? (
              <>
                <p>{xConnections.length ? `Linked: ${xConnections.map(account => `@${account.accountName}`).join(", ")}` : "Not connected"}</p>
                <p>{xConnections.some(account => account.status === "connected") ? "Publish approved text, photos and reels to X." : "Enable posting to send approved text, photos and reels to X."}</p>
                <a className="button" href="/settings/x">{xConnections.some(account => account.status === "linked") ? "Enable X posting" : xConnections.length ? "Manage X connection" : "Connect X"}</a>
              </>
            ) : x === "TikTok" ? (
              <>
                {!tiktokConnections.length && <p>Not connected</p>}
                {tiktokConnections.map(connection => <div key={connection.id} style={{ marginBottom: 24 }}><p>Account: {connection.accountName || "TikTok"}</p><TikTokConnectionStatus connectionId={connection.id}/>{ctx.role !== "viewer" && <form action="/api/social/tiktok/disconnect" method="POST"><input type="hidden" name="connectionId" value={connection.id}/><button type="submit">Disconnect this account</button></form>}</div>)}
                {ctx.role !== "viewer" && <a className="button" href="/api/social/tiktok/connect">{tiktokConnections.length ? "Add TikTok account" : "Connect TikTok"}</a>}
              </>
            ) : (
              <>
                <p>Not connected</p>
                <button type="button">Connect</button>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
