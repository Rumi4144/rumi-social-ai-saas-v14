import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { weeklyReelAction, ReelCompletionError } from "@/lib/weekly/reel-completion";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reserve"), requestId: z.string().uuid(), contentItemId: z.string().min(1), expectedCost: z.number(), consent: z.boolean() }),
  z.object({ action: z.literal("complete"), reservationId: z.string().min(1), assetId: z.string().min(1) }),
  z.object({ action: z.literal("cancel"), reservationId: z.string().min(1) }),
  z.object({ action: z.literal("select-ai"), contentItemId: z.string().min(1), jobId: z.string().uuid(), assetId: z.string().min(1) }),
]);
export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer") return NextResponse.json({ error: "Your role cannot create reels." }, { status: 403 });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid reel action." }, { status: 400 });
    const result = await prisma.$transaction(tx => weeklyReelAction(tx, ctx.organizationId, parsed.data));
    return NextResponse.json(result, { status: "restart" in result && result.restart ? 409 : 200 });
  } catch (error) {
    if (error instanceof ReelCompletionError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiError(error, "Could not finish this reel. Your saved attempt can be resumed.");
  }
}
