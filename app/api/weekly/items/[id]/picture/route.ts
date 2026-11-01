import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { PictureError, pictureChoices, replacePicture } from "@/lib/creative/replace-picture";

export const runtime = "nodejs";
export const maxDuration = 60;
const selection = z.object({ assetId: z.string().min(1).max(200), expectedMediaUrl: z.string().min(1).max(2000) }).strict();
const response = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const failure = (error: unknown) => error instanceof PictureError ? response({ error: error.message }, error.status) : apiError(error, "Could not replace this picture. Your original ad is unchanged. Try again.");

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer") return response({ error: "Your access is read-only." }, 403);
    return response({ photos: await pictureChoices(ctx, (await params).id) });
  } catch (error) { return failure(error); }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer") return response({ error: "Your access is read-only." }, 403);
    if (req.headers.get("origin") !== new URL(req.url).origin) return response({ error: "Request origin is not allowed." }, 403);
    const multipart = req.headers.get("content-type")?.includes("multipart/form-data"), limit = multipart ? 4_000_000 : 8000;
    const reader = req.body?.getReader();
    if (!reader) return response({ error: "Choose a picture." }, 400);
    const chunks: Buffer[] = []; let size = 0;
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); return response({ error: "Choose a picture up to 3 MB." }, 413); }
      chunks.push(Buffer.from(part.value));
    }
    const body = Buffer.concat(chunks);
    let input: { expectedMediaUrl: string; assetId?: string; upload?: Buffer };
    if (multipart) {
      const form = await new Response(new Uint8Array(body), { headers: req.headers }).formData();
      const expectedMediaUrl = form.get("expectedMediaUrl"), file = form.get("photo");
      if (typeof expectedMediaUrl !== "string" || !expectedMediaUrl || expectedMediaUrl.length > 2000) return response({ error: "Refresh the ad before replacing its picture." }, 400);
      if (!(file instanceof Blob) || !file.size || file.size > 3_000_000 || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return response({ error: "Choose a JPEG, PNG or WebP picture up to 3 MB." }, 400);
      input = { expectedMediaUrl, upload: Buffer.from(await file.arrayBuffer()) };
    } else {
      let json: unknown;
      try { json = JSON.parse(body.toString("utf8")); } catch { return response({ error: "Choose a saved picture for this ad." }, 400); }
      const parsed = selection.safeParse(json);
      if (!parsed.success) return response({ error: "Choose a saved picture for this ad." }, 400);
      input = parsed.data;
    }
    return response(await replacePicture(ctx, (await params).id, input));
  } catch (error) { return failure(error); }
}
