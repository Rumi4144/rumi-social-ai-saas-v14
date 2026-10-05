import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import sharp from "sharp";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function unsafeAddress(address: string) {
  if (isIP(address) === 6) return !/^2[0-9a-f]{3}:/i.test(address); // global unicast only
  const p = address.split(".").map(Number);
  return p[0] === 0 || p[0] === 10 || p[0] === 127 || p[0] >= 224 || (p[0] === 169 && p[1] === 254) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 100 && p[1] >= 64 && p[1] <= 127);
}
export async function GET(req: Request) {
  try {
    const ctx = await tenantContext(), query = new URL(req.url).searchParams;
    let source: string | null = null;
    if (query.get("assetId")) source = (await prisma.mediaAsset.findFirst({ where: { id: query.get("assetId")!, organizationId: ctx.organizationId, kind: "ai_image", status: "ready" } }))?.url || null;
    else if (query.get("brandId")) source = (await prisma.brand.findFirst({ where: { id: query.get("brandId")!, organizationId: ctx.organizationId } }))?.logoUrl || null;
    if (!source) return new NextResponse("Image not found", { status: 404 });
    let bytes: Buffer;
    if (source.startsWith("data:")) {
      const match = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(source);
      if (!match || match[1].length > 28_000_000) throw new Error("Invalid image"); bytes = Buffer.from(match[1], "base64");
    } else {
      const url = new URL(source);
      if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Invalid image host");
      const addresses = await lookup(url.hostname, { all: true });
      if (!addresses.length || addresses.some(entry => unsafeAddress(entry.address))) throw new Error("Invalid image host");
      const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15000), cache: "no-store" });
      if (!response.ok || !response.body || Number(response.headers.get("content-length")) > 20_000_000) throw new Error("Image unavailable");
      const reader = response.body.getReader(), parts: Uint8Array[] = []; let size = 0;
      try { while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 20_000_000) throw new Error("Image too large"); parts.push(part.value); } } finally { await reader.cancel(); }
      bytes = Buffer.concat(parts);
    }
    const image = await sharp(bytes, { limitInputPixels: 30_000_000 }).rotate().resize(1920, 1920, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    return new NextResponse(new Uint8Array(image), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error, "Could not load this image. Upload its photo instead."); }
}
