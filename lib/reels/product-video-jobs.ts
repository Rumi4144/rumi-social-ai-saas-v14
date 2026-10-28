import { prisma } from "@/lib/prisma";
import { createVideoTask, RunwayError, runwayConfigured } from "@/lib/video/runway";
import { failVideo, refreshVideo, type VideoPayload } from "@/lib/video/jobs";
import { fetchPublicBytes } from "./public-fetch";
import { PRODUCT_REEL_COST, PRODUCT_REEL_SCENE_COST, productReelProject, type ProductReelPlan, type ProductReelView } from "./product-video-plan";
import type { Job } from "@prisma/client";

type ScenePayload = VideoPayload & { mode: "product_reel_scene"; parentId: string; imageUrl: string; sourceUrl: string; productName: string };

/** A persisted child claim must precede every paid call. Starting/uncertain jobs
 * are never resubmitted: a timeout can mean that Runway accepted the request. */
export async function startProductScene(job: Job) {
  if (job.status !== "queued") return;
  const claim = await prisma.job.updateMany({ where: { id: job.id, organizationId: job.organizationId, status: "queued" }, data: { status: "starting" } });
  if (!claim.count) return;
  const p = job.payload as unknown as ScenePayload;
  let imageUrl: string;
  try {
    const photo = await fetchPublicBytes(p.imageUrl, 2_000_000);
    const type = photo.contentType.split(";")[0].trim().toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(type) || !photo.bytes.length) throw new Error("Unsupported reference image.");
    imageUrl = `data:${type};base64,${photo.bytes.toString("base64")}`;
  } catch {
    await failVideo(job, "This website photo could not be loaded for video generation. This scene’s Rumi credits were returned.");
    return;
  }
  let taskId: string | undefined;
  try {
    const task = await createVideoTask({ imageUrl, prompt: p.prompt, duration: 5, ratio: p.ratio, model: p.model });
    taskId = task.id;
    // Log only the recovery identifiers, never reference pixels or credentials.
    console.log("PRODUCT_REEL_TASK_CREATED", JSON.stringify({ jobId: job.id, taskId }));
    await prisma.job.update({ where: { id: job.id }, data: { status: "running", progress: 1, payload: { ...p, taskId } } });
  } catch (error) {
    if (taskId) await prisma.job.update({ where: { id: job.id }, data: { status: "running", payload: { ...p, taskId }, error: "Scene confirmed; saving its details was delayed." } });
    else if (error instanceof RunwayError && error.status < 500) await failVideo(job, `${error.message} This scene’s Rumi credits were returned.`);
    else await prisma.job.update({ where: { id: job.id }, data: { status: "uncertain", error: "This scene was not confirmed. Check its status or contact support; it will not be generated again automatically." } });
  }
}

export function productScenePayload(plan: ProductReelPlan, parentId: string, index: number, model: string): ScenePayload {
  const shot = plan.shots[index];
  return { mode: "product_reel_scene", parentId, imageUrl: shot.imageUrl, sourceUrl: plan.sourceUrl, productName: plan.productName,
    prompt: shot.prompt, duration: 5, ratio: "720:1280", model, cost: PRODUCT_REEL_SCENE_COST, campaignId: plan.campaignId, contentItemId: plan.contentItemId, assetId: shot.assetId };
}

export async function productReelView(job: Job, refresh = false): Promise<ProductReelView> {
  const plan = job.payload as unknown as ProductReelPlan;
  const saved = job.result as { sceneIds?: string[] } | null;
  const sceneIds = saved?.sceneIds || [];
  const found = sceneIds.length ? await prisma.job.findMany({ where: { id: { in: sceneIds }, organizationId: job.organizationId, type: "RUNWAY_VIDEO" } }) : [];
  const ordered = sceneIds.map(id => found.find(child => child.id === id));
  const children = await Promise.all(ordered.map(child => child && refresh ? refreshVideo(child) : child));
  const allReady = children.length === 3 && children.every(child => child?.status === "succeeded");
  const failed = children.some(child => child?.status === "failed");
  const missingScene = sceneIds.length > 0 && children.some(child => !child);
  const needsAttention = missingScene || children.some(child => child && ["uncertain", "starting"].includes(child.status));
  const status = allReady ? "ready" : failed ? "partial" : needsAttention ? "attention" : job.status;
  const view: ProductReelView = { id: job.id, campaignId: plan.campaignId, contentItemId: plan.contentItemId, productName: plan.productName, sourceUrl: plan.sourceUrl,
    status, error: failed ? "Some scenes failed. Completed scenes are saved below; failed scene credits were returned. A complete reel needs all three moving scenes." : needsAttention ? "A scene is still starting or needs attention. Check status; do not start another reel for the same request." : job.error,
    progress: children.length ? Math.round(children.reduce((sum, child) => sum + (child?.progress || 0), 0) / 3) : 0,
    cost: PRODUCT_REEL_COST, configured: runwayConfigured(),
    shots: plan.shots.map((shot, index) => ({ id: sceneIds[index] || shot.id, label: shot.label, caption: shot.caption,
      imageUrl: `/api/reels/media?assetId=${encodeURIComponent(shot.assetId)}`, status: children[index]?.status || (sceneIds.length ? "unavailable" : "planned"), error: children[index]?.error || null })),
  };
  if (allReady) Object.assign(view, productReelProject(plan, sceneIds));
  return view;
}
