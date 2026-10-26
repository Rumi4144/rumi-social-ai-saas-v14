import { TikTokOptions } from "@/lib/tiktok/options";
import { prepareXPost, XPublishError, type XPost } from "@/lib/x/publishing";
import { prepareTikTokSettings } from "@/lib/tiktok/prepare";
import { googleBusinessPost } from "@/lib/publishing/google-business";
import { campaignVideoId } from "@/lib/publishing/facebook-video";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publishKey } from "@/lib/publishing/idempotency";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { requiresVideo } from "@/lib/campaign/content-plan";

export const maxDuration = 60;

const S = z.object({
  tiktok:TikTokOptions.optional(),
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

    if(ctx.role==="viewer")return NextResponse.json({error:"Your role cannot schedule posts."},{status:403});
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

    if (item.type === "story_post") return NextResponse.json({error:"Download this Story draft and publish it manually. Automatic Story publishing is not available yet."},{status:400});

    if (requiresVideo(item.type) && !campaignVideoId(item.mediaUrl)) return NextResponse.json({error:"Finish and select the planned video before scheduling."},{status:400});

    const scheduledFor = new Date(p.data.scheduledFor);

    if (scheduledFor <= new Date()) {
      return NextResponse.json(
        { error: "Scheduled time must be in the future." },
        { status: 400 },
      );
    }

    const youtubeSelected = await prisma.socialConnection.findFirst({ where: { id: { in: p.data.socialConnectionIds }, organizationId: ctx.organizationId, provider: "youtube", status: "connected" } });
    if (youtubeSelected && (!p.data.youtube || !campaignVideoId(item.mediaUrl))) return NextResponse.json({ error: "Select a campaign video and confirm YouTube settings." }, { status: 400 });
    const googleSelected = await prisma.socialConnection.findFirst({ where: { id: { in: p.data.socialConnectionIds }, organizationId: ctx.organizationId, provider: "google_business", status: "connected" } });
    if (googleSelected) { try { googleBusinessPost(item.caption || item.headline || "", item.mediaUrl); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "This post is not supported by Google Business Profile." }, { status: 400 }); } }
    const tiktokSelected=await prisma.socialConnection.findFirst({where:{id:{in:p.data.socialConnectionIds},organizationId:ctx.organizationId,provider:"tiktok",status:"connected"}});
    let tiktokSettings;
    if(tiktokSelected?.provider==="tiktok"){
      try{tiktokSettings=await prepareTikTokSettings(ctx.organizationId,item,tiktokSelected,p.data.tiktok);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Review TikTok settings."},{status:400});}
    }
    // Validate every selected X account before queuing any destination.
    const xSelected = await prisma.socialConnection.findMany({ where: { id: { in: p.data.socialConnectionIds }, organizationId: ctx.organizationId, provider: "x" } });
    const xPosts = new Map<string, XPost>();
    for (const connection of xSelected) {
      try { xPosts.set(connection.id, await prepareXPost(ctx.organizationId, item, connection)); }
      catch (error) { return NextResponse.json({ submitted: false, error: error instanceof XPublishError ? error.message : "Rumi could not prepare this post for X. Please try again." }, { status: 400 }); }
    }
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
      if (!["facebook", "instagram", "youtube", "google_business", "tiktok", "x"].includes(connection.provider.toLowerCase())) continue;
      if (item.mediaUrl?.includes("/api/video/media/") && !["facebook", "instagram", "youtube", "tiktok", "x"].includes(connection.provider.toLowerCase())) continue;

      if(connection.provider==="tiktok"&&!tiktokSettings)continue;
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
      if(connection.provider==="tiktok")await tx.job.upsert({where:{id:`tiktok_settings_${job.id}`},update:{},create:{id:`tiktok_settings_${job.id}`,organizationId:ctx.organizationId,type:"TIKTOK_POST_SETTINGS",status:"ready",payload:tiktokSettings!}});
      if (connection.provider === "x") await tx.job.upsert({ where: { id: `x_settings_${job.id}` }, update: {}, create: { id: `x_settings_${job.id}`, organizationId: ctx.organizationId, type: "X_POST_SETTINGS", status: "ready", payload: xPosts.get(connection.id)! } });
      return job;
      });

      jobs.push(job);
    }

    if (jobs.length === 0) {
      return NextResponse.json(
        { error: "No supported connected accounts were selected. Choose a connected account supported by this post format." },
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
