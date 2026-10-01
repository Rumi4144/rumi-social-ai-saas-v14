import { prisma } from "@/lib/prisma";
import { publishToProvider } from "@/lib/publishing/providers";

export async function processDuePublishJob() {
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

  await prisma.publishJob.update({
    where: { id: job.id },
    data: {
      status: "publishing",
      attempts: { increment: 1 },
    },
  });

  const connection = await prisma.socialConnection.findUnique({
    where: { id: job.socialConnectionId },
  });

  const item = await prisma.contentItem.findUnique({
    where: { id: job.contentItemId },
  });

  if (!connection || !item) {
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

  const result = await publishToProvider({
    platform: job.platform,
    token: connection.encryptedToken || "",
    externalAccountId: connection.externalId || "",
    caption: item.caption || "",
    mediaUrl: item.mediaUrl,
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

    return {
      status: "published" as const,
      jobId: job.id,
      attempt,
    };
  }

  const status = attempt >= 4 ? "failed" : "retry";

  await prisma.publishJob.update({
    where: { id: job.id },
    data: {
      status,
      lastError: result.error || "Publishing failed",
    },
  });

  return {
    status,
    jobId: job.id,
    attempt,
    error: result.error || "Publishing failed",
  };
}
