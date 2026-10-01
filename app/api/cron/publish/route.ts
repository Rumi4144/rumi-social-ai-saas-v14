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

  for (let i = 0; i < 20; i++) {
    const result = await processDuePublishJob();

    if (result.status === "idle") {
      break;
    }

    results.push(result);
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}
