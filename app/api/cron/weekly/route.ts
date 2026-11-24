import { NextResponse } from "next/server";
import { POST as runJob } from "@/app/api/jobs/run/route";
import { prisma } from "@/lib/prisma";
import { weeklyJobTypes } from "@/lib/weekly/preparation";

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
  // minutes before surfacing them for review. Their provider state may be unknown.
  const expired = await prisma.job.updateMany({
    where: { ...weeklyJobs, status: "running", updatedAt: { lt: new Date(Date.now() - 600_000) } },
    data: { status: "failed", error: "Preparation was interrupted. Review the saved provider request before retrying." },
  });
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
  return NextResponse.json({ attempted: jobs.length, errors, expired: expired.count });
}
