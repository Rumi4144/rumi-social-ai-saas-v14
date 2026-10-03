"use client";
import { useEffect, useRef, useState } from "react";
type Video = { id: string; status: string; progress: number; error: string | null; prompt: string; duration: number; cost: number; videoUrl: string | null };
type Image = { id: string; kind: string; prompt: string | null };
const active = (job: Video) => ["starting", "running", "saving"].includes(job.status);
export default function RunwayVideo() {
  const [configured, setConfigured] = useState(false), [credits, setCredits] = useState(0);
  const [images, setImages] = useState<Image[]>([]), [jobs, setJobs] = useState<Video[]>([]);
  const [assetId, setAssetId] = useState(""), [imageUrl, setImageUrl] = useState("");
  const [source, setSource] = useState("url"), [duration, setDuration] = useState(5), [ratio, setRatio] = useState("720:1280");
  const [prompt, setPrompt] = useState("Slow cinematic camera movement, premium studio lighting, subtle parallax, preserve the product accurately.");
  const [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const requestId = useRef<string | null>(null);
  const cost = duration === 10 ? 80 : 40;
  const load = async () => {
    const res = await fetch("/api/video/queue", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load video studio.");
    setConfigured(data.configured); setCredits(data.credits); setImages(data.images); setJobs(data.jobs);
  };
  useEffect(() => { load().catch(error => setMessage(error.message)); }, []);
  useEffect(() => {
    if (!jobs.some(active)) return;
    const timer = setTimeout(async () => {
      try {
        for (const job of jobs.filter(active)) {
          const res = await fetch(`/api/video/queue?jobId=${job.id}`, { cache: "no-store" });
          if (!res.ok) throw new Error("Could not check video progress. Use Refresh status.");
        }
        await load();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Check progress again."); }
    }, 16000);
    return () => clearTimeout(timer);
  }, [jobs]);
  const generate = async () => {
    if (busy) return;
    setBusy(true); setMessage("");
    requestId.current ||= crypto.randomUUID();
    try {
      const res = await fetch("/api/video/queue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        requestId: requestId.current, ...(source === "library" ? { assetId } : { imageUrl }), prompt, duration, ratio, consent,
      }) });
      const data = await res.json();
      if (data.job) {
        setJobs(old => [data.job, ...old.filter(job => job.id !== data.job.id)]);
        requestId.current = null; setConsent(false);
        setMessage(data.job.error || "Your video is generating. You can return to Studio to check progress.");
        await load();
      } else throw new Error(data.error || "Could not confirm generation. Retry checks the same request.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not confirm generation. Retry checks the same request."); }
    finally { setBusy(false); }
  };
  const uncertain = jobs.some(job => job.status === "uncertain" || job.status === "starting");
  return <section className="card" style={{ marginTop: 28 }}>
    <div className="eyebrow">AI VIDEO</div><h2>Bring your product image to life.</h2>
    <p><a href="https://runwayml.com" target="_blank" rel="noreferrer">Powered by Runway</a> · Choose an opening image and describe the motion.</p>
    {!configured && <p role="status">Runway setup is pending. An administrator needs to connect the Runway developer account and private video storage.</p>}
    <div style={{ display: "grid", gap: 14, maxWidth: 680 }}>
      <label>Opening image<select value={source} disabled={busy} onChange={e => { setSource(e.target.value); setImageUrl(""); setAssetId(""); setConsent(false); }}>
        <option value="url">Image URL</option><option value="file">Upload image</option><option value="library">Saved Rumi image</option>
      </select></label>
      {source === "url" && <label>Public image URL<input type="url" placeholder="https://your-site.com/product.jpg" value={imageUrl} disabled={busy} onChange={e => { setImageUrl(e.target.value); setConsent(false); }} /></label>}
      {source === "file" && <label>PNG, JPEG or WebP · up to 2 MB<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async e => {
        const file = e.target.files?.[0]; setImageUrl(""); setConsent(false);
        if (!file) return;
        if (file.size > 2_000_000 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setMessage("Choose a PNG, JPEG or WebP image under 2 MB."); return; }
        const reader = new FileReader(); reader.onload = () => setImageUrl(String(reader.result)); reader.readAsDataURL(file);
      }} /></label>}
      {source === "library" && <label>Saved image<select value={assetId} disabled={busy} onChange={e => { setAssetId(e.target.value); setConsent(false); }}>
        <option value="">Choose a saved image</option>{images.map((image, i) => <option key={image.id} value={image.id}>{image.kind === "social_creative" ? "Published creative" : "Campaign image"} {i + 1} — {image.prompt?.slice(0, 65) || image.id.slice(-8)}</option>)}
      </select></label>}
      {source !== "library" && imageUrl && <img src={imageUrl} alt="Selected video opening frame" style={{ maxWidth: 200, maxHeight: 220, objectFit: "contain" }} />}
      <label>Motion prompt<textarea rows={4} maxLength={1000} value={prompt} disabled={busy} onChange={e => { setPrompt(e.target.value); setConsent(false); }} /></label>
      <label>Duration<select value={duration} disabled={busy} onChange={e => { setDuration(Number(e.target.value)); setConsent(false); }}><option value={5}>5 seconds · 40 Rumi credits</option><option value={10}>10 seconds · 80 Rumi credits</option></select></label>
      <label>Video shape<select value={ratio} disabled={busy} onChange={e => { setRatio(e.target.value); setConsent(false); }}><option value="720:1280">Vertical 9:16 · Reels / Shorts</option><option value="1280:720">Landscape 16:9 · YouTube</option></select></label>
      <p>Workspace balance: {credits} Rumi credits. Completed videos are saved privately in your workspace. Generation does not publish them.</p>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10 }}><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} style={{ appearance: "auto", width: 18, height: 18, padding: 0, flex: "0 0 auto" }} />I have permission to use this image and authorize sending it and this prompt to Runway to generate a video for {cost} Rumi credits.</label>
      <button className="button" onClick={generate} disabled={!configured || !consent || busy || uncertain || credits < cost || prompt.trim().length < 10 || !(source === "library" ? assetId : imageUrl)}>{busy ? "Starting video…" : requestId.current ? "Check the same generation request" : `Generate video · ${cost} Rumi credits`}</button>
      {message && <p role="status">{message}</p>}
      <button onClick={() => load().catch(error => setMessage(error.message))}>Refresh status</button>
    </div>
    {jobs.length > 0 && <div style={{ display: "grid", gap: 20, marginTop: 28 }}><h3>Your generated videos</h3>{jobs.map(job => <article key={job.id}>
      <strong>{job.duration} second video · {job.status === "succeeded" ? "Ready" : job.status === "saving" ? "Saving video" : job.status === "running" ? `Generating · ${job.progress}%` : job.status}</strong>
      <p>{job.prompt}</p>{job.error && <p role="status">{job.error}</p>}
      {job.videoUrl && <><video src={job.videoUrl} controls preload="metadata" style={{ maxWidth: "100%", width: 420, maxHeight: 420 }} /><p><a className="button" href={`${job.videoUrl}&download=1`}>Download MP4</a> <a href="/publishing">Open Publishing</a></p></>}
      <small>Request ID: {job.id}</small>
    </article>)}</div>}
  </section>;
}
