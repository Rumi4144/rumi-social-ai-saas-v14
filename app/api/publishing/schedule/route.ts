import { campaignVideoId } from "@/lib/publishing/facebook-video";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publishKey } from "@/lib/publishing/idempotency";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";

const S = z.object({
  organizationId: z.string().optional(),
  contentItemId: z.string(),
  socialConnectionIds: z.array(z.string()).min(1),
  scheduledFor: z.string().datetime(),
  youtube: z.object({ certified: z.literal(true), privacy: z.enum(["public", "unlisted", "private"]).default("private"), madeForKids: z.boolean(), containsSyntheticMedia: z.boolean() }).optional(),
});

export async function POST(req: Request) {
  try {
    const p = S.safeParse(await req.json());

    if (!p.success) {
      return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
    }

    const ctx = await tenantContext(p.data.organizationId);

    const item = await prisma.contentItem.findFirst({
      where: {
        id: p.data.contentItemId,
        campaign: {
          brand: {
            organizationId: ctx.organizationId,
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    if (item.status !== "approved") {
      return NextResponse.json(
        { error: "Content must be approved before scheduling." },
        { status: 409 },
      );
    }

    const scheduledFor = new Date(p.data.scheduledFor);

    if (scheduledFor <= new Date()) {
      return NextResponse.json(
        { error: "Scheduled time must be in the future." },
        { status: 400 },
      );
    }

    const youtubeSelected = await prisma.socialConnection.findFirst({ where: { id: { in: p.data.socialConnectionIds }, organizationId: ctx.organizationId, provider: "youtube", status: "connected" } });
    if (youtubeSelected && (!p.data.youtube || !campaignVideoId(item.mediaUrl))) return NextResponse.json({ error: "Select a campaign video and confirm YouTube settings." }, { status: 400 });
    const jobs = [];

    for (const cid of p.data.socialConnectionIds) {
      const connection = await prisma.socialConnection.findFirst({
        where: {
          id: cid,
          organizationId: ctx.organizationId,
          status: "connected",
        },
      });

      if (!connection) continue;
      if (!["facebook", "instagram", "youtube"].includes(connection.provider.toLowerCase())) continue;
      if (item.mediaUrl?.includes("/api/video/media/") && !["facebook", "youtube"].includes(connection.provider.toLowerCase())) continue;

      const key = publishKey(item.id, connection.id, p.data.scheduledFor);

      const job = await prisma.$transaction(async tx => {
      const job = await tx.publishJob.upsert({
        where: {
          idempotencyKey: key,
        },
        update: {},
        create: {
          organizationId: ctx.organizationId,
          contentItemId: item.id,
          socialConnectionId: connection.id,
          platform: connection.provider,
          scheduledFor,
          idempotencyKey: key,
        },
      });
      if (connection.provider === "youtube") await tx.job.upsert({ where: { id: `youtube_settings_${job.id}` }, update: {}, create: { id: `youtube_settings_${job.id}`, organizationId: ctx.organizationId, type: "YOUTUBE_CAMPAIGN_SETTINGS", status: "ready", payload: { ...p.data.youtube!, connectionId: connection.id } } });
      return job;
      });

      jobs.push(job);
    }

    if (jobs.length === 0) {
      return NextResponse.json(
        { error: "No supported connected accounts were selected. Video posts can be scheduled on Facebook or uploaded to YouTube." },
        { status: 400 },
      );
    }

    await prisma.contentItem.update({
      where: {
        id: item.id,
      },
      data: {
        status: "scheduled",
        scheduledFor,
      },
    });

    return NextResponse.json(
      {
        scheduled: jobs.length,
        scheduledFor,
        jobs,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("SCHEDULE_PUBLISH_ERROR", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not schedule content.",
      },
      { status: 500 },
    );
  }
}
