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

    return NextResponse.json({ jobs });
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
