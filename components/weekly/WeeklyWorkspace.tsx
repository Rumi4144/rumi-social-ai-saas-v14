"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { WeeklyItem, WeeklyResponse } from "@/lib/weekly/types";
import { weeklyMixQuote } from "@/lib/billing/packages";
import WeeklyCard from "./WeeklyCard";
import { finishWeeklyReel, finishWeeklyAIReel } from "./finish-reel";
import styles from "./weekly.module.css";

export default function WeeklyWorkspace({ isAdmin = false }: { isAdmin?: boolean }) {
  const [data, setData] = useState<WeeklyResponse | null>(null), [error, setError] = useState("");
  const [brandId, setBrandId] = useState(""), [weekStart, setWeekStart] = useState("");
  const [imagesOnly, setImagesOnly] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""), [progress, setProgress] = useState(0);
  const controller = useRef<AbortController | null>(null), mounted = useRef(true);
  const selection = `${brandId}:${weekStart}`;
  const currentSelection = useRef(selection); currentSelection.current = selection;
  const query = new URLSearchParams(); if (brandId) query.set("brandId", brandId); if (weekStart) query.set("weekStart", weekStart);
  const queryText = query.toString();
  const activeQuery = useRef(queryText); activeQuery.current = queryText;
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/weekly${queryText ? `?${queryText}` : ""}`, { cache: "no-store", signal });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not load your week.");
    if (mounted.current && !signal?.aborted && activeQuery.current === queryText) setData(result); return result as WeeklyResponse;
  }, [queryText]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => {
    const active = new AbortController(); setError(""); setData(null); setMessage("");
    void refresh(active.signal).catch(err => { if (!active.signal.aborted) setError(err.message); });
    return () => active.abort();
  }, [refresh]);
  useEffect(() => {
    if (busy) return;
    const timer = setInterval(() => { if (!document.hidden) void refresh().catch(() => {}); }, 30_000);
    return () => clearInterval(timer);
  }, [busy, refresh]);
  const changed = () => { void refresh().catch(err => setError(err.message)); };
  const mix = data ? imagesOnly ? { images: data.plan.weeklyPosts, motionReels: 0, aiVideos: 0 } : data.prepare.mix : null;
  const quote = mix ? weeklyMixQuote(mix) : null;

  async function run(prepareNew: boolean, single?: WeeklyItem) {
    if (!data || busy || !data.canManage || !mix || !quote) return;
    if (single && !window.confirm(single.kind === "ai_video" ? "Create three moving product scenes, music and captions for 120 Rumi credits? An existing saved request is resumed without a second charge. Review the finished product details before approving." : "Finish this reel with three photos, music and captions for 4 Rumi credits? It will stay a draft for your review.")) return;
    const active = new AbortController(); controller.current = active; setBusy(true); setError(""); setProgress(0);
    const key = selection;
    let audio: AudioContext | undefined;
    try { audio = new AudioContext(); await audio.resume(); } catch { /* Image-only preparation does not require audio. */ }
    const pauseHidden = () => { if (document.hidden) active.abort(); };
    document.addEventListener("visibilitychange", pauseHidden);
    try {
      let latest = data;
      if (prepareNew) {
        const storageKey = `rumi-weekly-pack:${data.organizationId}:${data.brand?.id}:${data.weekStart}`;
        const requestId = localStorage.getItem(storageKey) || crypto.randomUUID(); localStorage.setItem(storageKey, requestId);
        setMessage("Preparing your week's captions and designs…");
        const response = await fetch("/api/weekly", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "prepare", requestId, brandId: data.brand?.id, weekStart: data.weekStart, expectedCredits: quote.preparationCredits, mix }), signal: active.signal });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not prepare this week.");
        latest = await refresh(active.signal);
      }
      if (!single) {
        let stalled = 0;
        while (latest.pack?.nextJobId || latest.pack?.pendingJobs) {
          if (active.signal.aborted) throw new Error("Paused. Finished posts are saved; resume whenever you’re ready.");
          if (latest.pack.nextJobId) {
            const response = await fetch("/api/campaigns/process", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: latest.pack.nextJobId }), signal: active.signal });
            const result = await response.json(); if (!response.ok) throw new Error(result.error || "Some posts need attention. Your completed work is saved.");
            stalled = 0;
          } else {
            if (++stalled > 20) throw new Error("Your preparation is still running. Completed posts are saved; refresh or resume shortly.");
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          latest = await refresh(active.signal);
          const ready = latest.items.filter(item => item.isReady).length;
          setProgress(Math.round(ready / Math.max(latest.plan.weeklyPosts, 1) * 80)); setMessage(`Preparing your week · ${ready} finished posts saved.`);
        }
      }
      const reels = single ? [single] : latest.items.filter(item => ["finish_motion_reel", "finish_ai_video"].includes(item.nextAction) && !item.changeRequest);
      const issues: string[] = [];
      for (const reel of reels) {
        if (active.signal.aborted || currentSelection.current !== key) throw new Error("Paused. Completed posts are saved.");
        if (!audio) { issues.push("Use a recent Chrome or Safari browser to finish your reels."); break; }
        try { await (reel.kind === "ai_video" ? finishWeeklyAIReel : finishWeeklyReel)({ item: reel, organizationId: data.organizationId, audio, signal: active.signal, progress: (value, text) => { setProgress(value); setMessage(text); } }); }
        catch (failure) { if (active.signal.aborted) throw failure; issues.push(`${reel.headline}: ${failure instanceof Error ? failure.message : "Needs Admin attention."}`); }
        latest = await refresh(active.signal);
      }
      latest = await refresh(active.signal);
      if (issues.length) setError(issues.join(" "));
      setProgress(100); setMessage(latest.items.some(item => !item.isReady) ? "Your finished posts are ready to review. The remaining items show what they need below." : "Your week is ready to review. Approve each post, then download, schedule or post it.");
    } catch (failure) { if (mounted.current) setError(active.signal.aborted ? "Paused. Your completed posts are saved. Resume to finish the remaining items." : failure instanceof Error ? failure.message : "Could not finish preparation."); }
    finally { document.removeEventListener("visibilitychange", pauseHidden); await audio?.close().catch(() => {}); controller.current = null; if (mounted.current) { setBusy(false); void refresh().catch(() => {}); } }
  }

  function moveWeek(direction: number) {
    if (!data) return; const date = new Date(`${data.weekStart}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + direction * 7); setWeekStart(date.toISOString().slice(0, 10));
  }

  return <div className={styles.workspace}>
    <header className={styles.header}><div><span className={styles.eyebrow}>{data?.brand?.name || "Your business"}</span><h1>This Week</h1><p>Your ready-made posts, in one place. Review each design, approve it, then download or choose where and when it goes live.</p></div>{isAdmin && <a href="/admin">Return to Admin →</a>}</header>
    {error && <div role="alert" className={styles.failure}>{error}{!data && <div><button onClick={changed}>Try again</button></div>}</div>}
    {!data ? !error && <p role="status">Loading your week…</p> : <>
      <div className={styles.toolbar}>
        {data.brands.length > 1 && <label>Business <select aria-label="Business" value={brandId || data.brand?.id || ""} disabled={busy} onChange={event => setBrandId(event.target.value)}>{data.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select></label>}
        <button disabled={busy} onClick={() => moveWeek(-1)} aria-label="Previous week">←</button><strong>{new Date(`${data.weekStart}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })} – {new Date(`${data.weekEnd}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })}</strong><button disabled={busy} onClick={() => moveWeek(1)} aria-label="Next week">→</button><button disabled={busy} onClick={changed}>Refresh</button><a href="/scheduled">Scheduled & needs attention →</a>
      </div>
      <div className={styles.summary}><div><strong>{data.plan.label}</strong><span>{data.plan.oneTime ? "One seven-day trial pack" : `Up to ${data.plan.weeklyPosts} posts each week`}</span></div><div><strong>{data.items.filter(item => item.isReady && !["approved", "scheduled", "published"].includes(item.status)).length}</strong><span>Ready for approval</span></div><div><strong>{data.items.filter(item => item.needsAttention).length}</strong><span>Need attention</span></div><div><strong>{data.prepare.availableCredits}</strong><span>Rumi credits available</span></div></div>
      {!data.canManage && <p className={styles.notice}>You have read-only access. You can view posts, copy captions and download approved items. Your workspace owner can approve and post.</p>}
      {!data.pack && <section className={styles.empty}><h2>{data.items.length ? "Prepare this week’s pack" : "Your next seven days, prepared for you"}</h2><p>We use your business details, approved designs and product photos to prepare a varied week. You review everything before it goes live.</p>{data.canManage && data.brand && <><label>Post combination <select value={imagesOnly ? "images" : "recommended"} disabled={busy} onChange={event => setImagesOnly(event.target.value === "images")}><option value="recommended">Recommended for this business</option><option value="images">Images only</option></select></label><p><strong>{mix?.images} image posts{mix?.motionReels ? ` · ${mix.motionReels} motion reels` : ""}{mix?.aiVideos ? ` · ${mix.aiVideos} AI videos` : ""}</strong></p><p>{quote?.preparationCredits} credits to prepare{quote?.completionCredits ? ` + ${quote.completionCredits} to finish included videos` : ""}. <strong>{quote?.packCredits} credits total.</strong> Downloads and posting use no extra Rumi credits.</p>{mix?.aiVideos ? <p>AI-generated scenes use verified product photos. Check the product details in each finished video before approving.</p> : null}{data.prepare.warnings.map(warning => <p key={warning} className={styles.notice}>{warning}</p>)}<button className={styles.primary} disabled={busy || !data.prepare.allowed || (quote?.packCredits || 0) > data.prepare.availableCredits} onClick={() => void run(true)}>Prepare my week · {quote?.packCredits} credits</button>{!data.prepare.allowed && <p>{data.prepare.reason}</p>}</>}{!data.brand && <a href="/onboarding">Finish your business setup →</a>}</section>}
      {data.pack && data.canManage && !busy && (data.pack.pendingJobs > 0 || data.items.some(item => ["finish_motion_reel", "finish_ai_video"].includes(item.nextAction))) && <section className={styles.progress}><h2>Finish your week</h2><p>Completed posts are saved. Remaining motion reels cost 4 credits each; new AI videos cost 120 credits each. Existing paid requests are resumed without another charge. Keep this tab visible while videos are created.</p><button className={styles.primary} onClick={() => void run(false)}>Resume remaining posts</button></section>}
      {(busy || message) && <section className={styles.progress} aria-live="polite"><p>{message}</p>{busy && <><progress value={progress} max={100} aria-label="Weekly preparation progress" /><button onClick={() => controller.current?.abort()}>Pause preparation</button></>}</section>}
      {!data.pack && data.items.length > 0 && <section><h2>Previously saved posts</h2><p>These posts keep their original dates. They are separate from the new seven-day pack you can prepare above.</p></section>}
      <div className={styles.grid}>{data.items.map(item => <WeeklyCard key={item.id} item={item} canManage={data.canManage} busy={busy} onChanged={changed} onFinish={item => void run(false, item)} />)}</div>
      {data.pack && !data.items.length && <section className={styles.empty}><h2>{data.pack.status === "complete" ? "All done for this week" : "Your week is being prepared"}</h2><p>{data.pack.status === "complete" ? "Successfully posted items have left your active list. Admin keeps your business’s full history." : data.pack.error || "Your post previews will appear here as they finish."}</p></section>}
      <footer className={styles.plan}><strong>Week {data.weekNumber} of 52</strong> · {data.annualPlan.preparedWeeks} weeks prepared.<br />Your year is planned in weekly packs. New posts are prepared a week at a time; previously posted items remain in your business’s Admin archive.</footer>
    </>}
  </div>;
}
