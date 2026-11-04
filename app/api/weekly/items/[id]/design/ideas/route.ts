import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { rateLimit } from "@/lib/security/rate-limit";
import { designIdeas } from "@/lib/creative/change-design";
import { PictureError } from "@/lib/creative/replace-picture";

export const runtime = "nodejs";
export const maxDuration = 60;
const requestSchema = z.object({
  expectedMediaUrl: z.string().min(1).max(2000),
  direction: z.string().trim().min(3).max(300),
}).strict();
const response = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (error: unknown) => error instanceof PictureError ? response({ error: error.message }, error.status) : apiError(error, "Could not prepare AI design ideas. Your ad is unchanged. Try again.");

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer") return response({ error: "Your access is read-only." }, 403);
    if (req.headers.get("origin") !== new URL(req.url).origin) return response({ error: "Request origin is not allowed." }, 403);
    const reader = req.body?.getReader();
    if (!reader) return response({ error: "Describe the design direction you want." }, 400);
    const chunks: Buffer[] = []; let size = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 8000) { await reader.cancel(); return response({ error: "The design direction is too large." }, 413); }
      chunks.push(Buffer.from(part.value));
    }
    let json: unknown;
    try { json = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return response({ error: "Describe the design direction you want." }, 400); }
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) return response({ error: "Describe the design direction you want, using 3 to 300 characters." }, 400);
    const allowed = await rateLimit(`design-ideas:${ctx.organizationId}`, 8, 60 * 60 * 1000);
    if (!allowed.ok) return response({ error: "This workspace has reached its AI design-idea limit for this hour. You can still browse and compare every existing layout." }, 429);
    return response(await designIdeas(ctx, (await params).id, parsed.data));
  } catch (error) { return failure(error); }
}
