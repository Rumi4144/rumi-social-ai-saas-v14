import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { prepareWeekly, weeklyView, WeeklyError } from "@/lib/weekly/service";
import { apiError } from "@/lib/http/errors";

const prepare = z.object({ action: z.literal("prepare"), requestId: z.string().uuid(), brandId: z.string().min(1).optional(), weekStart: z.string().optional(), expectedCredits: z.number().int().positive(), mix: z.object({ images: z.number().int().min(0).max(21), motionReels: z.number().int().min(0).max(4), aiVideos: z.number().int().min(0).max(1) }).optional() });
const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) { return error instanceof WeeklyError ? NextResponse.json({ error: error.message }, { status: error.status, headers }) : apiError(error, "Could not load or prepare this week. Your existing content is safe; refresh and try again."); }
export async function GET(req: Request) {
  try { const ctx = await tenantContext(), query = new URL(req.url).searchParams; return NextResponse.json(await weeklyView(ctx, { brandId: query.get("brandId") || undefined, weekStart: query.get("weekStart") || undefined }), { headers }); }
  catch (error) { return failure(error); }
}
export async function POST(req: Request) {
  try { const ctx = await tenantContext(), parsed = prepare.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Review the seven-day pack and its preparation cost before continuing." }, { status: 400, headers }); return NextResponse.json(await prepareWeekly(ctx, parsed.data), { headers }); }
  catch (error) { return failure(error); }
}
