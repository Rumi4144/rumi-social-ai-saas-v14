import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { superAdminContext } from "@/lib/admin/context";
import { apiError } from "@/lib/http/errors";
import { manifestOf } from "@/lib/weekly/plan";
import { providerImageJobId, weeklyRetryReason } from "@/lib/weekly/recovery";
export const maxDuration = 180;
const schema = z.object({ organizationId: z.string().min(1), packId: z.string().min(1), jobId: z.string().min(1) });
export async function POST(req: Request) {
  try {
    await superAdminContext();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a failed step from its customer’s weekly plan." }, { status: 400 });
    if (!process.env.WORKER_SECRET) return NextResponse.json({ error: "The preparation worker is not configured. No step was restarted." }, { status: 503 });
    const p = parsed.data;
    const result = await prisma.$transaction(async tx => {
      const pack = await tx.job.findFirst({ where: { id: p.packId, organizationId: p.organizationId, type: "WEEKLY_PACK" } });
      const manifest = manifestOf(pack?.payload);
      const job = manifest && await tx.job.findFirst({ where: { id: p.jobId, organizationId: p.organizationId, type: { in: ["CREATE_EVERYTHING", "GENERATE_IMAGE"] }, payload: { path: ["campaignId"], equals: manifest.campaignId } } });
      if (!job) return { status: 404, error: "Preparation step not found in this customer’s week." };
      const provider = await tx.job.findFirst({ where: { id: providerImageJobId(p.organizationId, job.id), organizationId: p.organizationId, type: "IMAGE_PROVIDER_TASK" } });
      const reason = weeklyRetryReason(job, provider);
      if (reason) return { status: 409, error: reason };
      const claim = await tx.job.updateMany({ where: { id: job.id, organizationId: p.organizationId, status: "failed", attempts: { lt: 3 } }, data: { status: "queued", error: null, progress: 0 } });
      return claim.count === 1 ? { status: 200, error: null } : { status: 409, error: "This preparation step already changed. Refresh its status." };
    });
    if (result.status !== 200) return NextResponse.json(result, { status: result.status });
    const response = await fetch(`${new URL(req.url).origin}/api/jobs/run`, { method: "POST", headers: { "content-type": "application/json", "x-worker-secret": process.env.WORKER_SECRET }, body: JSON.stringify({ organizationId: p.organizationId, jobId: p.jobId }), cache: "no-store" });
    return NextResponse.json(await response.json(), { status: response.status, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error, "Could not resume this preparation step. Check its latest status before retrying."); }
}
