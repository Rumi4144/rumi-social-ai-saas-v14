import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";

export async function POST(req: Request) {
  try {
    // Require a valid logged-in tenant.
    const ctx = await tenantContext();

    const body = await req.json().catch(() => ({}));
    const jobId =
      typeof body?.jobId === "string" ? body.jobId.trim() : "";

    if (!jobId) {
      return NextResponse.json(
        { error: "JOB_ID_REQUIRED" },
        { status: 400 }
      );
    }

    if (!process.env.WORKER_SECRET) {
      return NextResponse.json(
        { error: "WORKER_SECRET_MISSING" },
        { status: 500 }
      );
    }

    const workerUrl = `${new URL(req.url).origin}/api/jobs/run`;

    const response = await fetch(workerUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-worker-secret": process.env.WORKER_SECRET,
      },
      body: JSON.stringify({
        jobId,
        organizationId: ctx.organizationId,
      }),
      cache: "no-store",
    });

    const result = await response.json();

    return NextResponse.json(result, {
      status: response.status,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "CAMPAIGN_PROCESS_FAILED",
      },
      { status: 500 }
    );
  }
}
