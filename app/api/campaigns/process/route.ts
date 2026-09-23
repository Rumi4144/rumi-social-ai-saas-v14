import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";

export async function POST(req: Request) {
  try {
    // Require a valid logged-in tenant.
    await tenantContext();

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
        "x-worker-secret": process.env.WORKER_SECRET,
      },
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
