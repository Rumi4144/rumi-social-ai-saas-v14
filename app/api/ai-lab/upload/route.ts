import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { labCanRun } from "@/lib/ai-lab/catalog";
import { labUploadTicket } from "@/lib/ai-lab/providers";
import { fetchPublicBytes } from "@/lib/reels/public-fetch";
import { pageBelongsToBrand } from "@/lib/reels/product-photos";
import sharp from "sharp";
const types = ["image/jpeg", "image/png", "image/webp", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/webm", "audio/ogg"] as const;
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), organizationId: z.string(), filename: z.string().min(1).max(150).regex(/^[\w .()-]+$/), size: z.number().int().min(1).max(10_000_000), contentType: z.enum(types) }),
  z.object({ action: z.literal("complete"), organizationId: z.string(), assetId: z.string().max(150) }),
  z.object({ action: z.literal("import"), organizationId: z.string(), url: z.string().url().max(2000) }),
]);
export async function POST(req: Request) {
  try {
    const ctx = await tenantContext(); if (!labCanRun(ctx.role, ctx.isSuperAdmin)) throw new Error("FORBIDDEN");
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose a JPEG, PNG, WebP photo or audio file up to 10 MB." }, { status: 400 });
    const p = parsed.data;
    if (p.organizationId !== ctx.organizationId) return NextResponse.json({ error: "Your workspace changed. Reload the lab." }, { status: 409 });
    if (!process.env.WAVESPEED_API_KEY) return NextResponse.json({ error: "WaveSpeed needs administrator setup first." }, { status: 503 });
    if (p.action === "import") {
      const brands = await prisma.brand.findMany({ where: { organizationId: ctx.organizationId }, select: { websiteUrl: true } });
      if (!brands.some(brand => pageBelongsToBrand(p.url, brand.websiteUrl || "", []))) return NextResponse.json({ error: "Use a direct photo link from this workspace’s brand website." }, { status: 400 });
      const previous = await prisma.mediaAsset.findFirst({ where: { organizationId: ctx.organizationId, kind: "ai_lab_input", status: "ready", createdAt: { gt: new Date(Date.now() - 6 * 86400000) }, metadata: { path: ["sourceUrl"], equals: p.url } } });
      if (previous) return NextResponse.json({ assetId: previous.id, name: (previous.metadata as {filename:string}).filename });
      const recent = await prisma.mediaAsset.count({ where: { organizationId: ctx.organizationId, kind: "ai_lab_input", createdAt: { gt: new Date(Date.now() - 86400000) } } });
      if (recent >= 20) return NextResponse.json({ error: "Today's upload allowance is used." }, { status: 429 });
      let photo: Awaited<ReturnType<typeof fetchPublicBytes>>, contentType: string;
      try {
        photo = await fetchPublicBytes(p.url, 10_000_000);
        const info = await sharp(photo.bytes, { limitInputPixels: 30_000_000 }).metadata();
        contentType = ({ jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as Record<string,string>)[info.format || ""];
        if (!contentType || !photo.contentType.startsWith(contentType) || !info.width || !info.height || (info.pages || 1) > 1) throw new Error("Unsupported image");
      } catch { return NextResponse.json({ error: "Use the direct link to a JPEG, PNG or WebP photo under 10 MB." }, { status: 422 }); }
      const filename = (new URL(p.url).pathname.split("/").pop() || "product-photo").replace(/[^\w .()-]/g, "_").slice(-150);
      const ticket = await labUploadTicket(filename, photo.bytes.length, contentType);
      const asset = await prisma.mediaAsset.create({ data: { organizationId: ctx.organizationId, kind: "ai_lab_input", provider: "wavespeed", status: "uploading", url: ticket.download_url, metadata: { filename, kind: "image", size: photo.bytes.length, contentType, sourceUrl: p.url } } });
      const sent = await fetch(ticket.upload.url, { method: "PUT", headers: ticket.upload.headers, body: new Uint8Array(photo.bytes), redirect: "error", signal: AbortSignal.timeout(30000) });
      if (!sent.ok) throw new Error("Photo transfer failed");
      const uploaded = await fetchPublicBytes(ticket.download_url, 10_000_000);
      if (!uploaded.bytes.equals(photo.bytes)) throw new Error("Photo transfer could not be verified");
      await prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: "ready" } });
      return NextResponse.json({ assetId: asset.id, name: filename });
    }
    if (p.action === "prepare") {
      const recent = await prisma.mediaAsset.count({ where: { organizationId: ctx.organizationId, kind: "ai_lab_input", createdAt: { gt: new Date(Date.now() - 86400000) } } });
      if (recent >= 20) return NextResponse.json({ error: "Today's upload allowance is used." }, { status: 429 });
      const ticket = await labUploadTicket(p.filename, p.size, p.contentType);
      const asset = await prisma.mediaAsset.create({ data: { organizationId: ctx.organizationId, kind: "ai_lab_input", provider: "wavespeed", status: "uploading", url: ticket.download_url, metadata: { filename: p.filename, kind: p.contentType.startsWith("image/") ? "image" : "audio", size: p.size, contentType: p.contentType } } });
      return NextResponse.json({ assetId: asset.id, upload: ticket.upload });
    }
    const asset = await prisma.mediaAsset.findFirst({ where: { id: p.assetId, organizationId: ctx.organizationId, kind: "ai_lab_input", status: "uploading", createdAt: { gt: new Date(Date.now() - 3600000) } } });
    if (!asset?.url) return NextResponse.json({ error: "Upload not found. Choose the file again." }, { status: 404 });
    const meta = asset.metadata as { size: number; contentType: string; kind: string };
    const uploaded = await fetchPublicBytes(asset.url, 10_000_000);
    if (uploaded.bytes.length !== meta.size || !uploaded.contentType.startsWith(meta.kind + "/")) return NextResponse.json({ error: "The uploaded file could not be verified." }, { status: 422 });
    await prisma.mediaAsset.update({ where: { id: asset.id }, data: { status: "ready" } });
    return NextResponse.json({ assetId: asset.id });
  } catch (error) { return apiError(error, "Could not upload this sample input. Try again later."); }
}
