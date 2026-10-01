import { NextResponse } from "next/server";
import { processDuePublishJob } from "@/lib/publishing/process-due-job";

export async function POST(req: Request) {
  if (
    !process.env.WORKER_SECRET ||
    req.headers.get("x-worker-secret") !== process.env.WORKER_SECRET
  ) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const result = await processDuePublishJob();
  return NextResponse.json(result);
}
