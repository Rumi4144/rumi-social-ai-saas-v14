import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { z } from "zod";

const schema = z.object({ jobId: z.string().min(1).max(200) });

export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer") {
      return NextResponse.json({ error: "Your role cannot retry publishing." }, { status: 403 });
    }
    if (req.headers.get("origin") !== new URL(req.url).origin) {
      return NextResponse.json({ error: "Reload this page and try again." }, { status: 403 });
    }
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a publishing job." }, { status: 400 });

    const job = await prisma.publishJob.findFirst({
      where: { id: parsed.data.jobId, organizationId: ctx.organizationId },
      select: { id: true, status: true, externalPostId: true },
    });
    if (!job) return NextResponse.json({ error: "Publishing job not found." }, { status: 404 });
    // A delivery receipt may already represent a public post. Never turn it into another write.
    if (job.status !== "failed" || job.externalPostId) {
      return NextResponse.json({ error: "Only failed deliveries without a publishing receipt can be retried. Check existing posts first." }, { status: 409 });
    }

    // Keep tenant and state checks in the write so concurrent clicks can enqueue only once.
    const changed = await prisma.publishJob.updateMany({
      where: { id: job.id, organizationId: ctx.organizationId, status: "failed", externalPostId: null },
      data: { status: "retry", lastError: null, attempts: 0, scheduledFor: new Date() },
    });
    if (changed.count !== 1) return NextResponse.json({ error: "This delivery changed. Refresh publishing activity." }, { status: 409 });
    return NextResponse.json({ ok: true, jobId: job.id, status: "retry" });
  } catch (error) {
    return apiError(error, "Could not retry this delivery.");
  }
}
