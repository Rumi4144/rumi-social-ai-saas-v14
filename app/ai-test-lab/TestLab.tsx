"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./lab.module.css";
import { labVoices } from "../../lib/ai-lab/catalog";

type Model = { id: "flux" | "infinitetalk" | "speech"; name: string; provider: string; model: string; kind: "image" | "video" | "audio"; configured: boolean; estimateUsd: number; source: string };
type Sample = { id: string; status: string; model: Model["id"]; kind: Model["kind"]; prompt: string; estimateUsd: number; error: string | null; createdAt: string; url: string | null; campaignId?: string; contentItemId?: string; audioAssetId?: string | null; voiceId?: keyof typeof labVoices };
type Lab = { organizationId: string; dailyLimitUsd: number; models: Model[]; jobs: Sample[] };
type Quote = { quoteId: string; estimateUsd: number; expiresAt: string; purpose: "voice" | "sample" };
const money = (amount: number) => "$" + amount.toFixed(3).replace(/0$/, "");
const statuses: Record<string,string> = { starting: "Starting", running: "Generating", saving: "Saving", succeeded: "Ready", failed: "Failed", uncertain: "Needs account check" };
async function request(path: string, body?: object) {
  const response = await fetch(path, { method: body ? "POST" : "GET", cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not complete this request.");
  return result;
}
type CampaignOption = { id: string; title: string; items: { id: string; headline: string | null; caption: string | null }[] };
export default function TestLab({ workspaceName, presenterMode = false, campaigns = [], initialCampaignId = "", initialContentItemId = "" }: { workspaceName: string; presenterMode?: boolean; campaigns?: CampaignOption[]; initialCampaignId?: string; initialContentItemId?: string }) {
  const initialCampaign = campaigns.find(item => item.id === initialCampaignId);
  const initialPost = initialCampaign?.items.find(item => item.id === initialContentItemId);
  const [campaignId, setCampaignId] = useState(initialCampaign?.id || "");
  const [postId, setPostId] = useState(initialPost?.id || "");
  const campaign = campaigns.find(item => item.id === campaignId);
  const campaignContext = presenterMode && campaignId && postId ? { campaignId, contentItemId: postId } : {};
  const [lab, setLab] = useState<Lab | null>(null), [model, setModel] = useState<Model["id"]>(presenterMode ? "infinitetalk" : "flux");
  const [prompt, setPrompt] = useState(presenterMode ? "Friendly, natural delivery. Preserve the presenter’s appearance and background. Match lip movements to the voice recording." : ""), [quote, setQuote] = useState<Quote | null>(null);
  const [image, setImage] = useState<{ id: string; name: string } | null>(null), [audio, setAudio] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [acknowledge, setAcknowledge] = useState(false);
  const [voiceMode, setVoiceMode] = useState<"text" | "upload">("text");
  const [script, setScript] = useState((initialPost?.caption || initialPost?.headline || "").slice(0,600));
  const [voiceId, setVoiceId] = useState<keyof typeof labVoices>("Calm_Woman");
  const [voiceJobId, setVoiceJobId] = useState("");
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
  useEffect(() => {
    const job = lab?.jobs.find(item => item.id === voiceJobId);
    if (job?.status === "succeeded" && job.audioAssetId) {
      if (job.prompt === script && job.voiceId === voiceId) {
        setAudio({ id: job.audioAssetId, name: "AI voice · " + labVoices[voiceId] });
        invalidate();
        setMessage("Your voice is ready. Listen below, then get the video cost estimate.");
      }
      setVoiceJobId("");
    }
  }, [lab, voiceJobId, script, voiceId]);
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
  async function estimate(target: Model["id"] = model) {
    if (!lab) return; setBusy(true); setMessage(""); invalidate();
    try {
      const result = await request("/api/ai-lab", { action: "quote", organizationId: lab.organizationId, input: { ...campaignContext, model: target, prompt: target === "speech" ? script : prompt, ...(target === "speech" ? { voiceId } : {}), ...(target === "infinitetalk" ? { imageAssetId: image?.id, audioAssetId: audio?.id } : {}) } });
      setQuote({ ...result, purpose: target === "speech" ? "voice" : "sample" }); requestId.current = crypto.randomUUID();
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function generate() {
    if (!lab || !quote || !acknowledge || !requestId.current) return;
    setBusy(true); setMessage("");
    try {
      const result = await request("/api/ai-lab", { action: "generate", organizationId: lab.organizationId, quoteId: quote.quoteId, requestId: requestId.current, acknowledge: true });
      if (quote.purpose === "voice") setVoiceJobId(result.job.id);
      invalidate(); setMessage(result.job.status === "uncertain" ? result.job.error : (quote.purpose === "voice" ? "Voice generation started. The video has not started. Listen to the voice when it is ready." : "Sample started. It will appear below; you can leave and return to check it."));
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
  async function useForPost(job: Sample) {
    if (!job.contentItemId) return;
    setBusy(true); setMessage("");
    try { await request("/api/video/select", { contentItemId: job.contentItemId, assetId: job.id }); setMessage("Presenter video selected for its campaign post. Review it before publishing."); }
    catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  return <div className={styles.lab}>
    <header className={styles.header}><div><span className={styles.eyebrow}>YOUR CREATIVE WORKBENCH</span><h1>{presenterMode ? "Presenter ads" : "AI Test Lab"}</h1><p>{presenterMode ? `Create a talking-presenter ad for ${workspaceName} with the lower-cost WaveSpeed workflow.` : `Try a small sample. Compare the results. Find what works for ${workspaceName}.`}</p></div><span className={styles.badge}>{presenterMode ? "Lower-cost default" : "Experimental"}</span></header>
    <div className={styles.notice}>{presenterMode ? "Create your voice first, then approve the video estimate. Finished videos are saved to the chosen campaign post for review. Nothing publishes automatically." : "Tests stay separate from your campaigns. Each generation uses the provider’s paid balance. Nothing publishes automatically."}</div>
    <div className={styles.grid}>
      <section className={styles.panel} aria-label="Create a test sample">
        <h2>{presenterMode ? "1. Choose a campaign post" : "1. Choose your test"}</h2>
        {presenterMode && <>
          <label htmlFor="ad-campaign">Campaign</label><select id="ad-campaign" value={campaignId} disabled={busy || active} onChange={e => { setCampaignId(e.target.value); setPostId(""); setScript(""); setAudio(null); invalidate(); }}><option value="">Choose campaign</option>{campaigns.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select>
          <label htmlFor="ad-post">Campaign post</label><select id="ad-post" value={postId} disabled={busy || active || !campaign} onChange={e => { setPostId(e.target.value); const post = campaign?.items.find(item => item.id === e.target.value); setScript((post?.caption || post?.headline || "").slice(0,600)); setAudio(null); invalidate(); }}><option value="">Choose post</option>{campaign?.items.map(item => <option value={item.id} key={item.id}>{item.headline || "Untitled post"}</option>)}</select>
          <p className={styles.hint}>Review the filled script before generating. The video length follows your audio. This workflow animates the presenter photo; it does not recreate or demonstrate a product.</p>
        </>}
        <div className={styles.models} hidden={presenterMode}>{(lab?.models || []).filter(item => item.kind !== "audio").map(item => <button key={item.id} type="button" className={`${styles.model} ${item.id === model ? styles.selected : ""}`} aria-pressed={item.id === model} disabled={busy} onClick={() => { setModel(item.id); setPrompt(""); invalidate(); setMessage(""); }}><strong>{item.kind === "image" ? "Image ad" : "Talking presenter"}</strong><span>{item.provider} · {item.name}</span><small>{item.configured ? "Ready to test" : "Account setup needed"}</small></button>)}</div>
        {!lab && !message && <p>Loading your workspace…</p>}
        {selected && !selected.configured && <div className={styles.setup}><strong>Connect this provider first</strong><p>Your administrator needs to add this provider’s API key and enable private sample storage. A website subscription alone does not connect the API.</p><details><summary>Administrator setup</summary><p>Add <code>{model === "flux" ? "BFL_API_KEY" : "WAVESPEED_API_KEY"}</code> and <code>BLOB_READ_WRITE_TOKEN</code> in the hosting settings. Never paste keys into this page or a prompt.</p></details></div>}
        {model === "infinitetalk" && <div className={styles.uploads}>
          <h2>2. Choose your presenter and voice</h2>
          <p>Choose a presenter photo you have permission to use. Type a script for an AI voice, or upload your own recording.</p>
          <label>Presenter photo<input aria-label="Presenter photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !selected?.configured} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file, "image"); }}/><small>{image?.name || "JPEG, PNG or WebP · up to 10 MB"}</small></label>
          <div className={styles.models} aria-label="Voice source">
            <button type="button" className={`${styles.model} ${voiceMode === "text" ? styles.selected : ""}`} aria-pressed={voiceMode === "text"} disabled={busy} onClick={() => { setVoiceMode("text"); setAudio(null); invalidate(); }}><strong>Type your script</strong><span>Create and preview an AI voice</span></button>
            <button type="button" className={`${styles.model} ${voiceMode === "upload" ? styles.selected : ""}`} aria-pressed={voiceMode === "upload"} disabled={busy} onClick={() => { setVoiceMode("upload"); setAudio(null); invalidate(); }}><strong>Upload a recording</strong><span>Use audio you already have</span></button>
          </div>
          {voiceMode === "upload" ? <label>Voice recording<input aria-label="Voice recording" type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/webm,.m4a" disabled={busy || !selected?.configured} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file, "audio"); }}/><small>{audio?.name || "MP3, WAV, M4A, Ogg or WebM · up to 10 MB"}</small></label> : <>
            <label htmlFor="lab-script">Spoken script</label>
            <textarea id="lab-script" rows={4} maxLength={600} value={script} disabled={busy} onChange={e => { setScript(e.target.value); setAudio(null); invalidate(); }} placeholder="Type the exact words your presenter should say…"/>
            <label htmlFor="lab-voice">AI voice</label>
            <select id="lab-voice" value={voiceId} disabled={busy} onChange={e => { setVoiceId(e.target.value as keyof typeof labVoices); setAudio(null); invalidate(); }}>{Object.entries(labVoices).map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select>
            <p className={styles.hint}>Up to 600 characters. First approve the voice cost. After listening, approve the video cost separately. Changing the script or voice requires a new voice sample.</p>
            <button type="button" className={styles.primary} disabled={busy || active || !selected?.configured || script.trim().length < 10 || (presenterMode && (!campaignId || !postId))} onClick={() => estimate("speech")}>Get voice cost estimate</button>
            {audio && <div className={styles.setup}><strong>{audio.name}</strong>{lab?.jobs.find(job => job.audioAssetId === audio.id)?.url && <audio aria-label="Selected AI voice preview" controls preload="none" src={lab.jobs.find(job => job.audioAssetId === audio.id)!.url!}/>}<p>Your voice is ready to use for the video. No video starts until you approve its estimate.</p></div>}
          </>}
        </div>}

        <h2>{model === "flux" ? "2" : "3"}. Describe the sample</h2><label htmlFor="lab-prompt">{model === "flux" ? "Image instructions" : "Delivery and setting"}</label><textarea id="lab-prompt" value={prompt} maxLength={2000} rows={6} disabled={busy} onChange={e => { setPrompt(e.target.value); invalidate(); }} placeholder={model === "flux" ? "Describe the person, setting, colors and any exact headline you want to test…" : "Friendly, relaxed delivery with natural expressions. Keep the presenter’s appearance and setting…"}/>
        <p className={styles.hint}>{model === "flux" ? "One portrait image at 1K. Include exact words if you want to test lettering, or request a clean photo to use with your existing ad templates." : "Start with a 10–15 second recording. Output quality and resolution need testing; the Fast model is not promised as HD. Uploaded inputs expire after seven days."}</p>
        <button type="button" className={styles.primary} disabled={busy || !selected?.configured || prompt.trim().length < 10 || (model === "infinitetalk" && (!image || !audio)) || active || (presenterMode && (!campaignId || !postId))} onClick={() => estimate()}>Get cost estimate</button>
        {active && <p className={styles.hint}>Finish or reconcile the existing sample before starting another.</p>}
      </section>
      <section className={styles.panel} aria-label="Test cost"><h2>Small tests. Clear costs.</h2><div className={styles.price}>{quote ? money(quote.estimateUsd) : selected ? money(selected.estimateUsd) : "—"}</div><p>{quote ? (quote.purpose === "voice" ? "AI voice estimate only · video priced separately" : "Provider estimate for this sample") : model === "flux" ? "Published estimate per image" : "Published video estimate for 15 seconds; AI voice generation costs extra"}</p><p className={styles.hint}>Estimates exclude tax, your existing hosting/storage costs and any new attempts. Provider billing is the final record. No additional Rumi generation credits are deducted in this owner/administrator workflow.</p><div className={styles.limits}><strong>Test allowance</strong><span>{money(lab?.dailyLimitUsd || 2)} in reserved estimates per workspace per day, resetting at midnight UTC. One sample at a time. Failed or unconfirmed submissions remain reserved to avoid overspending.</span></div>{quote && <><p>Estimate expires after two minutes.</p><label className={styles.consent}><input type="checkbox" checked={acknowledge} disabled={busy} onChange={e => setAcknowledge(e.target.checked)}/><span>{quote.purpose === "voice" ? "I understand this starts one paid AI voice generation, not the video." : "I understand this starts one paid provider generation."}</span></label><button type="button" className={styles.primary} disabled={busy || !acknowledge} onClick={generate}>{busy ? "Working…" : (quote.purpose === "voice" ? "Generate AI voice" : "Generate one sample")}</button></>}{selected && <a className={styles.source} href={selected.source} target="_blank" rel="noreferrer">View provider details ↗</a>}</section>
    </div>
    {message && <div role="status" className={styles.message}>{message}</div>}
    <section className={styles.history}><div className={styles.sectionTitle}><div><h2>Sample history</h2><p>Keep up to two results selected for comparison. Refreshing history never starts a new generation.</p></div><button type="button" disabled={busy} onClick={() => { setBusy(true); reload().catch(error => setMessage(error.message)).finally(() => setBusy(false)); }}>Refresh history</button></div>
      {!lab?.jobs.length && <div className={styles.empty}>Your test samples will appear here, with their model and estimated cost.</div>}
      <div className={styles.results}>{(lab?.jobs || []).filter(job => compare.length < 2 || compare.includes(job.id)).map(job => <article key={job.id} className={styles.sample}><div className={styles.sampleHead}><strong>{job.kind === "audio" ? "AI voice" : job.kind === "image" ? "FLUX image" : "InfiniteTalk Fast"}</strong><span>{statuses[job.status] || job.status}</span></div>{job.url ? job.kind === "image" ? <img src={job.url} alt={job.prompt} /> : job.kind === "audio" ? <audio aria-label="AI voice sample" src={job.url} controls preload="none"/> : <video src={job.url} controls preload="metadata"/> : <div className={styles.placeholder}>{job.status === "uncertain" ? "Check the provider account before generating again." : job.status === "failed" ? "This sample could not be completed." : "Your sample is being prepared."}</div>}<p>{job.prompt}</p><small>Estimated {money(job.estimateUsd)} · {new Date(job.createdAt).toLocaleString()}</small>{job.error && <p className={styles.hint}>{job.error}</p>}<div className={styles.sampleActions}>{job.url && <><a href={job.url + "&download=1"}>Download</a>{job.kind === "video" && job.campaignId && job.contentItemId && <><button type="button" disabled={busy} onClick={() => useForPost(job)}>Use for campaign post</button><a href={`/studio/reels?campaignId=${encodeURIComponent(job.campaignId)}&contentItemId=${encodeURIComponent(job.contentItemId)}`}>Open reel editor</a></>}{job.kind === "audio" && job.audioAssetId && <button type="button" disabled={busy} onClick={() => { setModel("infinitetalk"); setVoiceMode("text"); setScript(job.prompt); if (job.voiceId) setVoiceId(job.voiceId); setAudio({id: job.audioAssetId!, name: "Saved AI voice"}); invalidate(); setMessage("Saved voice selected. Add a presenter photo and get the video cost estimate."); }}>Use this voice for video</button>}<label><input type="checkbox" checked={compare.includes(job.id)} onChange={e => setCompare(current => e.target.checked ? [...current, job.id].slice(-2) : current.filter(id => id !== job.id))}/>Compare</label></>}{["running", "saving"].includes(job.status) && <button disabled={busy} onClick={() => check(job)}>Check progress</button>}</div></article>)}</div>{compare.length > 0 && <button type="button" onClick={() => setCompare([])}>Show all samples</button>}
    </section>
  </div>;
}
