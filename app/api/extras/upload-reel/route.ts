import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { extraId } from "@/lib/extras/service";
import type { ExtraManifest } from "@/lib/extras/types";
import { newYorkToday } from "@/lib/campaign/content-plan";

const base = z.object({ requestId: z.string().uuid(), brandId: z.string().min(1).max(100) });
const input = z.discriminatedUnion("action", [
  base.extend({ action: z.literal("prepare"), title: z.string().trim().min(1).max(160), caption: z.string().trim().max(5000) }),
  base.extend({ action: z.literal("finish"), assetId: z.string().regex(/^reel_[a-f0-9]{32}$/) }),
]);
const headers = { "Cache-Control": "private, no-store" };
function reply(body: object, status = 200) {
  return NextResponse.json(body, { status, headers });
}

export async function POST(request: Request) {
  try {
    const context = await tenantContext();
    if (context.role === "viewer" || request.headers.get("origin") !== new URL(request.url).origin) {
      return reply({ error: "This request is not allowed." }, 403);
    }
    const parsed = input.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return reply({ error: "Check the video title and caption." }, 400);
    const data = parsed.data;
    const { organizationId } = context;
    const id = extraId(organizationId, "uploaded-reel:" + data.requestId);
    const campaignId = id + "-campaign";
    const contentItemId = id + "-post";
    const scope = { id: contentItemId, campaignId, campaign: { brandId: data.brandId, brand: { organizationId } } };
    if (data.action === "prepare") {
      if (!process.env.BLOB_READ_WRITE_TOKEN) return reply({ error: "Video storage is unavailable." }, 503);
      const brand = await prisma.brand.findFirst({ where: { id: data.brandId, organizationId }, select: { id: true } });
      if (!brand) return reply({ error: "Business not found in this workspace." }, 404);
      return await prisma.$transaction(async tx => {
        const connections = await tx.socialConnection.findMany({ where: { organizationId, status: "connected" }, select: { provider: true } });
        await tx.campaign.upsert({
          where: { id: campaignId },
          update: {},
          create: { id: campaignId, brandId: brand.id, title: data.title, goal: "awareness", status: "ready" },
        });
        await tx.contentItem.upsert({
          where: { id: contentItemId },
          update: {},
          create: { id: contentItemId, campaignId, type: "reel_post", platform: [...new Set(connections.map(connection => connection.provider))].join(","), headline: data.title, caption: data.caption, status: "draft" },
        });
        const item = await tx.contentItem.findFirst({ where: scope });
        if (!item || item.headline !== data.title || item.caption !== data.caption) {
          return reply({ error: "Start a new upload for a different title or caption." }, 409);
        }
        const saved = await tx.job.findUnique({ where: { id }, select: { id: true } });
        return reply({ campaignId, contentItemId, pathname: `reels/${organizationId}/${contentItemId}/${data.requestId}.mp4`, saved: !!saved });
      });
    }
    return await prisma.$transaction(async tx => {
      const item = await tx.contentItem.findFirst({ where: scope });
      if (!item) return reply({ error: "Upload draft not found." }, 404);
      const saved = await tx.job.findUnique({ where: { id }, select: { id: true } });
      if (saved) return reply({ saved: true });
      const asset = await tx.mediaAsset.findFirst({
        where: { id: data.assetId, organizationId, campaignId, contentItemId, kind: "campaign_video", provider: "reel-editor", status: "ready" },
      });
      if (!asset || (asset.metadata as { contentType?: string } | null)?.contentType !== "video/mp4") {
        return reply({ error: "The MP4 is still being verified. Try again shortly." }, 409);
      }
      const date = newYorkToday();
      const slotKey = id + "-slot";
      const title = item.headline || "Uploaded reel";
      const manifest: ExtraManifest = {
        version: 1, extraKind: "reel", fingerprint: id, brief: title, brandId: data.brandId,
        campaignId, generationJobId: id, weekStart: date, weekEnd: date, weekNumber: 1,
        cycle: 1, requestId: data.requestId, slots: [{ key: slotKey, day: 1, date, kind: "motion_reel", topic: title, layout: "default" }],
        mix: { images: 0, motionReels: 1, aiVideos: 0 }, oneTime: false,
        preparationCredits: 0, completionCredits: 0, packCredits: 0,
      };
      await tx.contentItem.update({ where: { id: contentItemId }, data: { mediaUrl: asset.url } });
      await tx.job.upsert({
        where: { id },
        update: {},
        create: { id, organizationId, type: "EXTRA_CREATION", status: "succeeded", payload: manifest, result: { items: [{ slotKey, contentItemId }] } },
      });
      return reply({ saved: true });
    });
  } catch (error) {
    return apiError(error, "Could not save the uploaded reel. Try again with the same file.");
  }
}
