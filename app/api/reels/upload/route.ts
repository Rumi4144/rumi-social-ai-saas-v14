import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { privateReelPath, reelAssetId } from "@/lib/reels/storage";
const S = z.object({ campaignId: z.string(), contentItemId: z.string(), title: z.string().max(160), duration: z.number().min(3).max(90) });
export async function GET(req: Request) {
  try {
    const ctx = await tenantContext(), pathname = new URL(req.url).searchParams.get("pathname") || "";
    const asset = await prisma.mediaAsset.findFirst({ where: { id: reelAssetId(pathname), organizationId: ctx.organizationId, provider: "reel-editor", status: "ready" }, select: { id: true } });
    return NextResponse.json(asset ? { assetId: asset.id } : { pending: true });
  } catch (error) { return apiError(error, "Could not check reel storage."); }
}
export async function POST(req: Request) {
  try {
    const body = await req.json() as HandleUploadBody;
    const result = await handleUpload({ request: req, body,
      onBeforeGenerateToken: async (pathname, raw) => {
        const ctx = await tenantContext(); if (ctx.role === "viewer") throw new Error("FORBIDDEN");
        const payload = S.parse(JSON.parse(raw || "{}"));
        const item = await prisma.contentItem.findFirst({ where: { id: payload.contentItemId, campaignId: payload.campaignId, campaign: { brand: { organizationId: ctx.organizationId } } } });
        if (!item || !privateReelPath(pathname, ctx.organizationId, item.id)) throw new Error("FORBIDDEN");
        return { allowedContentTypes: pathname.endsWith(".mp4") ? ["video/mp4"] : ["video/webm"], maximumSizeInBytes: 100_000_000, addRandomSuffix: false, allowOverwrite: false, validUntil: Date.now() + 15 * 60_000, tokenPayload: JSON.stringify({ ...payload, organizationId: ctx.organizationId, pathname }) };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // The SDK verifies Vercel's signed completion callback before this runs.
        const p = JSON.parse(tokenPayload || "{}") as z.infer<typeof S> & { organizationId: string; pathname: string };
        S.parse(p);
        if (blob.pathname !== p.pathname || !privateReelPath(blob.pathname, p.organizationId, p.contentItemId)) throw new Error("Invalid reel upload");
        const item = await prisma.contentItem.findFirst({ where: { id: p.contentItemId, campaignId: p.campaignId, campaign: { brand: { organizationId: p.organizationId } } } });
        if (!item) throw new Error("Campaign no longer available");
        const id = reelAssetId(blob.pathname);
        await prisma.mediaAsset.upsert({ where: { id }, update: {}, create: { id, organizationId: p.organizationId, campaignId: p.campaignId, contentItemId: p.contentItemId, kind: "campaign_video", provider: "reel-editor", url: `/api/video/media/${id}`, prompt: p.title, metadata: { pathname: blob.pathname, duration: p.duration, publishMode: "review", contentType: blob.pathname.endsWith(".mp4") ? "video/mp4" : "video/webm" } } });
      },
    });
    return NextResponse.json(result);
  } catch (error) { return apiError(error, "Could not save the reel. Download it and try saving again."); }
}
