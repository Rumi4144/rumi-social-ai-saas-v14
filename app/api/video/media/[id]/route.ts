import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { decodeClip } from "@/lib/video/clips";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await tenantContext();
    const { id } = await params;
    const asset = await prisma.mediaAsset.findFirst({ where: { id, organizationId: ctx.organizationId, kind: "campaign_video", status: "ready" } });
    if (!asset?.url) return new NextResponse("Not found", { status: 404 });
    if (asset.url.startsWith("data:")) {
      const clip = decodeClip(asset.url);
      const headers = { "Content-Type": clip.contentType, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Accept-Ranges": "bytes" };
      const range = _req.headers.get("range");
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        const size = clip.bytes.length;
        const start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2]));
        const end = match?.[1] ? (match[2] ? Math.min(Number(match[2]), size - 1) : size - 1) : size - 1;
        if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start || (!match[1] && Number(match[2]) === 0)) return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
        return new NextResponse(new Uint8Array(clip.bytes.subarray(start, end + 1)), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
      }
      return new NextResponse(new Uint8Array(clip.bytes), { headers: { ...headers, "Content-Length": String(clip.bytes.length) } });
    }
    const meta = asset.metadata as { pathname?: string } | null;
    if (meta?.pathname === `runway/${ctx.organizationId}/${asset.id}.mp4`) return NextResponse.redirect(new URL(`/api/video/file?jobId=${asset.id}`, _req.url));
    const url = new URL(asset.url, _req.url);
    if (url.protocol !== "https:" || url.username || url.password) return new NextResponse("Invalid video", { status: 400 });
    return NextResponse.redirect(url);
  } catch { return new NextResponse("Unable to load video", { status: 403 }); }
}
