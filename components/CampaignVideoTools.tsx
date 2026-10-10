"use client";
import { useState } from "react";

export default function CampaignVideoTools({ campaignId, contentItemId, sourceAssetId, pendingJobId }: { campaignId: string; contentItemId: string; sourceAssetId?: string; pendingJobId?: string }) {
  const [prompt, setPrompt] = useState("Slow, natural camera movement around the existing subject. Keep the scene and product faithful to the source image.");
  const [duration, setDuration] = useState<5 | 10>(5);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState(pendingJobId);
  const [requestKey, setRequestKey] = useState<string>();

  async function processVideo(id: string) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const res = await fetch(`/api/video/queue?jobId=${encodeURIComponent(id)}`);
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Video processing interrupted. Resume to check the same video.");
      if (result.job?.id === id && result.job.status === "succeeded") { window.location.reload(); return; }
      if (["failed", "uncertain"].includes(result.job?.status)) throw new Error(result.job.error || "Video needs attention. Check Video Studio.");
      setStatus("Your video is processing. You can resume checking without buying another video.");
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    setStatus("Still processing. Use Resume video to check its progress.");
  }

  async function generate() {
    setBusy(true);
    try {
      let id = jobId;
      if (!id) {
        const key = requestKey || crypto.randomUUID(); setRequestKey(key);
        const res = await fetch("/api/video/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId, contentItemId, assetId: sourceAssetId, prompt, duration, requestId: key, consent: true }) });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Could not start video.");
        id = result.job.id; setJobId(id);
      }
      await processVideo(id!);
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not generate video."); }
    finally { setBusy(false); }
  }

  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024 || !["video/mp4", "video/webm"].includes(file.type)) { setStatus("Choose an MP4 or WebM clip up to 3 MB."); return; }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read clip.")); reader.readAsDataURL(file); });
      const res = await fetch("/api/video/attach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId, contentItemId, dataUrl }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Could not attach clip.");
      window.location.reload();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Could not attach clip."); }
    finally { setBusy(false); }
  }

  return <details style={{ marginTop: 16 }}><summary>Add a video to this post</summary>
    <p>Attach a real clip or make a short AI video from this post’s source image. Review the clip, then choose Use video for this post to publish or schedule it on Facebook, or upload it to YouTube. Instagram video posting is available by downloading the clip.</p>
    <label>Real clip · MP4 / WebM, up to 3 MB · no AI credits<input type="file" accept="video/mp4,video/webm" disabled={busy} onChange={event => upload(event.target.files?.[0])} /></label>
    {sourceAssetId && <><label>AI video motion<textarea value={prompt} maxLength={800} disabled={busy || !!jobId} onChange={event => setPrompt(event.target.value)} /></label>
      <label>Length<select value={duration} disabled={busy || !!jobId} onChange={event => setDuration(Number(event.target.value) as 5 | 10)}><option value={5}>5 seconds · 40 credits</option><option value={10}>10 seconds · 80 credits</option></select></label>
      <button type="button" onClick={generate} disabled={busy || prompt.trim().length < 10}>{busy ? "Processing…" : jobId ? "Resume video" : `Generate AI video · ${duration === 10 ? 80 : 40} credits charged upfront`}</button>
      <p>AI video adds motion to the existing scene; it does not record real performances or customer audio. Generated clips are saved in your private video library.</p>
    </>}
    {status && <p role="status">{status}</p>}
  </details>;
}
