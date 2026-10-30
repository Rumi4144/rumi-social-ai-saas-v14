import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { xPhotoBytes } from "@/lib/x/media";
import { GET as videoResponse } from "@/app/api/video/media/[id]/route";
import { downloadableStatuses, savedItemMedia, safeDownloadName } from "@/components/weekly/item-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await tenantContext(), { id } = await params;
    const item = await prisma.contentItem.findFirst({ where: { id, campaign: { brand: { organizationId: ctx.organizationId } } } });
    if (!item) return NextResponse.json({ error: "Post not found." }, { status: 404 });
    if (!downloadableStatuses.includes(item.status)) return NextResponse.json({ error: "Approve this post before downloading the finished artwork." }, { status: 409 });
    const ref = savedItemMedia(item.mediaUrl);
    if (!ref) return NextResponse.json({ error: "The finished media is not available yet." }, { status: 409 });
    const asset = await prisma.mediaAsset.findFirst({ where: { id: ref.id, contentItemId: id, campaignId: item.campaignId, organizationId: ctx.organizationId, status: "ready", kind: ref.kind === "video" ? "campaign_video" : "social_creative" } });
    if (!asset?.url) return NextResponse.json({ error: "This post’s saved media is unavailable." }, { status: 404 });
    if (ref.kind === "video") {
      const url = new URL(`/api/video/media/${ref.id}?download=1`, req.url);
      return videoResponse(new Request(url, { headers: req.headers }), { params: Promise.resolve({ id: ref.id }) });
    }
    // This existing renderer embeds and renders the selected artwork itself.
    // It never substitutes a newer campaign photograph or starts generation.
    const photo = await xPhotoBytes(asset.url);
    return new NextResponse(new Uint8Array(photo.bytes), { headers: { "Content-Type": photo.contentType, "Content-Disposition": `attachment; filename="${safeDownloadName(item.headline)}.jpg"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error, "Could not download this post. Your saved post has not changed."); }
}
