import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";

export async function GET() {
  try {
    const ctx = await tenantContext();

    const connections = await prisma.socialConnection.findMany({
      where: {
        organizationId: ctx.organizationId,
        status: "connected",
      },
      select: {
        id: true,
        provider: true,
        accountName: true,
        externalId: true,
      },
      orderBy: {
        provider: "asc",
      },
    });

    return NextResponse.json({
      connections,
    });
  } catch (error) {
    console.error("SOCIAL_CONNECTIONS_ERROR", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load social accounts.",
      },
      { status: 500 },
    );
  }
}
