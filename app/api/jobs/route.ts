import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";

export async function GET(req: Request) {
  try {
    const ctx = await tenantContext();

    const url = new URL(req.url);
    const campaignId = url.searchParams.get("campaignId")?.trim();

    const jobs = await prisma.job.findMany({
      where: {
        organizationId: ctx.organizationId,
        ...(campaignId
          ? {
              payload: {
                path: ["campaignId"],
                equals: campaignId,
              },
            }
          : {}),
      },
      orderBy: {
        createdAt: "desc",
      },
      take: campaignId ? 100 : 25,
    });

    const lightweightJobs = jobs.map((job: any) => {
      const payload =
        job.payload &&
        typeof job.payload === "object" &&
        !Array.isArray(job.payload)
          ? job.payload
          : {};

      return {
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        error: job.error,
        payload: {
          campaignId:
            "campaignId" in payload && typeof payload.campaignId === "string"
              ? payload.campaignId
              : undefined,
          format:
            "format" in payload && typeof payload.format === "string"
              ? payload.format
              : undefined,
        },
      };
    });

    return NextResponse.json({ jobs: lightweightJobs });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "JOBS_LOAD_FAILED",
      },
      { status: 500 }
    );
  }
}
