import { NextResponse } from "next/server";
import { POST as runJob } from "@/app/api/jobs/run/route";
import { prisma } from "@/lib/prisma";
import { weeklyImageAttemptLimit, weeklyJobTypes } from "@/lib/weekly/preparation";
import { providerImageJobId, weeklyRetryReason } from "@/lib/weekly/recovery";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET(request: Request) {
  const { CRON_SECRET, WORKER_SECRET } = process.env;
  if (!CRON_SECRET || request.headers.get("authorization") !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!WORKER_SECRET) return NextResponse.json({ error: "Worker unavailable" }, { status: 503 });

  const weeklyJobs = {
    type: { in: weeklyJobTypes },
    payload: { path: ["weeklyPackId"], string_starts_with: "" },
  };
  // The worker has a three-minute execution limit. Give interrupted jobs ten
  // minutes before examining saved work. Never resubmit an uncertain paid request.
  const expired = await prisma.job.updateMany({
    where: { ...weeklyJobs, status: "running", updatedAt: { lt: new Date(Date.now() - 600_000) } },
    data: { status: "failed", progress: 100, error: "Preparation was interrupted. Review the saved provider request before retrying." },
  });
  // A terminated worker can leave a purchased image or completed copy response
  // saved but its parent step unfinished. Resume that durable result without
  // requiring the customer to keep a browser open or an admin to click retry.
  // Reuse the same policy as admin recovery, including the three-attempt limit.
  const interrupted = await prisma.job.findMany({
    where: { ...weeklyJobs, status: "failed", attempts: { lt: weeklyImageAttemptLimit } },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: 20,
  });
  const providers = interrupted.length ? await prisma.job.findMany({
    where: {
      type: "IMAGE_PROVIDER_TASK",
      id: { in: interrupted.filter(job => job.type === "GENERATE_IMAGE").map(job => providerImageJobId(job.organizationId, job.id)) },
    },
  }) : [];
  let resumed = 0;
  for (const job of interrupted) {
    const provider = providers.find(row => row.id === providerImageJobId(job.organizationId, job.id));
    if (weeklyRetryReason(job, provider)) {
      // Rotate deferred rows through the bounded recovery scan. Otherwise twenty
      // ambiguous provider submissions could hide every recoverable later step.
      await prisma.job.updateMany({
        where: { id: job.id, organizationId: job.organizationId, status: "failed", updatedAt: job.updatedAt },
        data: { updatedAt: new Date() },
      });
      continue;
    }
    const claim = await prisma.job.updateMany({
      where: { id: job.id, organizationId: job.organizationId, status: "failed", attempts: job.attempts, updatedAt: job.updatedAt },
      data: { status: "queued", error: null, progress: 0 },
    });
    resumed += claim.count;
  }
  const jobs = await prisma.job.findMany({
    where: {
      ...weeklyJobs,
      status: "queued",
      OR: [{ attempts: 0 }, { updatedAt: { lt: new Date(Date.now() - 60_000) } }],
    },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    distinct: ["organizationId"],
    take: 4,
    select: { id: true, organizationId: true },
  });

  const results = await Promise.allSettled(jobs.map(({ id, organizationId }) => runJob(new Request(request.url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-worker-secret": WORKER_SECRET },
    body: JSON.stringify({ jobId: id, organizationId, exact: true }),
  }))));
  const errors = results.filter(result => result.status === "rejected" || !result.value.ok).length;
  return NextResponse.json({ attempted: jobs.length, errors, expired: expired.count, resumed });
}
