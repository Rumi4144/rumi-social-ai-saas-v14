import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshVideo } from "@/lib/video/jobs";
export const maxDuration = 300;
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const jobs = await prisma.job.findMany({ where: { type: "RUNWAY_VIDEO", status: { in: ["running", "saving"] } }, orderBy: { updatedAt: "asc" }, take: 10 });
  for (const job of jobs) await refreshVideo(job);
  return NextResponse.json({ checked: jobs.length });
}
