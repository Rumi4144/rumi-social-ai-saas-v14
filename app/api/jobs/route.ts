import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";

export async function GET() {
  try {
    console.log("JOBS_DEBUG_1: entering tenantContext");

    const ctx = await tenantContext();

    console.log("JOBS_DEBUG_2", {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
    });

    const jobs = await prisma.job.findMany({
      where: {
        organizationId: ctx.organizationId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 25,
    });

    console.log("JOBS_DEBUG_3", {
      organizationId: ctx.organizationId,
      jobCount: jobs.length,
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
