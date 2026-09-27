import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import PublishingActions from "./PublishingActions";

export default async function Publishing() {
  const ctx = await tenantContext();

  const facebookConnection =
    await prisma.socialConnection.findFirst({
      where: {
        organizationId: ctx.organizationId,
        provider: "facebook",
        status: "connected",
      },
    });

  const approvedItems =
    await prisma.contentItem.findMany({
      where: {
        status: "approved",
        campaign: {
          brand: {
            organizationId: ctx.organizationId,
          },
        },
      },
      include: {
        campaign: true,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

  const recentJobs = await prisma.publishJob.findMany({
    where: {
      organizationId: ctx.organizationId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  });

  return (
    <>
      <div className="eyebrow">PUBLISHING CENTER</div>
      <h1>Publish and schedule.</h1>

      <p>
        Review approved content before sending it to a
        connected social account.
      </p>

      <section style={{ marginTop: "32px" }}>
        <h2>Facebook Page</h2>

        {facebookConnection ? (
          <p>
            Connected as{" "}
            <strong>
              {facebookConnection.accountName ||
                "Facebook Page"}
            </strong>
          </p>
        ) : (
          <p>
            Facebook is not connected. Connect it in
            Settings before publishing.
          </p>
        )}
      </section>

      <section style={{ marginTop: "36px" }}>
        <h2>Approved content</h2>

        {approvedItems.length === 0 ? (
          <div className="card">
            <p>
              No approved content is currently waiting to
              publish.
            </p>
          </div>
        ) : (
          <div className="settingsgrid">
            {approvedItems.map((item) => (
              <div key={item.id} className="card">
                <div className="eyebrow">
                  {item.campaign.title}
                </div>

                <h3>
                  {item.headline || "Untitled post"}
                </h3>

                {item.caption ? (
                  <p style={{ whiteSpace: "pre-wrap" }}>
                    {item.caption}
                  </p>
                ) : null}

                {item.mediaUrl ? (
                  <div style={{ marginTop: "16px" }}>
                    <img
                      src={item.mediaUrl}
                      alt={item.headline || "Social media creative"}
                      style={{
                        display: "block",
                        width: "100%",
                        maxWidth: "520px",
                        height: "auto",
                        borderRadius: "12px",
                      }}
                    />
                    <p style={{ marginTop: "8px" }}>
                      Image post
                    </p>
                  </div>
                ) : (
                  <p>Text-only post</p>
                )}

                {facebookConnection ? (
                  <PublishingActions
                    contentItemId={item.id}
                    connectionId={facebookConnection.id}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: "36px" }}>
        <h2>Recent publishing activity</h2>

        {recentJobs.length === 0 ? (
          <p>No publishing activity yet.</p>
        ) : (
          <div className="queue">
            {recentJobs.map((job) => (
              <div className="qrow" key={job.id}>
                <span>{job.platform}</span>
                <span>
                  {job.scheduledFor.toLocaleString()}
                </span>
                <span className={`state ${job.status}`}>
                  {job.status}
                </span>
                <span>
                  {job.lastError || job.externalPostId || "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
