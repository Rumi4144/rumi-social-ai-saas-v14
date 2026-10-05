import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { decodeClip } from "@/lib/video/clips";
const S = z.object({ campaignId: z.string(), contentItemId: z.string(), dataUrl: z.string().max(4200000) });
export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer") return NextResponse.json({ error: "Your workspace role cannot add videos." }, { status: 403 });
    const p = S.safeParse(await req.json());
    if (!p.success) return NextResponse.json({ error: "Choose an MP4 or WebM video up to 3 MB." }, { status: 400 });
    decodeClip(p.data.dataUrl);
    const item = await prisma.contentItem.findFirst({ where: { id: p.data.contentItemId, campaignId: p.data.campaignId, campaign: { brand: { organizationId: ctx.organizationId } } } });
    if (!item) return NextResponse.json({ error: "Campaign post not found." }, { status: 404 });
    const asset = await prisma.mediaAsset.create({ data: { organizationId: ctx.organizationId, campaignId: p.data.campaignId, contentItemId: item.id, kind: "campaign_video", provider: "upload", url: p.data.dataUrl, metadata: { publishMode: "review", sound: "original" } } });
    return NextResponse.json({ assetId: asset.id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to attach video." }, { status: 400 });
  }
}
