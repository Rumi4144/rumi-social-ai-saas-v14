import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { publishKey } from "@/lib/publishing/idempotency";
import { publishToProvider } from "@/lib/publishing/providers";
import { z } from "zod";

const S = z.object({
  contentItemId: z.string(),
  socialConnectionId: z.string(),
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

    if (item.mediaUrl?.includes("/api/video/media/") && connection.provider.toLowerCase() !== "facebook") return NextResponse.json({ error: "Choose Facebook for automatic video publishing. Download the clip for other platforms." }, { status: 400 });

    const publishTime = new Date();
    const key = publishKey(
      item.id,
      connection.id,
      publishTime.toISOString()
    );

    const job = await prisma.publishJob.create({
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
