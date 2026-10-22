"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./lab.module.css";

type Model = { id: "flux" | "infinitetalk"; name: string; provider: string; model: string; kind: "image" | "video"; configured: boolean; estimateUsd: number; source: string };
type Sample = { id: string; status: string; model: Model["id"]; kind: Model["kind"]; prompt: string; estimateUsd: number; error: string | null; createdAt: string; url: string | null };
type Lab = { organizationId: string; dailyLimitUsd: number; models: Model[]; jobs: Sample[] };
type Quote = { quoteId: string; estimateUsd: number; expiresAt: string };
const money = (amount: number) => "$" + amount.toFixed(3).replace(/0$/, "");
const statuses: Record<string,string> = { starting: "Starting", running: "Generating", saving: "Saving", succeeded: "Ready", failed: "Failed", uncertain: "Needs account check" };
async function request(path: string, body?: object) {
  const response = await fetch(path, { method: body ? "POST" : "GET", cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not complete this request.");
  return result;
}
export default function TestLab({ workspaceName }: { workspaceName: string }) {
  const [lab, setLab] = useState<Lab | null>(null), [model, setModel] = useState<Model["id"]>("flux");
  const [prompt, setPrompt] = useState(""), [quote, setQuote] = useState<Quote | null>(null);
  const [image, setImage] = useState<{ id: string; name: string } | null>(null), [audio, setAudio] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [acknowledge, setAcknowledge] = useState(false);
  const [compare, setCompare] = useState<string[]>([]);
  const requestId = useRef("");
  const pending = useRef(false);
  const invalidate = () => { setQuote(null); setAcknowledge(false); requestId.current = ""; };
  const reload = async () => { const data = await request("/api/ai-lab"); setLab(data); return data as Lab; };
  useEffect(() => { reload().catch(error => setMessage(error.message)); }, []);
  useEffect(() => {
    if (!lab?.jobs.some(j => ["running", "saving"].includes(j.status))) return;
    const interval = setInterval(async () => {
      if (pending.current) return; pending.current = true;
      try {
        for (const job of lab.jobs.filter(j => ["running", "saving"].includes(j.status))) await request("/api/ai-lab", { action: "refresh", organizationId: lab.organizationId, jobId: job.id });
        await reload();
      } catch (error) { setMessage((error as Error).message); }
      finally { pending.current = false; }
    }, 15000);
    return () => clearInterval(interval);
  }, [lab]);
  const selected = lab?.models.find(m => m.id === model);
  const active = lab?.jobs.some(j => ["starting", "running", "saving", "uncertain"].includes(j.status));
  async function upload(file: File, kind: "image" | "audio") {
    if (!lab) return;
    invalidate(); setBusy(true); setMessage(`Uploading ${kind === "image" ? "presenter photo" : "voice recording"}…`);
    try {
      if (file.size > 10_000_000) throw new Error("Choose a file under 10 MB.");
      const extension = file.name.split(".").pop()?.toLowerCase();
      const type = file.type || ({ mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg" } as Record<string,string>)[extension || ""];
      const ticket = await request("/api/ai-lab/upload", { action: "prepare", organizationId: lab.organizationId, filename: file.name.replace(/[^\w .()-]/g, "_"), size: file.size, contentType: type });
      const sent = await fetch(ticket.upload.url, { method: "PUT", headers: ticket.upload.headers, body: file, credentials: "omit", redirect: "error" });
      if (!sent.ok) throw new Error("Upload did not finish. Choose the file again.");
      await request("/api/ai-lab/upload", { action: "complete", organizationId: lab.organizationId, assetId: ticket.assetId });
      (kind === "image" ? setImage : setAudio)({ id: ticket.assetId, name: file.name });
      setMessage("Upload ready. No video generation has started.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function estimate() {
    if (!lab) return; setBusy(true); setMessage(""); invalidate();
    try {
      const result = await request("/api/ai-lab", { action: "quote", organizationId: lab.organizationId, input: { model, prompt, ...(model === "infinitetalk" ? { imageAssetId: image?.id, audioAssetId: audio?.id } : {}) } });
      setQuote(result); requestId.current = crypto.randomUUID();
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function generate() {
    if (!lab || !quote || !acknowledge || !requestId.current) return;
    setBusy(true); setMessage("");
    try {
      const result = await request("/api/ai-lab", { action: "generate", organizationId: lab.organizationId, quoteId: quote.quoteId, requestId: requestId.current, acknowledge: true });
      invalidate(); setMessage(result.job.status === "uncertain" ? result.job.error : "Sample started. It will appear below; you can leave and return to check it.");
      await reload();
    } catch (error) { setMessage((error as Error).message + " Reload the history before trying again; use the same button to recover this request."); }
    finally { setBusy(false); }
  }
  async function check(job: Sample) {
    if (!lab) return; setBusy(true);
    try { await request("/api/ai-lab", { action: "refresh", organizationId: lab.organizationId, jobId: job.id }); await reload(); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <div className={styles.lab}>
    <header className={styles.header}><div><span className={styles.eyebrow}>YOUR CREATIVE WORKBENCH</span><h1>AI Test Lab</h1><p>Try a small sample. Compare the results. Find what works for {workspaceName}.</p></div><span className={styles.badge}>Experimental</span></header>
    <div className={styles.notice}>Tests stay separate from your campaigns. Each generation uses the provider’s paid balance. Nothing publishes automatically.</div>
    <div className={styles.grid}>
      <section className={styles.panel} aria-label="Create a test sample">
        <h2>1. Choose your test</h2>
        <div className={styles.models}>{(lab?.models || []).map(item => <button key={item.id} type="button" className={`${styles.model} ${item.id === model ? styles.selected : ""}`} aria-pressed={item.id === model} disabled={busy} onClick={() => { setModel(item.id); setPrompt(""); invalidate(); setMessage(""); }}><strong>{item.kind === "image" ? "Image ad" : "Talking presenter"}</strong><span>{item.provider} · {item.name}</span><small>{item.configured ? "Ready to test" : "Account setup needed"}</small></button>)}</div>
        {!lab && !message && <p>Loading your workspace…</p>}
        {selected && !selected.configured && <div className={styles.setup}><strong>Connect this provider first</strong><p>Your administrator needs to add this provider’s API key and enable private sample storage. A website subscription alone does not connect the API.</p><details><summary>Administrator setup</summary><p>Add <code>{model === "flux" ? "BFL_API_KEY" : "WAVESPEED_API_KEY"}</code> and <code>BLOB_READ_WRITE_TOKEN</code> in the hosting settings. Never paste keys into this page or a prompt.</p></details></div>}
        {model === "infinitetalk" && <div className={styles.uploads}><h2>2. Choose your presenter and voice</h2><p>Use a photo and a recording you have permission to use. The recording supplies the spoken words; this test does not buy an extra AI voice.</p><label>Presenter photo<input aria-label="Presenter photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !selected?.configured} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file, "image"); }}/><small>{image?.name || "JPEG, PNG or WebP · up to 10 MB"}</small></label><label>Voice recording<input aria-label="Voice recording" type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/webm,.m4a" disabled={busy || !selected?.configured} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file, "audio"); }}/><small>{audio?.name || "MP3, WAV, M4A, Ogg or WebM · up to 10 MB"}</small></label></div>}
        <h2>{model === "flux" ? "2" : "3"}. Describe the sample</h2><label htmlFor="lab-prompt">{model === "flux" ? "Image instructions" : "Delivery and setting"}</label><textarea id="lab-prompt" value={prompt} maxLength={2000} rows={6} disabled={busy} onChange={e => { setPrompt(e.target.value); invalidate(); }} placeholder={model === "flux" ? "Describe the person, setting, colors and any exact headline you want to test…" : "Friendly, relaxed delivery with natural expressions. Keep the presenter’s appearance and setting…"}/>
        <p className={styles.hint}>{model === "flux" ? "One portrait image at 1K. Include exact words if you want to test lettering, or request a clean photo to use with your existing ad templates." : "Start with a 10–15 second recording. Output quality and resolution need testing; the Fast model is not promised as HD. Uploaded inputs expire after seven days."}</p>
        <button type="button" className={styles.primary} disabled={busy || !selected?.configured || prompt.trim().length < 10 || (model === "infinitetalk" && (!image || !audio)) || active} onClick={estimate}>Get cost estimate</button>
        {active && <p className={styles.hint}>Finish or reconcile the existing sample before starting another.</p>}
      </section>
      <section className={styles.panel} aria-label="Test cost"><h2>Small tests. Clear costs.</h2><div className={styles.price}>{quote ? money(quote.estimateUsd) : selected ? money(selected.estimateUsd) : "—"}</div><p>{quote ? "Provider estimate for this sample" : model === "flux" ? "Published estimate per image" : "Published estimate for 15 seconds, using your own audio"}</p><p className={styles.hint}>Estimates exclude tax, your existing hosting/storage costs and any new attempts. Provider billing is the final record. No additional Rumi generation credits are deducted in this administrator lab.</p><div className={styles.limits}><strong>Test allowance</strong><span>{money(lab?.dailyLimitUsd || 2)} in reserved estimates per workspace per day, resetting at midnight UTC. One sample at a time. Failed or unconfirmed submissions remain reserved to avoid overspending.</span></div>{quote && <><p>Estimate expires after two minutes.</p><label className={styles.consent}><input type="checkbox" checked={acknowledge} disabled={busy} onChange={e => setAcknowledge(e.target.checked)}/><span>I understand this starts one paid provider generation.</span></label><button type="button" className={styles.primary} disabled={busy || !acknowledge} onClick={generate}>{busy ? "Working…" : "Generate one sample"}</button></>}{selected && <a className={styles.source} href={selected.source} target="_blank" rel="noreferrer">View provider details ↗</a>}</section>
    </div>
    {message && <div role="status" className={styles.message}>{message}</div>}
    <section className={styles.history}><div className={styles.sectionTitle}><div><h2>Sample history</h2><p>Keep up to two results selected for comparison. Refreshing history never starts a new generation.</p></div><button type="button" disabled={busy} onClick={() => { setBusy(true); reload().catch(error => setMessage(error.message)).finally(() => setBusy(false)); }}>Refresh history</button></div>
      {!lab?.jobs.length && <div className={styles.empty}>Your test samples will appear here, with their model and estimated cost.</div>}
      <div className={styles.results}>{(lab?.jobs || []).filter(job => compare.length < 2 || compare.includes(job.id)).map(job => <article key={job.id} className={styles.sample}><div className={styles.sampleHead}><strong>{job.kind === "image" ? "FLUX image" : "InfiniteTalk Fast"}</strong><span>{statuses[job.status] || job.status}</span></div>{job.url ? job.kind === "image" ? <img src={job.url} alt={job.prompt} /> : <video src={job.url} controls preload="metadata"/> : <div className={styles.placeholder}>{job.status === "uncertain" ? "Check the provider account before generating again." : job.status === "failed" ? "This sample could not be completed." : "Your sample is being prepared."}</div>}<p>{job.prompt}</p><small>Estimated {money(job.estimateUsd)} · {new Date(job.createdAt).toLocaleString()}</small>{job.error && <p className={styles.hint}>{job.error}</p>}<div className={styles.sampleActions}>{job.url && <><a href={job.url + "&download=1"}>Download</a><label><input type="checkbox" checked={compare.includes(job.id)} onChange={e => setCompare(current => e.target.checked ? [...current, job.id].slice(-2) : current.filter(id => id !== job.id))}/>Compare</label></>}{["running", "saving"].includes(job.status) && <button disabled={busy} onClick={() => check(job)}>Check progress</button>}</div></article>)}</div>{compare.length > 0 && <button type="button" onClick={() => setCompare([])}>Show all samples</button>}
    </section>
  </div>;
}
