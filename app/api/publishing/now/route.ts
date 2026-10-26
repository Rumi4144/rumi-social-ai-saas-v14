import { TikTokOptions } from "@/lib/tiktok/options";
import { prepareXPost, XPublishError, type XPost } from "@/lib/x/publishing";
import { prepareTikTokSettings } from "@/lib/tiktok/prepare";
import { googleBusinessPost } from "@/lib/publishing/google-business";
import { campaignVideoId } from "@/lib/publishing/facebook-video";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { requiresVideo } from "@/lib/campaign/content-plan";
import { publishKey } from "@/lib/publishing/idempotency";
import { publishToProvider } from "@/lib/publishing/providers";
import { z } from "zod";

export const maxDuration = 60;
const S = z.object({
  tiktok:TikTokOptions.optional(),
  contentItemId: z.string(),
  socialConnectionId: z.string(),
  youtube: z.object({ certified: z.literal(true), privacy: z.enum(["public", "unlisted", "private"]).default("private"), madeForKids: z.boolean(), containsSyntheticMedia: z.boolean() }).optional(),
});

export async function POST(req: Request) {
  try {
    const parsed = S.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const ctx = await tenantContext();

    if(ctx.role==="viewer")return NextResponse.json({error:"Your role cannot publish posts."},{status:403});
    const item = await prisma.contentItem.findFirst({
      where: {
        id: parsed.data.contentItemId,
        campaign: {
          brand: {
            organizationId: ctx.organizationId,
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: "Content not found" },
        { status: 404 }
      );
    }

    if (item.status !== "approved") {
      return NextResponse.json(
        { error: "Content must be approved before publishing." },
        { status: 409 }
      );
    }

    if (item.type === "story_post") return NextResponse.json({error:"Download this Story draft and publish it manually. Automatic Story publishing is not available yet."},{status:400});

    if (requiresVideo(item.type) && !campaignVideoId(item.mediaUrl)) return NextResponse.json({error:"Finish and select the planned video before publishing."},{status:400});

    const connection =
      await prisma.socialConnection.findFirst({
        where: {
          id: parsed.data.socialConnectionId,
          organizationId: ctx.organizationId,
          status: "connected",
        },
      });

    if (!connection) {
      return NextResponse.json(
        { error: "Social connection not found" },
        { status: 404 }
      );
    }

    if(connection.provider==="tiktok_sandbox")return NextResponse.json({error:"Use the separate TikTok test area."},{status:403});

    if (item.mediaUrl?.includes("/api/video/media/") && !["facebook", "instagram", "youtube", "tiktok", "x"].includes(connection.provider.toLowerCase())) return NextResponse.json({ error: "Choose a supported video account for publishing." }, { status: 400 });

    let xPost: XPost | undefined;
    if (connection.provider === "x") {
      try { xPost = await prepareXPost(ctx.organizationId, item, connection); }
      catch (error) { return NextResponse.json({ submitted: false, error: error instanceof XPublishError ? error.message : "Rumi could not prepare this post for X. Please try again." }, { status: 400 }); }
    }

    if (connection.provider === "youtube" && (!parsed.data.youtube || !campaignVideoId(item.mediaUrl))) return NextResponse.json({ error: "Select a campaign video and confirm YouTube settings." }, { status: 400 });
    if (connection.provider === "google_business") { try { googleBusinessPost(item.caption || item.headline || "", item.mediaUrl); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "This post is not supported by Google Business Profile." }, { status: 400 }); } }
    let tiktokSettings;
    if(connection.provider==="tiktok"){
      try{tiktokSettings=await prepareTikTokSettings(ctx.organizationId,item,connection,parsed.data.tiktok);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Review TikTok settings."},{status:400});}
    }
    const publishTime = new Date();
    const key = publishKey(
      item.id,
      connection.id,
      publishTime.toISOString()
    );

    const job = await prisma.$transaction(async tx => {
    const job = await tx.publishJob.create({
      data: {
        organizationId: ctx.organizationId,
        contentItemId: item.id,
        socialConnectionId: connection.id,
        platform: connection.provider,
        scheduledFor: publishTime,
        status: "publishing",
        attempts: 1,
        idempotencyKey: key,
      },
    });

    if (connection.provider === "youtube") await tx.job.create({ data: { id: `youtube_settings_${job.id}`, organizationId: ctx.organizationId, type: "YOUTUBE_CAMPAIGN_SETTINGS", status: "ready", payload: { ...parsed.data.youtube!, connectionId: connection.id } } });
    if(connection.provider==="tiktok")await tx.job.create({data:{id:`tiktok_settings_${job.id}`,organizationId:ctx.organizationId,type:"TIKTOK_POST_SETTINGS",status:"ready",payload:tiktokSettings!}});
    if (xPost) await tx.job.create({ data: { id: `x_settings_${job.id}`, organizationId: ctx.organizationId, type: "X_POST_SETTINGS", status: "ready", payload: xPost } });
    return job;
    });

    const result = await publishToProvider({
      platform: connection.provider,
      token: connection.encryptedToken || "",
      externalAccountId: connection.externalId || "",
      caption: item.caption || item.headline || "",
      mediaUrl: item.mediaUrl,
      organizationId: ctx.organizationId,
      contentItemId: item.id,
      publishJobId: job.id,
    });

    await prisma.publishAttempt.create({
      data: {
        publishJobId: job.id,
        attempt: 1,
        status: result.ok ? "succeeded" : "failed",
        responseCode: result.code,
        externalId: result.externalId,
        error: result.error,
      },
    });

    if (result.pending) {
      const retryAt = new Date(Date.now() + 5 * 60 * 1000);
      await prisma.publishJob.update({ where: { id: job.id }, data: { status: "retry", scheduledFor: retryAt, lastError: result.error } });
      await prisma.contentItem.update({ where: { id: item.id }, data: { status: "scheduled", scheduledFor: retryAt } });
      return NextResponse.json({ ok: true, pending: true, jobId: job.id, message: result.error }, { status: 202 });
    }

    if (!result.ok) {
      await prisma.publishJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          lastError: result.error || "Publishing failed",
        },
      });

      return NextResponse.json(
        {
          ok: false,
          jobId: job.id,
          error: result.error || "Publishing failed",
        },
        { status: 502 }
      );
    }

    await prisma.publishJob.update({
      where: { id: job.id },
      data: {
        status: "published",
        externalPostId: result.externalId,
        publishedAt: new Date(),
        lastError: null,
      },
    });

    await prisma.contentItem.update({
      where: { id: item.id },
      data: {
        status: "published",
      },
    });

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      externalPostId: result.externalId,
    });
  } catch (error) {
    console.error("PUBLISH_NOW_ERROR", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not publish content.",
      },
      { status: 500 }
    );
  }
}
