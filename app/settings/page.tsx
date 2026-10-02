import YouTubeDisconnect from "./YouTubeDisconnect";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ youtube?: string }> }) {
  const query = await searchParams;
  const ctx = await tenantContext();

  const instagramConnection = await prisma.socialConnection.findFirst({
    where: {
      organizationId: ctx.organizationId,
      provider: "instagram",
      status: "connected",
    },
  });

  const youtubeConnection = await prisma.socialConnection.findFirst({
    where: {
      organizationId: ctx.organizationId,
      provider: "youtube",
      status: "connected",
    },
  });

  const tiktokConnection = await prisma.socialConnection.findFirst({
    where: {
      organizationId: ctx.organizationId,
      provider: "tiktok",
      status: "connected",
    },
  });

  const facebookConnection = await prisma.socialConnection.findFirst({
    where: {
      organizationId: ctx.organizationId,
      provider: "facebook",
      status: "connected",
    },
  });

  return (
    <>
      <div className="eyebrow">CONNECTIONS</div>
      <h1>Connect your business.</h1>
      {query.youtube === "disconnected" ? <p role="status">YouTube disconnected. Its stored channel data and upload history were deleted. Your videos remain on YouTube.</p> : null}
      {query.youtube === "revoke_manually" ? <p role="status">Stored YouTube data was deleted. Please also revoke Rumi Social AI access in <a href="https://security.google.com/settings/security/permissions" target="_blank" rel="noreferrer">Google security settings</a>.</p> : null}

      <div className="settingsgrid">
        {[
          "Instagram Business",
          "Facebook Page",
          "YouTube",
          "TikTok",
          "LinkedIn",
          "WooCommerce",
          "Shopify",
          "Google Business",
        ].map((x: string) => (
          <div key={x} className="card">
            <h3>{x}</h3>

            {x === "Instagram Business" ? (
              <>
                <p>
                  {instagramConnection
                    ? `Connected${
                        instagramConnection.accountName
                          ? ` as @${instagramConnection.accountName}`
                          : ""
                      }`
                    : "Not connected"}
                </p>

                {instagramConnection ? (
                  <button type="button" disabled>
                    Connected
                  </button>
                ) : (
                  <a href="/api/social/instagram/connect">
                    <button type="button">Connect</button>
                  </a>
                )}
              </>
            ) : x === "Facebook Page" ? (
              <>
                <p>
                  {facebookConnection
                    ? `Connected as ${facebookConnection.accountName || "Facebook Page"}`
                    : "Not connected"}
                </p>

                {facebookConnection ? (
                  <button type="button" disabled>
                    Connected
                  </button>
                ) : (
                  <a href="/api/social/facebook/connect">
                    <button type="button">Connect</button>
                  </a>
                )}
              </>
            ) : x === "YouTube" ? (
              <>
                <p>
                  {youtubeConnection
                    ? `Connected as ${youtubeConnection.accountName || "YouTube"}`
                    : "Not connected"}
                </p>
                {youtubeConnection ? (
                  <YouTubeDisconnect connectionId={youtubeConnection.id} />
                ) : (
                  <a href="/api/social/youtube/connect">
                    <button type="button">Connect</button>
                  </a>
                )}
              </>
            ) : x === "TikTok" ? (
              <>
                <p>
                  {tiktokConnection
                    ? `Connected as ${tiktokConnection.accountName || "TikTok"}`
                    : "Not connected"}
                </p>

                {tiktokConnection ? (
                  <form
                    action="/api/social/tiktok/disconnect"
                    method="POST"
                  >
                    <button type="submit">
                      Disconnect
                    </button>
                  </form>
                ) : (
                  <a href="/api/social/tiktok/connect">
                    <button type="button">Connect</button>
                  </a>
                )}
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
