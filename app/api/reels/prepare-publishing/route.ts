import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";

const schema = z.object({ organizationId: z.string().min(1), contentItemId: z.string().min(1), assetId: z.string().min(1), headline: z.string().min(1).max(200), caption: z.string().max(5000).nullable() });

export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer") return NextResponse.json({ error: "Your role cannot approve posts." }, { status: 403 });
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose a saved reel and review its caption first." }, { status: 400 });
    const p = parsed.data;
    if (p.organizationId !== ctx.organizationId) return NextResponse.json({ error: "Your workspace changed. Reopen this reel." }, { status: 409 });
    const result = await prisma.$transaction(async tx => {
      const item = await tx.contentItem.findFirst({ where: { id: p.contentItemId, campaign: { brand: { organizationId: ctx.organizationId } } } });
      const asset = item && await tx.mediaAsset.findFirst({ where: { id: p.assetId, organizationId: ctx.organizationId, campaignId: item.campaignId, contentItemId: item.id, kind: "campaign_video", status: "ready" } });
      if (!item || !asset?.url) return { error: "This saved reel does not belong to the selected post.", status: 404 };
      if ((asset.metadata as { contentType?: string } | null)?.contentType !== "video/mp4") return { error: "Export an MP4 reel before posting. You can still download this version.", status: 400 };
      const active = await tx.publishJob.findFirst({ where: { contentItemId: item.id, status: { in: ["scheduled", "retry", "publishing", "published"] } } });
      if (active || ["scheduled", "published"].includes(item.status)) return { error: "This post is already scheduled or published. Check Publishing before posting again.", status: 409 };
      if (item.headline !== p.headline || item.caption !== p.caption) return { error: "The caption changed in the campaign. Reopen this reel to review the latest caption.", status: 409 };
      await tx.contentItem.update({ where: { id: item.id }, data: { mediaUrl: `/api/video/media/${asset.id}`, status: "approved" } });
      return { status: 200 };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: result.status === 200, ...result }, { status: result.status });
  } catch (error) { return apiError(error, "Could not prepare your reel for posting. Please try again."); }
}
