import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
const S = z.object({ contentItemId: z.string(), assetId: z.string() });
export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer") return NextResponse.json({ error: "Your role cannot change posts." }, { status: 403 });
    const p = S.safeParse(await req.json());
    if (!p.success) return NextResponse.json({ error: "Choose a post and video." }, { status: 400 });
    const result = await prisma.$transaction(async tx => {
      const item = await tx.contentItem.findFirst({ where: { id: p.data.contentItemId, campaign: { brand: { organizationId: ctx.organizationId } } } });
      const asset = item && await tx.mediaAsset.findFirst({ where: { id: p.data.assetId, organizationId: ctx.organizationId, campaignId: item.campaignId, contentItemId: item.id, status: "ready", kind: "campaign_video" } });
      if (!item || !asset?.url) return { error: "Post or video not found.", status: 404 };
      if (asset.url.startsWith("data:video/webm") || (asset.metadata as { contentType?: string } | null)?.contentType === "video/webm") return { error: "Use an MP4 clip for Facebook publishing.", status: 400 };
      const active = await tx.publishJob.findFirst({ where: { contentItemId: item.id, status: { in: ["scheduled", "retry", "publishing", "published"] } } });
      if (active || item.status === "published") return { error: "Cancel scheduled posts before changing media. Published posts cannot be replaced here.", status: 409 };
      await tx.contentItem.update({ where: { id: item.id }, data: { mediaUrl: `/api/video/media/${asset.id}`, status: "draft" } });
      return { status: 200 };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: result.status === 200, ...result }, { status: result.status });
  } catch (error) { return apiError(error, "Could not select video. Refresh the post and try again."); }
}
