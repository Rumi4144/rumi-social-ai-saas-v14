import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import PublishingActions from "./PublishingActions";
import YouTubeUpload from "./YouTubeUpload";

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

  const instagramConnection = await prisma.socialConnection.findFirst({
    where: { organizationId: ctx.organizationId, provider: "instagram", status: "connected" },
  });

  const youtubeConnection = await prisma.socialConnection.findFirst({
    where: { organizationId: ctx.organizationId, provider: "youtube", status: "connected" },
  });
  const youtubeUploads = await prisma.job.findMany({
    where: { organizationId: ctx.organizationId, type: "YOUTUBE_UPLOAD" },
    orderBy: { createdAt: "desc" }, take: 10,
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

      <section style={{ marginTop: "24px" }}>
        <h2>Instagram</h2>
        <p>{instagramConnection ? `Connected as @${instagramConnection.accountName || "Instagram"}` : "Instagram is not connected. Connect it in Settings before publishing."}</p>
        <p>Instagram feed posts require an image.</p>
      </section>

      <section style={{ marginTop: "24px" }}>
        <h2>YouTube</h2>
        {youtubeConnection ? <YouTubeUpload connectionId={youtubeConnection.id} accountName={youtubeConnection.accountName || "YouTube"} /> : <p>Connect YouTube in Settings before uploading a video.</p>}
        {youtubeUploads.length ? <div className="queue" style={{ marginTop: 16 }}>
          {youtubeUploads.map(upload => {
            const payload = upload.payload as { title?: string };
            const result = upload.result as { videoId?: string; privacy?: string } | null;
            return <div className="qrow" key={upload.id}>
              <span>{payload.title || "YouTube video"}</span>
              <span>{upload.status === "succeeded" ? `Uploaded (${result?.privacy || "private"})` : upload.status}</span>
              <span>{upload.error || (result?.videoId ? <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(result.videoId)}`} target="_blank" rel="noreferrer">View video</a> : `${upload.progress}%`)}</span>
            </div>;
          })}
        </div> : null}
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
                {instagramConnection && item.mediaUrl ? (
                  <PublishingActions
                    contentItemId={item.id}
                    connectionId={instagramConnection.id}
                    destination={`Instagram @${instagramConnection.accountName || "Instagram"}`}
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
