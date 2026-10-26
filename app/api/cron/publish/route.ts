import { NextResponse } from "next/server";
import { processDuePublishJob } from "@/lib/publishing/process-due-job";

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

  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const results = [];
  const startedAt = Date.now();

  for (let i = 0; i < 20; i++) {
    const result = await processDuePublishJob();

    console.log("CRON_PUBLISH_RESULT", JSON.stringify(result));

    if (result.status === "idle") {
      break;
    }

    results.push(result);
    // Media uploads may use most of the request budget. Leave the next job for the next run.
    if (Date.now() - startedAt > 10000) break;
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}
