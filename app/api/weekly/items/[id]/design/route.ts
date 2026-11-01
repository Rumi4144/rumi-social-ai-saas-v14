import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { changeDesign, designChoices } from "@/lib/creative/change-design";
import { PictureError } from "@/lib/creative/replace-picture";
import { isWeeklyDesign, WEEKLY_DESIGN_FAMILIES } from "@/lib/render/weekly-layouts";

export const runtime = "nodejs";
export const maxDuration = 60;
const layout = z.string().refine(isWeeklyDesign);
const version = z.string().min(1).max(2000);
const selection = z.object({ expectedMediaUrl: version, layout }).strict();
const query = z.object({ expectedMediaUrl: version, page: z.coerce.number().int().min(0).max(14).optional(), family: z.string().refine(value => WEEKLY_DESIGN_FAMILIES.includes(value)).optional(), layout: layout.optional() }).strict();
const response = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (error: unknown) => error instanceof PictureError ? response({ error: error.message }, error.status) : apiError(error, "Could not prepare this design. Your original ad is unchanged. Try again.");

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer") return response({ error: "Your access is read-only." }, 403);
    const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return response({ error: "Choose a design from the library." }, 400);
    return response(await designChoices(ctx, (await params).id, parsed.data));
  } catch (error) { return failure(error); }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer") return response({ error: "Your access is read-only." }, 403);
    if (req.headers.get("origin") !== new URL(req.url).origin) return response({ error: "Request origin is not allowed." }, 403);
    const reader = req.body?.getReader();
    if (!reader) return response({ error: "Choose a design." }, 400);
    const chunks: Buffer[] = []; let size = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 8000) { await reader.cancel(); return response({ error: "The selection is too large." }, 413); }
      chunks.push(Buffer.from(part.value));
    }
    let json: unknown;
    try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return response({ error: "Choose a design." }, 400); }
    const parsed = selection.safeParse(json);
    if (!parsed.success) return response({ error: "Choose a design from the library." }, 400);
    return response(await changeDesign(ctx, (await params).id, parsed.data));
  } catch (error) { return failure(error); }
}
