import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { CREDIT_COST } from "@/lib/credits";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const ctx = await tenantContext();
    const subscription = await prisma.subscription.findUnique({ where: { organizationId: ctx.organizationId } });
    return NextResponse.json({ plan: subscription?.plan ?? null, balance: subscription?.credits ?? 0, costs: { campaign: CREDIT_COST.textCampaign, image: CREDIT_COST.staticCreative, voice: CREDIT_COST.voiceover, videoScene: CREDIT_COST.videoScene, assembly: CREDIT_COST.videoAssembly } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiError(error, "Could not load credits."); }
}
