import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { createVideoTask, runwayConfigured, runwayModel, validImage, RunwayError } from "@/lib/video/runway";
import { videoMotionPrompt } from "@/lib/video/clips";
import { failVideo, refreshVideo, videoSummary } from "@/lib/video/jobs";

export const maxDuration = 60;
const S = z.object({ requestId: z.string().uuid(), campaignId: z.string().optional(), contentItemId: z.string().optional(), assetId: z.string().optional(),
  imageUrl: z.string().max(3_000_000).optional(), prompt: z.string().trim().min(10).max(1000),
  duration: z.union([z.literal(5), z.literal(10)]).default(5), ratio: z.enum(["720:1280", "1280:720"]).default("720:1280"), consent: z.literal(true),
}).refine(v => Boolean(v.assetId || v.imageUrl));
const reply = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer") return reply({ error: "Your workspace role cannot generate videos." }, 403);
    if (Number(req.headers.get("content-length")) > 3_100_000) return reply({ error: "The image is too large. Choose an image under 2 MB." }, 413);
    const parsed = S.safeParse(await req.json());
    if (!parsed.success) return reply({ error: "Choose an image, add a motion prompt and confirm generation." }, 400);
    const p = parsed.data;
    const existing = await prisma.job.findFirst({ where: { id: p.requestId, organizationId: ctx.organizationId, type: "RUNWAY_VIDEO" } });
    if (existing) return reply({ job: videoSummary(existing) });
    if (!runwayConfigured()) return reply({ error: "Runway setup is not complete. Your administrator must connect Runway and private video storage." }, 503);
    let imageUrl = p.imageUrl || "";
    if (p.assetId) {
      const asset = await prisma.mediaAsset.findFirst({ where: { id: p.assetId, organizationId: ctx.organizationId, status: "ready", kind: { in: ["ai_image", "social_creative"] } } });
      if (!asset?.url) return reply({ error: "Image not found in this workspace." }, 404);
      imageUrl = asset.url;
    }
    if (!validImage(imageUrl)) return reply({ error: "Use a public HTTPS image URL or a PNG, JPEG or WebP image under 2 MB." }, 400);
    if (p.campaignId && !await prisma.campaign.findFirst({ where: { id: p.campaignId, brand: { organizationId: ctx.organizationId } } })) return reply({ error: "Campaign not found." }, 404);
    if (p.contentItemId) {
      const item = await prisma.contentItem.findFirst({ where: { id: p.contentItemId, campaignId: p.campaignId, campaign: { brand: { organizationId: ctx.organizationId } } } });
      const source = p.assetId && await prisma.mediaAsset.findFirst({ where: { id: p.assetId, organizationId: ctx.organizationId, campaignId: item?.campaignId, contentItemId: p.contentItemId, kind: "ai_image", status: "ready" } });
      if (!p.campaignId || !item || !source) return reply({ error: "Choose this post's own source image." }, 404);
    }
    const cost = p.duration === 10 ? 80 : 40;
    const payload = { prompt: p.contentItemId ? videoMotionPrompt(p.prompt) : p.prompt, duration: p.duration, ratio: p.ratio, model: runwayModel(), cost, ...(p.campaignId ? { campaignId: p.campaignId } : {}), ...(p.assetId ? { assetId: p.assetId } : {}), ...(p.contentItemId ? { contentItemId: p.contentItemId } : {}) };
    const job = await prisma.$transaction(async tx => {
      const created = await tx.job.create({ data: { id: p.requestId, organizationId: ctx.organizationId, type: "RUNWAY_VIDEO", status: "starting", payload } });
      const spent = await tx.subscription.updateMany({ where: { organizationId: ctx.organizationId, credits: { gte: cost } }, data: { credits: { decrement: cost } } });
      if (!spent.count) throw new Error("INSUFFICIENT_CREDITS");
      const sub = await tx.subscription.findUniqueOrThrow({ where: { organizationId: ctx.organizationId } });
      await tx.creditLedger.create({ data: { organizationId: ctx.organizationId, delta: -cost, balanceAfter: sub.credits, reason: "video_scene", referenceId: created.id } });
      return created;
    });
    let taskId: string | undefined;
    try {
      const task = await createVideoTask({ imageUrl, ...payload });
      taskId = task.id;
      console.log("RUNWAY_TASK_CREATED", JSON.stringify({ jobId: job.id, taskId }));
      // Record the task before responding. A retry can only retrieve this job.
      const running = await prisma.job.update({ where: { id: job.id }, data: { status: "running", progress: 1, payload: { ...payload, taskId: task.id } } });
      console.log("RUNWAY_VIDEO_STARTED", JSON.stringify({ jobId: job.id, taskId: task.id }));
      return reply({ job: videoSummary(running) }, 202);
    } catch (error) {
      if (taskId) {
        await prisma.job.update({ where: { id: job.id }, data: { status: "running", payload: { ...payload, taskId }, error: "Saving task details was delayed. Rumi will check the same video." } });
      } else if (error instanceof RunwayError && error.status < 500) {
        await failVideo(job, `${error.message} Your Rumi credits were returned.`);
      } else {
        await prisma.job.update({ where: { id: job.id }, data: { status: "uncertain", error: "Runway did not confirm the request. Do not generate again; contact support with this request ID." } });
      }
      return reply({ job: videoSummary(await prisma.job.findUniqueOrThrow({ where: { id: job.id } })) });
    }
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDITS") return reply({ error: "Not enough Rumi credits. Add credits in Billing." }, 402);
    // A concurrent repeat loses the unique-ID claim and must never call Runway.
    if ((error as { code?: string })?.code === "P2002") return reply({ error: "This request is already starting. Refresh its status instead of generating again." }, 409);
    return apiError(error, "Could not start video generation.");
  }
}
export async function GET(req: Request) {
  try {
    const ctx = await tenantContext();
    const id = new URL(req.url).searchParams.get("jobId");
    if (id) {
      const job = await prisma.job.findFirst({ where: { id, organizationId: ctx.organizationId, type: "RUNWAY_VIDEO" } });
      if (!job) return reply({ error: "Video not found." }, 404);
      return reply({ job: videoSummary(await refreshVideo(job)) });
    }
    const [jobs, images, sub] = await Promise.all([
      prisma.job.findMany({ where: { organizationId: ctx.organizationId, type: "RUNWAY_VIDEO" }, orderBy: { createdAt: "desc" }, take: 20 }),
      prisma.mediaAsset.findMany({ where: { organizationId: ctx.organizationId, status: "ready", kind: { in: ["ai_image", "social_creative"] } }, select: { id: true, kind: true, prompt: true }, orderBy: { createdAt: "desc" }, take: 30 }),
      prisma.subscription.findUnique({ where: { organizationId: ctx.organizationId }, select: { credits: true } }),
    ]);
    return reply({ configured: runwayConfigured(), model: runwayModel(), credits: sub?.credits || 0, jobs: jobs.map(videoSummary), images });
  } catch (error) { return apiError(error, "Could not load video studio."); }
}
