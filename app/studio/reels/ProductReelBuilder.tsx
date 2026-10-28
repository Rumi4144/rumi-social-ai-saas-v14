"use client";
import { useEffect, useRef, useState } from "react";
import type { ProductReelView } from "@/lib/reels/product-video-plan";
import styles from "./ReelEditor.module.css";

export default function ProductReelBuilder({ campaignId, contentItemId, disabled, onBusy, onReady }: {
  campaignId: string; contentItemId: string; disabled: boolean; onBusy: (busy: boolean) => void; onReady: (job: ProductReelView) => void;
}) {
  const [url, setUrl] = useState(""), [job, setJob] = useState<ProductReelView | null>(null);
  const [working, setWorking] = useState(false), [checking, setChecking] = useState(false), [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const requestId = useRef<string | undefined>(undefined), applyWhenReady = useRef(false);
  const alive = useRef(true), ready = useRef(onReady); ready.current = onReady;
  const abort = useRef<AbortController | undefined>(undefined);
  const checkAbort = useRef<AbortController | undefined>(undefined);
  function accept(next: ProductReelView | null) {
    if (!alive.current) return;
    if (next && (next.campaignId !== campaignId || next.contentItemId !== contentItemId)) throw new Error("This reel belongs to another post. Reopen your selected post.");
    setJob(next);
    if (next) { requestId.current = next.id; setUrl(next.sourceUrl); }
    if (next?.status === "ready" && applyWhenReady.current) {
      applyWhenReady.current = false; ready.current(next);
      setMessage("Your three moving scenes are ready below, with music and small captions. Preview the reel, then export it.");
    }
  }
  async function check(id?: string) {
    if (checking) return;
    const active = new AbortController(); checkAbort.current?.abort(); checkAbort.current = active;
    setChecking(true);
    try {
      const query = id ? `jobId=${encodeURIComponent(id)}` : `campaignId=${encodeURIComponent(campaignId)}&contentItemId=${encodeURIComponent(contentItemId)}`;
      const response = await fetch(`/api/reels/product-video?${query}`, { signal: active.signal });
      const data = await response.json();
      if (active.signal.aborted || !alive.current) return;
      if (!response.ok) throw new Error(data.error || "Could not check the product reel.");
      accept(data.job);
    } catch (error) { if (!active.signal.aborted && alive.current) setMessage(error instanceof Error ? error.message : "Status is delayed. Check again; your reel will not be restarted."); }
    finally { if (checkAbort.current === active && alive.current) setChecking(false); }
  }
  useEffect(() => {
    alive.current = true; void check();
    return () => { alive.current = false; abort.current?.abort(); checkAbort.current?.abort(); };
    // This component is remounted for every workspace, campaign or post change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!job || !["running", "attention"].includes(job.status) || working || checking) return;
    const timer = setTimeout(() => void check(job.id), 18000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, working, checking]);

  async function prepare() {
    if (working || disabled || checking) return;
    const active = new AbortController(); abort.current = active;
    const timer = setTimeout(() => active.abort(), 55000);
    setWorking(true); onBusy(true); setConsent(false); setMessage("Reading this product’s website photos…");
    // Keep this identifier after an uncertain response so a retry recovers the
    // same plan instead of silently creating another request.
    requestId.current ||= crypto.randomUUID();
    const planId = requestId.current;
    try {
      const response = await fetch("/api/reels/photos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId, contentItemId, ...(url.trim() ? { url: url.trim() } : {}) }), signal: active.signal });
      const photos = await response.json();
      if (!response.ok) throw new Error(photos.error || "Could not read this product page.");
      const planned = await fetch("/api/reels/product-video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "plan", requestId: planId, campaignId, contentItemId, assetIds: photos.sources.map((source: { id: string }) => source.id) }), signal: active.signal });
      const data = await planned.json();
      if (!planned.ok) throw new Error(data.error || "Could not prepare the shots.");
      if (!alive.current || active.signal.aborted) return;
      accept(data.job); setMessage(photos.notice || "Product found. Review the photos and generation cost below.");
    } catch (error) { if (alive.current) setMessage(active.signal.aborted ? "Preparing took too long. Check saved status before trying again." : error instanceof Error ? error.message : "Could not prepare this reel."); }
    finally { clearTimeout(timer); if (alive.current) { setWorking(false); onBusy(false); } }
  }
  async function generate() {
    if (!job || working || disabled || checking || !consent) return;
    const active = new AbortController(); abort.current = active;
    const timer = setTimeout(() => active.abort(), 65000);
    setWorking(true); onBusy(true); applyWhenReady.current = true; setMessage("Creating three moving product scenes…");
    try {
      const response = await fetch("/api/reels/product-video", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start", requestId: job.id, campaignId, contentItemId, consent: true, expectedCost: job.cost }), signal: active.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start the reel. Check status before trying again.");
      if (!alive.current || active.signal.aborted) return;
      accept(data.job); setMessage("Your moving scenes are being created. You can return to this post later and check their saved status.");
    } catch (error) { if (alive.current) setMessage(active.signal.aborted ? "Starting took too long to confirm. Check saved status; the same request will be recovered." : error instanceof Error ? error.message : "Check saved status before trying again."); }
    finally { clearTimeout(timer); if (alive.current) { setWorking(false); onBusy(false); } }
  }
  const canStart = job && (job.status === "draft" || job.shots.some(shot => shot.status === "queued"));
  return <section className={`card ${styles.productBuilder}`} aria-label="Create a moving product reel">
    <h2>Create a moving reel from your product website</h2>
    <p>Use the product photos already on your website. We create three different moving shots and arrange a 15-second reel with full-screen pictures, music and small captions.</p>
    {!job && <><label htmlFor="product-reel-url">Product website link<input id="product-reel-url" type="url" value={url} disabled={working || disabled || checking} placeholder="https://your-website.com/product/…" onChange={event => { setUrl(event.target.value); requestId.current = undefined; }} /></label>
      <p className={styles.hint}>Leave blank to use the product link in this post. No uploaded video is required.</p>
      <button type="button" disabled={working || disabled || checking} onClick={() => void prepare()}>{working ? "Reading product…" : "Find product photos and plan reel"}</button></>}
    {job && <>
      <h3>{job.productName}</h3><p><a href={job.sourceUrl} target="_blank" rel="noreferrer">View product page</a></p>
      <div className={styles.productShots}>{job.shots.map((shot, index) => <article key={shot.id}>
        <img src={shot.imageUrl} alt={`Website reference for ${shot.label.toLowerCase()}`} />
        <strong>{index + 1}. {shot.label}</strong><p>5 seconds · {shot.status === "planned" ? "Ready to create" : shot.status}</p>
        {shot.error && <p>{shot.error}</p>}
        {shot.status === "succeeded" && <a href={`/api/video/file?jobId=${encodeURIComponent(shot.id)}&download=1`}>Download scene</a>}
      </article>)}</div>
      {canStart && <>
        <p><strong>{job.cost} Rumi credits total</strong> · 3 generated video scenes. Reusing a saved request does not charge again. Failed scene credits are returned.</p>
        <p className={styles.hint}>AI creates movement from the website photos. Check the finished product’s shape and details before using the reel.</p>
        {!job.configured && <p>Runway and private video storage need to be connected by your administrator before generation.</p>}
        <label><input type="checkbox" checked={consent} disabled={working || disabled} onChange={event => setConsent(event.target.checked)} /> {job.status === "draft" ? `Create this reel for ${job.cost} Rumi credits` : "Continue this saved reel using its existing credit reservation"}</label>
        <button type="button" disabled={working || disabled || checking || !consent || !job.configured} onClick={() => void generate()}>{working ? "Starting scenes…" : job.status === "draft" ? "Create moving product reel" : "Continue queued scenes"}</button>
      </>}
      {job.status === "ready" && <button type="button" disabled={disabled || working || checking} onClick={() => ready.current(job)}>Open reel with music</button>}
      {job.error && <p role="status">{job.error}</p>}
      {job.status !== "draft" && job.status !== "ready" && <p>Your request is saved. Keep this page open for automatic checks, or return to this post later.</p>}
      {["draft", "ready", "partial"].includes(job.status) && <button type="button" disabled={working || disabled || checking} onClick={() => { checkAbort.current?.abort(); applyWhenReady.current = false; setJob(null); setConsent(false); setMessage(""); requestId.current = undefined; }}>Plan another product reel</button>}
    </>}
    <button type="button" disabled={checking || working || disabled} onClick={() => void check(job?.id || requestId.current)}>{checking ? "Checking…" : "Check saved status"}</button>
    <p role="status">{message}</p>
  </section>;
}
