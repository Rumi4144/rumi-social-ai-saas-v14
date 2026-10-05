import { prisma } from "@/lib/prisma";
import { put } from "@vercel/blob";
import { getVideoTask } from "./runway";
import type { Job } from "@prisma/client";

export type VideoPayload = { prompt: string; duration: 5 | 10; ratio: "720:1280" | "1280:720"; cost: number; model: string; campaignId?: string; contentItemId?: string; assetId?: string; taskId?: string };
export function videoSummary(job: Job) {
  const payload = job.payload as unknown as VideoPayload;
  return { id: job.id, status: job.status, progress: job.progress, error: job.error, prompt: payload.prompt,
    duration: payload.duration, cost: payload.cost, createdAt: job.createdAt,
    videoUrl: job.status === "succeeded" ? `/api/video/file?jobId=${job.id}` : null };
}
export async function failVideo(job: Job, error: string) {
  const p = job.payload as unknown as VideoPayload;
  await prisma.$transaction(async tx => {
    const claim = await tx.job.updateMany({ where: { id: job.id, organizationId: job.organizationId, status: { in: ["starting", "running", "saving", "uncertain"] } }, data: { status: "failed", error, progress: 100 } });
    if (!claim.count) return;
    const sub = await tx.subscription.update({ where: { organizationId: job.organizationId }, data: { credits: { increment: p.cost } } });
    await tx.creditLedger.create({ data: { organizationId: job.organizationId, delta: p.cost, balanceAfter: sub.credits, reason: "video_scene_refund", referenceId: job.id } });
  });
}
export async function refreshVideo(job: Job) {
  const p = job.payload as unknown as VideoPayload;
  if (!p.taskId || !["running", "saving"].includes(job.status)) return job;
  // Claim a short polling lease. Reopening Studio never submits another generation.
  const claim = await prisma.job.updateMany({ where: { id: job.id, status: { in: ["running", "saving"] }, updatedAt: { lt: new Date(Date.now() - 15000) } }, data: { updatedAt: new Date() } });
  if (!claim.count) return job;
  try {
    const task = await getVideoTask(p.taskId);
    if (["FAILED", "CANCELED"].includes(task.status)) {
      await failVideo(job, "Runway could not generate this video. Your Rumi credits were returned.");
    } else if (task.status === "SUCCEEDED") {
      const output = new URL(task.output?.[0] || "");
      if (output.protocol !== "https:" || ![".cloudfront.net", ".amazonaws.com", ".runwayml.com", ".runway.com"].some(host => output.hostname.endsWith(host))) throw new Error("Invalid output host.");
      await prisma.job.updateMany({ where: { id: job.id, status: { in: ["running", "saving"] } }, data: { status: "saving", progress: 95 } });
      const response = await fetch(output, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000) });
      if (!response.ok || !response.body || Number(response.headers.get("content-length")) > 100_000_000) throw new Error("Video download unavailable.");
      let size = 0;
      const bounded = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
        size += chunk.byteLength;
        if (size > 100_000_000) throw new Error("Video exceeds storage limit.");
        controller.enqueue(chunk);
      } }));
      // Deterministic private pathname lets a storage retry reuse the same generation.
      const pathname = `runway/${job.organizationId}/${job.id}.mp4`;
      await put(pathname, bounded, { access: "private", contentType: "video/mp4", addRandomSuffix: false, allowOverwrite: true, multipart: true, abortSignal: AbortSignal.timeout(30000) });
      await prisma.$transaction(async tx => {
        const done = await tx.job.updateMany({ where: { id: job.id, status: { in: ["running", "saving"] } }, data: { status: "succeeded", progress: 100, error: null, result: { pathname } } });
        if (done.count) await tx.mediaAsset.upsert({ where: { id: job.id }, update: {}, create: {
          id: job.id, organizationId: job.organizationId, campaignId: p.campaignId, contentItemId: p.contentItemId, kind: p.contentItemId ? "campaign_video" : "ai_video", provider: "runway", status: "ready",
          url: `/api/video/file?jobId=${job.id}`, prompt: p.prompt, metadata: { pathname, duration: p.duration, model: p.model, taskId: p.taskId },
        } });
      });
      console.log("RUNWAY_VIDEO_READY", JSON.stringify({ jobId: job.id, taskId: p.taskId }));
    } else {
      await prisma.job.updateMany({ where: { id: job.id, status: "running" }, data: { progress: Math.max(job.progress, Math.min(90, Math.round((task.progress || 0) * 90))), error: null } });
    }
  } catch {
    // Network/storage failures remain retryable; never restart the paid generation.
    await prisma.job.updateMany({ where: { id: job.id, status: { in: ["running", "saving"] } }, data: { error: "Checking or saving the video is delayed. Rumi will retry the same video." } });
  }
  return await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
}
