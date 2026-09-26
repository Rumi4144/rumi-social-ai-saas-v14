import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await tenantContext();

  const instagramConnection = await prisma.socialConnection.findFirst({
    where: {
      organizationId: ctx.organizationId,
      provider: "instagram",
      status: "connected",
    },
  });

  return (
    <>
      <div className="eyebrow">CONNECTIONS</div>
      <p style={{ fontSize: 12 }}>
        DEBUG WORKSPACE: {ctx.organizationId}
      </p>
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
