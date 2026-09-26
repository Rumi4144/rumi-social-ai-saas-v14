import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const instagramConnections = await prisma.socialConnection.findMany({
    where: {
      provider: "instagram",
      status: "connected",
    },
    orderBy: {
      id: "desc",
    },
  });

  const instagramConnected = instagramConnections.length > 0;

  return (
    <>
      <div className="eyebrow">CONNECTIONS</div>
      <h1>Connect your business.</h1>

      <div className="settingsgrid">
        {[
          "Instagram Business",
          "Facebook Page",
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
                  {instagramConnected
                    ? `Connected${
                        instagramConnections[0]?.accountName
                          ? ` as @${instagramConnections[0].accountName}`
                          : ""
                      }`
                    : "Not connected"}
                </p>

                {instagramConnected ? (
                  <button type="button" disabled>
                    Connected
                  </button>
                ) : (
                  <a href="/api/social/instagram/connect">
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
