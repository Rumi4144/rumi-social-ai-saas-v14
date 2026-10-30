import { upload } from "@vercel/blob/client";
import { exportReel } from "@/lib/reels/export";
import { autoPlanMatches, automaticMusic, type AutoReelPlan } from "@/lib/reels/automatic";
import { reelDuration } from "@/lib/reels/timeline";
import type { WeeklyItem } from "@/lib/weekly/types";
import type { ProductReelView } from "@/lib/reels/product-video-plan";

type Reservation = { requestId: string; reservationId?: string; pathname?: string; uploading?: boolean };
class ReelRequestError extends Error {
  constructor(message: string, readonly restart = false) { super(message); }
}
function uploadDidNotStart(error: unknown) {
  const message = (error as { message?: unknown } | null)?.message;
  // The SDK raises these only while obtaining permission, before sending bytes.
  // An unknown upload failure remains reserved until the original path reconciles.
  return typeof message === "string" && /^Vercel Blob: Failed to\s+retrieve the (?:client token|presigned URL)$/.test(message);
}
async function jsonRequest(url: string, body: unknown, signal?: AbortSignal) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  const data = await response.json();
  if (!response.ok) throw new ReelRequestError(data.error || "Could not finish this reel.", data.restart === true);
  return data;
}

export async function finishWeeklyAIReel({ item, organizationId, audio, signal, progress }: { item: WeeklyItem; organizationId: string; audio: AudioContext; signal: AbortSignal; progress: (percent: number, message: string) => void }) {
  if (item.kind !== "ai_video") throw new Error("Choose an AI video to finish.");
  const storageKey = `rumi-weekly-ai:${organizationId}:${item.id}`;
  let saved: { requestId: string; uploading?: boolean };
  try { saved = JSON.parse(localStorage.getItem(storageKey) || "null") || { requestId: crypto.randomUUID() }; }
  catch { saved = { requestId: crypto.randomUUID() }; }
  const persist = () => localStorage.setItem(storageKey, JSON.stringify(saved)); persist();
  const read = async (query: string) => {
    const response = await fetch(`/api/reels/product-video?${query}`, { signal, cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not check your saved AI video.");
    const job: ProductReelView | null = data.job;
    if (job && (job.campaignId !== item.campaignId || job.contentItemId !== item.id)) throw new Error("This video belongs to a different post.");
    return job;
  };
  progress(0, "Checking your saved AI video request…");
  let job = await read(`campaignId=${encodeURIComponent(item.campaignId)}&contentItemId=${encodeURIComponent(item.id)}`);
  if (!job) {
    progress(0, "Finding this product’s original website photos…");
    const photos = await jsonRequest("/api/reels/photos", { campaignId: item.campaignId, contentItemId: item.id }, signal);
    const planned = await jsonRequest("/api/reels/product-video", { action: "plan", requestId: saved.requestId, campaignId: item.campaignId, contentItemId: item.id, assetIds: photos.sources.map((source: { id: string }) => source.id) }, signal);
    job = planned.job;
  }
  if (!job || job.campaignId !== item.campaignId || job.contentItemId !== item.id) throw new Error("Could not find this post’s video plan.");
  saved.requestId = job.id; persist();
  if (job.status === "draft" || job.shots.some(shot => shot.status === "queued")) {
    if (!job.configured) throw new Error("Admin needs to connect video generation before this video can be finished. No new generation was started.");
    progress(0, "Creating three moving product scenes · 120 Rumi credits…");
    const result = await jsonRequest("/api/reels/product-video", { action: "start", requestId: job.id, campaignId: item.campaignId, contentItemId: item.id, consent: true, expectedCost: 120 }, signal); job = result.job;
  }
  for (let attempt = 0; job && job.status !== "ready" && attempt < 40; attempt++) {
    if (signal.aborted) throw new Error("Video preparation paused. Its existing request is saved; resume to check the same scenes.");
    if (["partial", "attention", "failed"].includes(job.status)) throw new Error(job.error || "This saved video needs Admin attention. A second paid request will not be started automatically.");
    progress(job.progress || 0, "Creating your three moving scenes. Your request is saved and can be resumed.");
    await new Promise(resolve => setTimeout(resolve, 10_000));
    job = await read(`jobId=${encodeURIComponent(job.id)}`);
  }
  if (!job || job.status !== "ready" || !job.project || job.project.scenes.length !== 3) throw new Error("Your moving scenes are still being prepared. Resume shortly to check the same saved request.");
  const pathname = `reels/${organizationId}/${item.id}/${job.id}.mp4`;
  const uploaded = async () => {
    const response = await fetch(`/api/reels/upload?pathname=${encodeURIComponent(pathname)}`, { signal, cache: "no-store" });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not check the video upload."); return data.assetId as string | undefined;
  };
  const complete = async (assetId: string) => { await jsonRequest("/api/weekly/reel-completion", { action: "select-ai", contentItemId: item.id, jobId: job!.id, assetId }, signal); localStorage.removeItem(storageKey); progress(100, "Your finished AI video is saved for review."); };
  const existing = await uploaded(); if (existing) { await complete(existing); return; }
  if (saved.uploading) throw new Error("Your saved upload is still being checked. Resume shortly; no new scenes will be generated.");
  const blob = await exportReel({ project: job.project, canvas: document.createElement("canvas"), audioContext: audio, music: true, musicStyle: job.musicStyle || "ambient", musicVolume: 35, originalAudio: false, signal, progress: percent => progress(percent, "Adding your logo, small captions and music. Keep this tab visible.") });
  if (blob.type !== "video/mp4") throw new Error("Use a recent Chrome or Safari browser to finish this MP4. Your generated scenes are saved.");
  if (signal.aborted) throw new Error("Export paused. Your generated scenes are saved.");
  saved.uploading = true; persist(); progress(98, "Saving your finished AI video…");
  try {
    await upload(pathname, blob, { access: "private", contentType: "video/mp4", multipart: true, handleUploadUrl: "/api/reels/upload", clientPayload: JSON.stringify({ campaignId: item.campaignId, contentItemId: item.id, title: item.headline.slice(0, 160), sceneCount: job.project.scenes.length, duration: reelDuration(job.project), productSubject: job.project.productSubject }) });
  } catch (error) {
    if (uploadDidNotStart(error)) { saved.uploading = false; persist(); throw new Error("The upload could not start. Check your sign-in and resume this reel; your generated scenes are saved."); }
    throw error;
  }
  for (let attempt = 0; attempt < 20; attempt++) { const assetId = await uploaded(); if (assetId) { await complete(assetId); return; } await new Promise(resolve => setTimeout(resolve, 1200)); }
  throw new Error("Your video upload is still being verified. Resume shortly to finish this same video.");
}

/** The caller has shown the complete credit cost and received an explicit click. */
export async function finishWeeklyReel({ item, organizationId, audio, signal, progress }: { item: WeeklyItem; organizationId: string; audio: AudioContext; signal: AbortSignal; progress: (percent: number, message: string) => void }) {
  if (item.kind !== "motion_reel") throw new Error("Choose a motion reel to finish.");
  const storageKey = `rumi-weekly-reel:${organizationId}:${item.id}`;
  let saved: Reservation;
  try { saved = JSON.parse(localStorage.getItem(storageKey) || "null") || { requestId: crypto.randomUUID() }; }
  catch { saved = { requestId: crypto.randomUUID() }; }
  const persist = () => localStorage.setItem(storageKey, JSON.stringify(saved));
  persist();
  const completedUpload = async () => {
    if (!saved.pathname) return null;
    const response = await fetch(`/api/reels/upload?pathname=${encodeURIComponent(saved.pathname)}`, { signal, cache: "no-store" });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not check the saved reel.");
    return result.assetId as string | undefined;
  };
  const complete = async (assetId: string) => {
    await jsonRequest("/api/weekly/reel-completion", { action: "complete", reservationId: saved.reservationId, assetId }, signal);
    localStorage.removeItem(storageKey); progress(100, "Reel saved. Review it before approving.");
  };
  try {
    if (saved.reservationId) { const existing = await completedUpload(); if (existing) { await complete(existing); return; } }
    if (saved.uploading) throw new Error("Your previous upload is still being checked. Refresh shortly, then resume this same reel.");
    progress(0, "Arranging three relevant photos, music and captions…");
    const context = { organizationId, campaignId: item.campaignId, contentItemId: item.id };
    const plan: AutoReelPlan = await jsonRequest("/api/reels/auto-plan", context, signal);
    if (!autoPlanMatches(plan, context)) throw new Error("Your workspace changed. Reopen this week before finishing its reel.");
    if (plan.project.scenes.length < 3 || new Set(plan.sources.map(source => source.src)).size < 3) throw new Error("Admin needs to add three distinct, relevant photos to finish this reel. Use Request changes; no reel credits were charged.");
    const reservation = await jsonRequest("/api/weekly/reel-completion", { action: "reserve", contentItemId: item.id, requestId: saved.requestId, expectedCost: 4, consent: true }, signal);
    saved.reservationId = reservation.reservationId; saved.pathname = reservation.pathname; persist();
    if (reservation.alreadyCompleted && reservation.assetId) { localStorage.removeItem(storageKey); progress(100, "Your reel is already saved."); return; }
    if (!saved.reservationId || !saved.pathname) throw new Error("Could not reserve a safe place for this reel.");
    const existing = await completedUpload(); if (existing) { await complete(existing); return; }
    const blob = await exportReel({ project: plan.project, canvas: document.createElement("canvas"), audioContext: audio, music: true, musicStyle: automaticMusic(plan.brand.name, plan.brand.industry), musicVolume: 35, originalAudio: false, signal, progress: percent => progress(percent, "Creating your reel. Keep this tab visible.") });
    if (blob.type !== "video/mp4") throw new Error("This browser could not create an MP4. Use a recent Chrome or Safari browser to finish the reel.");
    if (signal.aborted) throw new Error("Reel paused.");
    saved.uploading = true; persist(); progress(98, "Saving your finished reel…");
    try {
      await upload(saved.pathname, blob, { access: "private", contentType: "video/mp4", multipart: true, handleUploadUrl: "/api/reels/upload", clientPayload: JSON.stringify({ campaignId: item.campaignId, contentItemId: item.id, title: item.headline.slice(0, 160), sceneCount: plan.project.scenes.length, duration: reelDuration(plan.project), productSubject: plan.project.productSubject }) });
    } catch (error) {
      if (uploadDidNotStart(error)) { saved.uploading = false; persist(); throw new Error("The upload could not start. Check your sign-in and resume this reel."); }
      throw error;
    }
    for (let attempt = 0; attempt < 20; attempt++) {
      if (signal.aborted) throw new Error("Reel paused. Resume to check your saved upload.");
      const assetId = await completedUpload(); if (assetId) { await complete(assetId); return; }
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
    throw new Error("The upload is saved and still being verified. Resume shortly to finish this same reel.");
  } catch (error) {
    // Only the server can confirm that a changed revision was reset/refunded.
    // Drop this item's stale attempt so the next explicit click creates a new ID.
    if (error instanceof ReelRequestError && error.restart) {
      localStorage.removeItem(storageKey);
      throw error;
    }
    // An uncertain upload keeps the same reservation and pathname, preventing a
    // duplicate charge/upload on resume. Before upload, cancellation is refundable.
    if (saved.reservationId && !saved.uploading) {
      try { await jsonRequest("/api/weekly/reel-completion", { action: "cancel", reservationId: saved.reservationId }); localStorage.removeItem(storageKey); }
      catch { /* Keep the reservation so the next resume can reconcile it. */ }
    }
    throw error;
  }
}
