import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";

export async function POST() {
  try {
    const ctx = await tenantContext();

    if(ctx.role==="viewer")return NextResponse.json({error:"Your role cannot disconnect TikTok."},{status:403});
    await prisma.socialConnection.deleteMany({
      where: {
        organizationId: ctx.organizationId,
        provider: "tiktok",
      },
    });

    return NextResponse.redirect(
      new URL("/settings?tiktok=disconnected", process.env.NEXT_PUBLIC_APP_URL!)
    );
  } catch (error) {
    console.error("TikTok disconnect failed", error);

    return NextResponse.json(
      { error: "TIKTOK_DISCONNECT_FAILED" },
      { status: 500 }
    );
  }
}
