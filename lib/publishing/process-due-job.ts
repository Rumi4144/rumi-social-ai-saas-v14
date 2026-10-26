import { prisma } from "@/lib/prisma";
import { publishToProvider } from "@/lib/publishing/providers";
import { requiresVideo } from "@/lib/campaign/content-plan";

export async function processDuePublishJob() {
  // A terminated X worker resumes its durable upload/receipt, never a second public write.
  await prisma.publishJob.updateMany({ where: { platform: "x", status: "publishing", updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } }, data: { status: "retry", scheduledFor: new Date(), attempts: 0 } });
  const job = await prisma.publishJob.findFirst({
    where: {
      status: { in: ["scheduled", "retry"] },
      scheduledFor: { lte: new Date() },
      attempts: { lt: 4 },
    },
    orderBy: { scheduledFor: "asc" },
  });

  if (!job) {
    return { status: "idle" as const };
  }

  const claim = await prisma.publishJob.updateMany({
    where: { id: job.id, status: job.status },
    data: {
      status: "publishing",
      attempts: { increment: 1 },
    },
  });

  if (claim.count !== 1) return { status: "idle" as const };

  const connection = await prisma.socialConnection.findUnique({
    where: { id: job.socialConnectionId },
  });

  const item = await prisma.contentItem.findUnique({
    where: { id: job.contentItemId },
  });

  if (!connection || !item || connection.organizationId !== job.organizationId || (item.mediaUrl?.includes("/api/video/media/") && !["approved", "scheduled", "published"].includes(item.status))) {
    await prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        lastError: "Missing connection/content",
      },
    });

    return {
      status: "failed" as const,
      jobId: job.id,
      error: "Missing connection/content",
    };
  }

  const attempt = job.attempts + 1;

  if (item.type === "story_post" || requiresVideo(item.type) && !/^\/api\/video\/media\/[^/?#]+(?:\?.*)?$/.test(item.mediaUrl || "")) {
    const error = item.type === "story_post" ? "Story drafts require manual Story publishing." : "Finish and select the planned video before publishing.";
    await prisma.publishJob.update({where:{id:job.id},data:{status:"failed",lastError:error}});
    return {status:"failed" as const,jobId:job.id,error};
  }

  let publishMediaUrl = item.mediaUrl;

  // Facebook's photo endpoint cannot consume our SVG social creative.
  // Use the rasterized PNG publishing endpoint instead.
  if (
    job.platform.toLowerCase() === "facebook" &&
    publishMediaUrl
  ) {
    publishMediaUrl = publishMediaUrl.replace(
      /\/api\/media\/([^/?#]+)(?:\/publish)?(\?.*)?$/,
      (_match, assetId, query = "") =>
        `/api/media/${assetId}/publish${query}`
    );
  }

  const result = await publishToProvider({
    platform: job.platform,
    token: connection.encryptedToken || "",
    externalAccountId: connection.externalId || "",
    caption: item.caption || "",
    mediaUrl: publishMediaUrl,
    organizationId: job.organizationId,
    contentItemId: item.id,
    publishJobId: job.id,
  });

  await prisma.publishAttempt.create({
    data: {
      publishJobId: job.id,
      attempt,
      status: result.ok ? "succeeded" : "failed",
      responseCode: result.code,
      externalId: result.externalId,
      error: result.error,
    },
  });

  if (result.pending) {
    // Status checks do not consume upload attempts or submit another video.
    await prisma.publishJob.update({where:{id:job.id},data:{status:"retry",attempts:job.attempts,scheduledFor:new Date(Date.now()+5*60*1000),externalPostId:result.externalId,lastError:result.error}});
    return {status:"processing" as const,jobId:job.id,attempt,error:result.error};
  }

  if (result.ok) {
    await prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: "published",
        externalPostId: result.externalId,
        publishedAt: new Date(),
        lastError: null,
      },
    });

    if (job.platform === "x" || item.mediaUrl?.includes("/api/video/media/")) await prisma.contentItem.update({ where: { id: item.id }, data: { status: "published" } });

    return {
      status: "published" as const,
      jobId: job.id,
      attempt,
    };
  }

  const status = result.retryable === false || attempt >= 4 ? "failed" : "retry";

  // Do not burn through all retries in one cron invocation. When a publish
  // attempt can be retried, move its due time forward so the current cron
  // drain loop cannot immediately pick the same job again.
  const retryAt = status === "retry"
    ? new Date(Date.now() + 5 * 60 * 1000)
    : undefined;

  await prisma.publishJob.update({
    where: { id: job.id },
    data: {
      status,
      lastError: result.error || "Publishing failed",
      ...(retryAt ? { scheduledFor: retryAt } : {}),
    },
  });

  return {
    status,
    jobId: job.id,
    attempt,
    error: result.error || "Publishing failed",
  };
}
