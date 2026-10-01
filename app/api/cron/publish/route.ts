import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET_MISSING" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization");

  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const workerSecret = process.env.WORKER_SECRET;

  if (!workerSecret) {
    return NextResponse.json(
      { error: "WORKER_SECRET_MISSING" },
      { status: 500 }
    );
  }

  const origin = new URL(req.url).origin;

  let processed = 0;
  const results: unknown[] = [];

  // Drain several due publishing jobs per cron invocation.
  for (let i = 0; i < 20; i++) {
    const response = await fetch(`${origin}/api/publishing/queue`, {
      method: "POST",
      headers: {
        "x-worker-secret": workerSecret,
        "content-type": "application/json",
      },
      cache: "no-store",
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "PUBLISH_WORKER_FAILED",
          processed,
          workerResult: result,
        },
        { status: 500 }
      );
    }

    if (result?.status === "idle") {
      break;
    }

    processed++;
    results.push(result);
  }

  return NextResponse.json({
    ok: true,
    processed,
    results,
  });
}
