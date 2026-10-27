"use client";
import ExactProductVideo from "@/components/ExactProductVideo";
import VideoLogoEditor from "@/components/VideoLogoEditor";
import { useEffect, useRef, useState } from "react";
import styles from "./lab.module.css";
import PresenterGallery from "../studio/presenters/PresenterGallery";
import { presenterSpeechText, DEFAULT_PRESENTER_DIRECTION } from "../../lib/presenter/speech-text";
import { isFlare, isLabPhoto, labPhotoBriefs } from "../../lib/ai-lab/photos";
import { labVoices, labVoiceStyles, labAccents, labAccentAvailable, labAccentSpeakers, labAccentVoice } from "../../lib/ai-lab/catalog";

type Model = { id: "flare-medium" | "flare-high" | "flux" | "infinitetalk" | "kling" | "speech" | "holding" | "veo"; name: string; provider: string; model: string; kind: "image" | "video" | "audio"; configured: boolean; estimateUsd: number; source: string };
type Sample = { usageCostUsd?: number | null; photoSettings?: {model:string;quality:string;size:string}; elapsedMs?: number; productLayout?: "beside"; productAssetId?: string; id: string; status: string; model: Model["id"]; kind: Model["kind"]; prompt: string; estimateUsd: number; error: string | null; createdAt: string; url: string | null; campaignId?: string; contentItemId?: string; imageAssetId?: string | null; audioAssetId?: string | null; voiceId?: keyof typeof labVoices; voiceAccent?: keyof typeof labAccents; accentSpeaker?: string | null; voiceEmotion?: keyof typeof labVoiceStyles; voiceSpeed?: number };
type PhotoInput = {id:string;name:string;needsReview?:boolean};
type Lab = { inputs?: PhotoInput[]; organizationId: string; dailyLimitUsd: number; models: Model[]; jobs: Sample[] };
type Quote = { quoteId: string; estimateUsd: number; expiresAt: string; purpose: "voice" | "sample" | "holding" };
const money = (amount: number) => "$" + amount.toFixed(3).replace(/0$/, "");
const statuses: Record<string,string> = { starting: "Starting", running: "Generating", saving: "Saving", succeeded: "Ready", failed: "Failed", uncertain: "Needs account check" };
async function request(path: string, body?: object) {
  const response = await fetch(path, { method: body ? "POST" : "GET", cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Could not complete this request.");
  return result;
}
type CampaignOption = { id: string; title: string; items: { id: string; headline: string | null; caption: string | null }[] };
export default function TestLab({ workspaceName, presenterMode = false, campaigns = [], initialCampaignId = "", initialContentItemId = "", initialModel }: { initialModel?: "flare-medium"|"flare-high"|"flux"|"infinitetalk"|"kling"|"veo"; workspaceName: string; presenterMode?: boolean; campaigns?: CampaignOption[]; initialCampaignId?: string; initialContentItemId?: string }) {
  const veoDirection = 'The presenter stands holding the product from reference image 2. Friendly, natural English delivery. Say: "Discover something special. Take a closer look at the details, and find out more today."';
  const initialCampaign = campaigns.find(item => item.id === initialCampaignId);
  const initialPost = initialCampaign?.items.find(item => item.id === initialContentItemId);
  const [campaignId, setCampaignId] = useState(initialCampaign?.id || "");
  const [postId, setPostId] = useState(initialPost?.id || "");
  const campaign = campaigns.find(item => item.id === campaignId);
  const campaignContext = presenterMode && campaignId && postId ? { campaignId, contentItemId: postId } : {};
  const [lab, setLab] = useState<Lab | null>(null), [model, setModel] = useState<Model["id"]>(initialModel || (presenterMode ? "infinitetalk" : "flux"));
  const [prompt, setPrompt] = useState(initialModel === "veo" ? veoDirection : presenterMode || initialModel === "infinitetalk" || initialModel === "kling" ? DEFAULT_PRESENTER_DIRECTION : ""), [quote, setQuote] = useState<Quote | null>(null);
  const [image, setImage] = useState<PhotoInput | null>(null), [audio, setAudio] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [acknowledge, setAcknowledge] = useState(false);
  const [voiceMode, setVoiceMode] = useState<"text" | "upload">("text");
  const [script, setScript] = useState(presenterSpeechText(initialPost?.caption || initialPost?.headline || ""));
  const [voiceId, setVoiceId] = useState<keyof typeof labVoices|"">("");
  const [accentSpeaker,setAccentSpeaker]=useState("");
  const [voiceAccent,setVoiceAccent] = useState<keyof typeof labAccents>("original");
  const [voiceEmotion, setVoiceEmotion] = useState<keyof typeof labVoiceStyles>("neutral");
  const [voiceSpeed, setVoiceSpeed] = useState(1);
  const [gallerySelection,setGallerySelection]=useState<number|null>(null);
  const [product, setProduct] = useState<PhotoInput | null>(null);
  const [presenterSource,setPresenterSource]=useState<PhotoInput|null>(null);
  const [holdingPose,setHoldingPose]=useState<"guitar"|"guitar-standing-strum"|"reference">("guitar");
  const [besideProduct,setBesideProduct]=useState(false);
  const [holdProduct, setHoldProduct] = useState(false), [productReviewed, setProductReviewed] = useState(false);
  const [holdingJobId, setHoldingJobId] = useState("");
  const [voiceJobId, setVoiceJobId] = useState("");
  const [scriptSeconds, setScriptSeconds] = useState(15);
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOnly, setCompareOnly] = useState(false);
  const selectedVoicePlayer = useRef<HTMLAudioElement>(null);
  const [voicePreviewError, setVoicePreviewError] = useState(false);
  const requestId = useRef("");
  const pending = useRef(false);
  const promptByKind = useRef({ image: "", video: DEFAULT_PRESENTER_DIRECTION });
  function chooseModel(next: Model["id"]) {
    const previousKind = isLabPhoto(model) ? "image" : "video";
    const nextKind = isLabPhoto(next) ? "image" : "video";
    promptByKind.current[previousKind] = prompt;
    setPrompt(nextKind === "video" && promptByKind.current.video.trim().length < 10 ? DEFAULT_PRESENTER_DIRECTION : promptByKind.current[nextKind]);
    if (next === "veo") setPrompt(veoDirection);
    setHoldingJobId("");
    setModel(next); invalidate(); setMessage("");
  }
  const invalidate = () => { setQuote(null); setAcknowledge(false); requestId.current = ""; };
  function resetPreparedProduct() {
    setProductReviewed(false); setHoldingJobId("");
    setImage(current => current?.needsReview ? presenterSource : current);
    invalidate();
  }
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
      if (voiceId && job.prompt === script && job.voiceId === voiceId && (job.voiceAccent ?? "original") === voiceAccent && (job.accentSpeaker || "") === accentSpeaker && (job.voiceEmotion ?? "neutral") === voiceEmotion && (job.voiceSpeed ?? 1) === voiceSpeed) {
        setAudio({ id: job.audioAssetId, name: "AI voice · " + labVoices[voiceId] + (voiceAccent === "original" ? "" : " · " + labAccents[voiceAccent]) });
        invalidate();
        setMessage("Your voice is ready. Listen below, then get the video cost estimate.");
      }
      setVoiceJobId("");
    }
  }, [lab, voiceJobId, script, voiceId, voiceAccent, accentSpeaker, voiceEmotion, voiceSpeed]);
  useEffect(() => {
    const job = lab?.jobs.find(item => item.id === holdingJobId);
    if (job?.status === "succeeded" && job.imageAssetId) {
      setImage({id:job.imageAssetId,name:"Presenter holding your product",needsReview:true});
      setProductReviewed(false);setHoldingJobId("");invalidate();
      setMessage("Product photo ready. Check the guitar, hands and face below, then confirm the photo before creating the video.");
    }
  }, [lab, holdingJobId]);
  const selected = lab?.models.find(m => m.id === model);
  const active = lab?.jobs.some(j => ["starting", "running", "saving", "uncertain"].includes(j.status));
  const selectedVoiceUrl = lab?.jobs.find(job => job.audioAssetId === audio?.id)?.url;
  const photoMode = isLabPhoto(model);
  const videoMode = model === "infinitetalk" || model === "kling" || model === "veo";
  const estimateBlocker = !selected?.configured ? "Connect this provider before getting an estimate."
    : prompt.trim().length < 10 ? (photoMode ? "Add image instructions above." : "Add delivery and setting instructions above.")
    : videoMode && !image ? "Choose a presenter photo above."
    : model === "veo" && (!product || image?.needsReview || product.needsReview || product.id === image?.id) ? "Choose separate original presenter and product photos for Veo."
    : videoMode && model !== "veo" && !audio ? "Choose a saved voice or create a voice sample above."
    : videoMode && model !== "veo" && ((image?.needsReview && !productReviewed) || (holdProduct && (!image?.needsReview || !productReviewed))) ? "Prepare and approve the presenter holding your product above."
    : videoMode && model !== "veo" && besideProduct && (!product || image?.needsReview || product.id === image?.id) ? "Choose a separate product photo for the beside layout."
    : presenterMode && (!campaignId || !postId) ? "Choose a campaign and post above."
    : "";
  useEffect(() => { setVoicePreviewError(false); }, [audio?.id, selectedVoiceUrl]);
  async function upload(file: File, kind: "image" | "audio" | "product") {
    if (!lab) return;
    invalidate(); setBusy(true); setMessage(`Uploading ${kind === "image" ? "presenter photo" : kind === "product" ? "product photo" : "voice recording"}…`);
    try {
      if (file.size > 10_000_000) throw new Error(`The ${kind === "image" ? "presenter photo" : kind === "product" ? "product photo" : "voice recording"} “${file.name}” is ${(file.size / 1_000_000).toFixed(1)} MB. Choose a file under 10 MB. Your existing selections have been kept.`);
      const extension = file.name.split(".").pop()?.toLowerCase();
      const type = file.type || ({ mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg" } as Record<string,string>)[extension || ""];
      const ticket = await request("/api/ai-lab/upload", { action: "prepare", organizationId: lab.organizationId, filename: file.name.replace(/[^\w .()-]/g, "_"), size: file.size, contentType: type });
      const sent = await fetch(ticket.upload.url, { method: "PUT", headers: ticket.upload.headers, body: file, credentials: "omit", redirect: "error" });
      if (!sent.ok) throw new Error("Upload did not finish. Choose the file again.");
      await request("/api/ai-lab/upload", { action: "complete", organizationId: lab.organizationId, assetId: ticket.assetId });
      (kind === "image" ? setImage : kind === "product" ? setProduct : setAudio)({ id: ticket.assetId, name: file.name });
      if (kind === "product") resetPreparedProduct();
      if (kind === "image") {setPresenterSource({id:ticket.assetId,name:file.name});setProductReviewed(false);setGallerySelection(null);}
      setMessage("Photo or recording ready. No paid image or video generation has started.");
      return true;
    } catch (error) { setMessage((error as Error).message); return false; }
    finally { setBusy(false); }
  }
  async function estimate(target: Model["id"] = model) {
    if (!lab) return; if(target === "speech" && !voiceId){setMessage("Choose a female or male voice before getting an estimate.");return;} setBusy(true); setMessage(""); invalidate();
    try {
      const result = await request("/api/ai-lab", { action: "quote", organizationId: lab.organizationId, input: { ...campaignContext, model: target, prompt: target === "speech" ? script : target === "holding" ? "Show the presenter naturally holding the exact product in a portrait photo, looking at the camera." : prompt, ...(target === "speech" ? { voiceId, voiceAccent, accentSpeaker:accentSpeaker || undefined, voiceEmotion, voiceSpeed } : {}), ...(target === "veo" ? {imageAssetId:image?.id,productAssetId:product?.id} : {}), ...(target === "holding" ? {imageAssetId:presenterSource?.id || (!image?.needsReview ? image?.id : undefined),productAssetId:product?.id,holdingPose} : {}), ...((target === "infinitetalk" || target === "kling") ? { imageAssetId: image?.id, audioAssetId: audio?.id, productReviewed, ...(besideProduct ? {productLayout:"beside",productAssetId:product?.id} : {}) } : {}) } });
      setQuote({ ...result, purpose: target === "speech" ? "voice" : target === "holding" ? "holding" : "sample" }); requestId.current = crypto.randomUUID();
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  async function generate(approveVideo = false) {
    if (!lab || !quote || (!acknowledge && !(approveVideo && quote.purpose === "sample" && videoMode)) || !requestId.current || busy) return;
    setBusy(true); setMessage("");
    try {
      const result = await request("/api/ai-lab", { action: "generate", organizationId: lab.organizationId, quoteId: quote.quoteId, requestId: requestId.current, acknowledge: true });
      if (quote.purpose === "voice") setVoiceJobId(result.job.id);
      if (quote.purpose === "holding") setHoldingJobId(result.job.id);
      invalidate(); setMessage(["uncertain", "failed"].includes(result.job.status) ? result.job.error || "The provider could not complete this sample. Check the sample history before trying again." : (quote.purpose === "voice" ? "Voice generation started. The video has not started. Listen to the voice when it is ready." : "Sample started. It will appear below; you can leave and return to check it."));
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
  async function createScript() {
    if (!lab || !campaignId || !postId || busy) return;
    setBusy(true); setMessage("Writing a presenter script from your campaign post…");
    try {
      const result = await request("/api/video/presenter/script", { organizationId: lab.organizationId, campaignId, contentItemId: postId, seconds: scriptSeconds });
      setScript(presenterSpeechText(result.script)); setAudio(null); setVoiceJobId(""); invalidate();
      setMessage("Script ready. Review or edit the words, then get the voice cost estimate. No voice or video has started.");
    } catch (error) { setMessage((error as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (quote?.purpose !== "sample" || !videoMode) return;
    document.getElementById("lab-video-approval")?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("lab-approve-video")?.focus({ preventScroll: true });
  }, [quote, videoMode]);
  const videoApproval = quote?.purpose === "sample" && videoMode ? <div id="lab-video-approval" className={styles.setup} aria-label="Approve video">
    <h3>Ready to create your video</h3>
    <p>{model === "veo" ? "One 8-second vertical Veo video using your two original photos, with generated audio. Your saved voice is not used." : "One video using your selected presenter and saved voice."} Estimated provider cost: <strong>{money(quote.estimateUsd)}</strong>.</p>
    <button id="lab-approve-video" type="button" className={styles.primary} disabled={busy || active || Boolean(estimateBlocker)} onClick={() => generate(true)}>{busy ? "Creating video…" : `Approve ${money(quote.estimateUsd)} and create video`}</button>
    <p className={styles.hint}>This starts one paid video generation. Nothing is posted. The estimate is valid for two minutes.</p>
  </div> : null;
  return <div className={styles.lab}>
    <header className={styles.header}><div><span className={styles.eyebrow}>YOUR CREATIVE WORKBENCH</span><h1>{presenterMode ? "Presenter ads" : "AI Test Lab"}</h1><p>{presenterMode ? `Create a talking-presenter ad for ${workspaceName} with the lower-cost WaveSpeed workflow.` : `Try a small sample. Compare the results. Find what works for ${workspaceName}.`}</p></div><span className={styles.badge}>{presenterMode ? "Lower-cost default" : "Experimental"}</span></header>
    <p><a href="/ai-test-lab/options">Explore all AI options · images, videos, presenters and voices</a></p>
    <div className={styles.notice}>{presenterMode ? "Create your voice first, then approve the video estimate. Finished videos are saved to the chosen campaign post for review. Nothing publishes automatically." : "Tests stay separate from your campaigns. Each generation uses the provider’s paid balance. Nothing publishes automatically."}</div>
    <div className={styles.grid}>
      <section className={styles.panel} aria-label="Create a test sample">
        {active && <p role="status">An earlier sample is still running or needs an account check. You can change settings for your next sample. New paid generation stays blocked until that sample is resolved.</p>}
        <h2>{presenterMode ? "1. Choose a campaign post" : "1. Choose your test"}</h2>
        {(presenterMode || model === "infinitetalk" || model === "kling") && <>
          <label htmlFor="ad-campaign">Campaign</label><select id="ad-campaign" value={campaignId} disabled={busy} onChange={e => { setCampaignId(e.target.value); setPostId(""); setScript(""); setAudio(null); invalidate(); }}><option value="">Choose campaign</option>{campaigns.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select>
          <label htmlFor="ad-post">Campaign post</label><select id="ad-post" value={postId} disabled={busy || !campaign} onChange={e => { setPostId(e.target.value); const post = campaign?.items.find(item => item.id === e.target.value); setScript(presenterSpeechText(post?.caption || post?.headline || "")); setAudio(null); invalidate(); }}><option value="">Choose post</option>{campaign?.items.map(item => <option value={item.id} key={item.id}>{item.headline || "Untitled post"}</option>)}</select>
          <p className={styles.hint}>Review the filled script before generating. The video length follows your audio. This workflow animates the presenter photo; use the product option below to prepare a holding pose first. Product details need your review.</p>
        </>}
        {!presenterMode && <><label htmlFor="lab-model">Video or image model</label><select id="lab-model" value={model} disabled={busy || !lab} onChange={e=>chooseModel(e.target.value as Model["id"])}>{!lab && <option value={model}>Loading available models…</option>}{lab && !selected && <option value={model}>Selected model is unavailable in this deployment</option>}{(lab?.models || []).filter(item=>item.kind !== "audio" && item.id !== "holding").map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select>{lab && !selected && <p role="alert">This deployment does not include the selected model. Refresh after the latest deployment is Ready, or choose another listed model.</p>}</>}
        <div className={styles.models} hidden={presenterMode}>{(lab?.models || []).filter(item => item.kind !== "audio" && item.id !== "holding").map(item => <button key={item.id} type="button" className={`${styles.model} ${item.id === model ? styles.selected : ""}`} aria-pressed={item.id === model} disabled={busy} onClick={() => chooseModel(item.id)}><strong>{item.id === "flux" ? "Image ad" : item.id === "infinitetalk" ? "Talking presenter" : item.name}</strong><span>{item.provider} · {item.name}</span><small>{item.configured ? "Ready to test" : "Account setup needed"}</small></button>)}</div>
        {!lab && !message && <p>Loading your workspace…</p>}
        {selected && !selected.configured && <div className={styles.setup}><strong>Connect this provider first</strong><p>Your administrator needs to add this provider’s API key and enable private sample storage. A website subscription alone does not connect the API.</p><details><summary>Administrator setup</summary><p>Add <code>{model === "flux" ? "BFL_API_KEY" : isFlare(model) ? "OPENAI_API_KEY" : "WAVESPEED_API_KEY"}</code> and <code>BLOB_READ_WRITE_TOKEN</code> in the hosting settings. Never paste keys into this page or a prompt.</p></details></div>}
        {presenterMode && <><label htmlFor="presenter-engine">Presenter video model</label><select id="presenter-engine" value={model} disabled={busy} onChange={e=>chooseModel(e.target.value as Model["id"])}>{(lab?.models || []).filter(item=>item.kind === "video").map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>{model === "kling" && <p>Kling Avatar comparison · published video estimate $0.75 for 15 seconds, voice extra. The live estimate uses your recording length. Quality and guitar accuracy need review; this animates one prepared photo and does not combine separate presenter and guitar references.</p>}</>}
        {model === "veo" && <div className={styles.uploads}>
          <h2>2. Original presenter and product photos</h2>
          <p>One 8-second, 720p vertical video with generated speech and sound. Both original photos go directly to Veo; no holding-photo generation is needed. Product accuracy, hands and pronunciation need review. Your saved voice is not used.</p>
          <PresenterGallery selected={gallerySelection} disabled={busy || !selected?.configured} onChoose={async(file,index)=>{const ready=await upload(file,"image");if(ready)setGallerySelection(index);return ready;}}/>
          <label>Original presenter photo<input aria-label="Original presenter photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !selected?.configured} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file,"image");}}/><small>{image?.name || "JPEG, PNG or WebP · up to 10 MB"}</small></label>
          <label htmlFor="veo-presenter">Saved original presenter</label><select id="veo-presenter" value={image?.needsReview ? "" : image?.id || ""} disabled={busy} onChange={e=>{setImage(lab?.inputs?.find(item=>item.id===e.target.value)||null);setGallerySelection(null);invalidate();}}><option value="">Choose original presenter</option>{lab?.inputs?.filter(item=>!item.needsReview).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <label>Original product photo<input aria-label="Original product photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !selected?.configured} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file,"product");}}/><small>{product?.name || "JPEG, PNG or WebP · up to 10 MB"}</small></label>
          <label htmlFor="veo-product">Saved original product</label><select id="veo-product" value={product?.needsReview ? "" : product?.id || ""} disabled={busy} onChange={e=>{setProduct(lab?.inputs?.find(item=>item.id===e.target.value)||null);invalidate();}}><option value="">Choose original product</option>{lab?.inputs?.filter(item=>!item.needsReview).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
        </div>}
        {(model === "infinitetalk" || model === "kling") && <div className={styles.uploads}>
          <h2>2. Choose your presenter and voice</h2>
          <p>Choose a presenter photo you have permission to use. Type a script for an AI voice, or upload your own recording.</p>
          <PresenterGallery selected={gallerySelection} disabled={busy || !selected?.configured} onChoose={async(file,index)=>{const ready=await upload(file,"image");if(ready)setGallerySelection(index);return ready;}}/>
          <label>Presenter photo<input aria-label="Presenter photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !selected?.configured} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file, "image"); }}/><small>{image?.name || "JPEG, PNG or WebP · up to 10 MB"}</small></label>
          {!!lab?.inputs?.length && <><label htmlFor="saved-presenter">Or choose a saved presenter photo</label><select id="saved-presenter" value={image?.id || ""} disabled={busy} onChange={e => {const photo=lab.inputs?.find(item => item.id === e.target.value) || null;setImage(photo);setPresenterSource(photo?.needsReview?null:photo);setGallerySelection(null);setProductReviewed(false);invalidate();}}><option value="">Choose saved photo</option>{lab.inputs.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></>}
          <label className={styles.consent}><input type="checkbox" checked={holdProduct} disabled={busy} onChange={e=>{setHoldProduct(e.target.checked);if(e.target.checked)setBesideProduct(false);invalidate();}}/>Have the presenter hold a guitar or product</label>
          <label className={styles.consent}><input type="checkbox" checked={besideProduct} disabled={busy} onChange={e=>{setBesideProduct(e.target.checked);if(e.target.checked){setHoldProduct(false);setHoldingJobId("");if(image?.needsReview){setImage(presenterSource);setProductReviewed(false);}}invalidate();}}/>Presenter beside my exact product photo · keep the guitar unchanged</label>
          {besideProduct && <p>Use an original presenter portrait. Your product photo stays separate from AI generation. When the talking clip is ready, click “Create video beside my exact product” below to combine them automatically, with the original voice.</p>}
          {(holdProduct || besideProduct) && <div className={styles.setup}>
            {holdProduct && <><p>Use the original presenter portrait and a clear photo of the exact guitar. For another attempt, choose the original portrait instead of the earlier prepared product photo.</p>
            <label htmlFor="holding-pose">Product scale and pose</label><select id="holding-pose" value={holdingPose} disabled={busy} onChange={e=>{setHoldingPose(e.target.value as "guitar"|"guitar-standing-strum"|"reference");resetPreparedProduct();}}><option value="guitar">Full-size adult guitar · seated, across the lap</option><option value="guitar-standing-strum">Full-size adult guitar · standing, strumming pose</option><option value="reference">Other product · match reference scale</option></select>
            {presenterSource && <p className={styles.hint}>Original presenter reference: {presenterSource.name}</p>}
            {!presenterSource && image?.needsReview && <p className={styles.hint}>Choose an original presenter portrait above before preparing a new holding photo.</p>}
            </>}<label>Guitar or product photo<input aria-label="Guitar or product photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || !selected?.configured} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file,"product");}}/><small>{product?.name || "Upload the exact product · up to 10 MB"}</small></label>
            {!!lab?.inputs?.length && <><label htmlFor="saved-product">Or choose a saved product photo</label><select id="saved-product" value={product?.id || ""} disabled={busy} onChange={e=>{setProduct(lab.inputs?.find(item=>item.id===e.target.value)||null);resetPreparedProduct();}}><option value="">Choose saved photo</option>{lab.inputs.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></>}
            {holdProduct && <><button type="button" disabled={busy || active || !selected?.configured || (!presenterSource && (!image || image.needsReview)) || !product || (presenterSource?.id || image?.id)===product.id || (presenterMode && (!campaignId || !postId))} onClick={()=>estimate("holding")}>Prepare presenter holding product</button>
            <p className={styles.hint}>Get an image-edit estimate first. Voice and video are priced separately. Check the product shape, details, hands and face before continuing. This creates a still holding or strumming pose. Presenter animation may not reproduce realistic strumming and does not generate guitar music.</p></>}
          </div>}
          {image?.needsReview && <div className={styles.setup}>
            {lab?.jobs.find(job=>job.imageAssetId===image.id)?.url && <img className={styles.productPreview} src={lab.jobs.find(job=>job.imageAssetId===image.id)!.url!} alt="Prepared presenter holding product"/>}
            <label className={styles.consent}><input type="checkbox" checked={productReviewed} disabled={busy || active} onChange={e=>{setProductReviewed(e.target.checked);invalidate();}}/>I checked the product details, hands and presenter and approve this photo for the video.</label>
          </div>}
          <div className={styles.models} aria-label="Voice source">
            <button type="button" className={`${styles.model} ${voiceMode === "text" ? styles.selected : ""}`} aria-pressed={voiceMode === "text"} disabled={busy} onClick={() => { setVoiceMode("text"); setAudio(null); invalidate(); }}><strong>Type your script</strong><span>Create and preview an AI voice</span></button>
            <button type="button" className={`${styles.model} ${voiceMode === "upload" ? styles.selected : ""}`} aria-pressed={voiceMode === "upload"} disabled={busy} onClick={() => { setVoiceMode("upload"); setAudio(null); invalidate(); }}><strong>Upload a recording</strong><span>Use audio you already have</span></button>
          </div>
          {voiceMode === "upload" ? <label>Voice recording<input aria-label="Voice recording" type="file" accept="audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/ogg,audio/webm,.m4a" disabled={busy || !selected?.configured} onChange={e => { const file = e.target.files?.[0]; if (file) void upload(file, "audio"); }}/><small>{audio?.name || "MP3, WAV, M4A, Ogg or WebM · up to 10 MB"}</small></label> : <>
            <label htmlFor="lab-script">Spoken script</label>
            {<div className={styles.setup}>
              <label htmlFor="script-length">Script length</label><select id="script-length" value={scriptSeconds} disabled={busy || active} onChange={e => setScriptSeconds(Number(e.target.value))}><option value={15}>About 15 seconds</option><option value={30}>About 30 seconds</option></select>
              <button type="button" disabled={busy || active || !lab || !campaignId || !postId} onClick={createScript}>Create script for me</button>
              <p className={styles.hint}>{!campaignId || !postId ? "Choose a campaign and post above to enable script creation. " : ""}Uses your campaign post and Brand Brain. Script writing uses your connected OpenAI API balance. Review the draft before generating a voice.</p>
            </div>}
            <textarea id="lab-script" rows={4} maxLength={600} value={script} disabled={busy} onChange={e => { setScript(e.target.value); setAudio(null); invalidate(); }} placeholder="Type the exact words your presenter should say…"/>
            <label htmlFor="lab-voice">AI voice</label><p className={styles.hint}>Choose the voice explicitly. Uploading a woman’s or man’s photo does not choose a voice. Your selection is kept when you switch video models.</p>
            <select id="lab-voice" value={voiceId} disabled={busy} onChange={e => { const next=e.target.value as keyof typeof labVoices|"";setVoiceId(next);if(!next){setVoiceAccent("original");setAccentSpeaker("");setAudio(null);invalidate();return;}if(labAccentSpeakers[voiceAccent])setAccentSpeaker(labAccentVoice(next,voiceAccent));if(!labAccentAvailable(next,voiceAccent)){setVoiceAccent("original");setAccentSpeaker("");setMessage("Accent reset to Original voice because that regional speaker is not available for this voice choice.");}setAudio(null);invalidate(); }}><option value="">Choose a female or male voice</option>{Object.entries(labVoices).map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select>
            <label htmlFor="voice-accent">Accent</label><select id="voice-accent" value={voiceAccent} disabled={busy || !voiceId} onChange={e=>{if(!voiceId)return;const next=e.target.value as keyof typeof labAccents;setVoiceAccent(next);setAccentSpeaker(labAccentSpeakers[next]?labAccentVoice(voiceId,next):"");setAudio(null);invalidate();}}>{Object.entries(labAccents).map(([id,name])=><option key={id} value={id} disabled={!voiceId || !labAccentAvailable(voiceId,id as keyof typeof labAccents)}>{name}</option>)}</select>
            {voiceId && labAccentSpeakers[voiceAccent] && <><label htmlFor="accent-speaker">Accent speaker</label><select id="accent-speaker" value={accentSpeaker || (voiceId ? labAccentVoice(voiceId,voiceAccent) : "")} disabled={busy} onChange={e=>{setAccentSpeaker(e.target.value);setAudio(null);invalidate();}}>{Object.entries(labAccentSpeakers[voiceAccent]!).map(([id,speaker])=><option key={id} value={id}>{speaker.label}</option>)}</select><p className={styles.hint}>English script preview: these speakers are documented for their native language. Your English script is sent unchanged. Preview the pronunciation and accent strength before creating the video. This does not translate your script.</p></>}
            <p className={styles.hint}>{voiceAccent === "original" ? "Keep the selected voice's original accent, or choose a regional English voice. Australian and Indian options are available for male voices." : "Regional accents use a different preset speaker. Your original voice choice is kept for switching back. Preview the voice before creating the video."}</p>
            <label htmlFor="voice-style">Speaking style</label><select id="voice-style" value={voiceEmotion} disabled={busy} onChange={e=>{setVoiceEmotion(e.target.value as keyof typeof labVoiceStyles);setAudio(null);invalidate();}}>{Object.entries(labVoiceStyles).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
            <label htmlFor="voice-pace">Speaking pace</label><select id="voice-pace" value={voiceSpeed} disabled={busy} onChange={e=>{setVoiceSpeed(Number(e.target.value));setAudio(null);invalidate();}}><option value={0.9}>Relaxed · 10% slower</option><option value={0.95}>Slightly slower</option><option value={1}>Normal</option><option value={1.05}>Lively · slightly faster</option></select>
            <details><summary>Voice tips and limits</summary><p className={styles.hint}>For a natural read, try a conversational voice and short sentences with punctuation. Listen before buying the video. Slower speech makes the video longer; its estimate uses the actual audio.</p>
            <p className={styles.hint}>Up to 600 characters. First approve the voice cost. After listening, approve the video cost separately. Changing the script or voice requires a new voice sample.</p></details>
            <button type="button" className={styles.primary} disabled={busy || active || !voiceId || !selected?.configured || script.trim().length < 10 || (presenterMode && (!campaignId || !postId))} onClick={() => estimate("speech")}>Get voice cost estimate</button>
            {audio && <div className={styles.setup}><strong>{audio.name}</strong>{selectedVoiceUrl && <audio key={audio.id + selectedVoiceUrl} ref={selectedVoicePlayer} aria-label="Selected AI voice preview" controls preload="metadata" src={selectedVoiceUrl} onLoadedMetadata={() => setVoicePreviewError(false)} onError={() => setVoicePreviewError(true)}/>}<p>{voicePreviewError ? "The selected voice preview could not load. Retry loading the saved recording; you do not need to generate or pay for another voice." : "Your saved voice is selected for the video. No video starts until you approve its estimate."}</p>{voicePreviewError && <button type="button" onClick={() => { setVoicePreviewError(false); selectedVoicePlayer.current?.load(); }}>Reload saved voice preview</button>}{videoApproval || <><button type="button" className={styles.primary} disabled={busy || active || Boolean(estimateBlocker)} onClick={() => estimate()}>Continue to video</button>{estimateBlocker && <p>{estimateBlocker}</p>}{active && <p>Finish or check the existing sample first.</p>}</>}</div>}
          </>}
        </div>}

        {photoMode && <div className={styles.setup}>
          <h3>Compare photo generators</h3>
          <p>Choose a sample brief or write your own. Switching between FLUX, Flare Medium and Flare High keeps your image instructions. Generate one sample at a time, then compare the saved results below.</p>
          <div className={styles.sampleActions}>{labPhotoBriefs.map(brief => <button type="button" key={brief.id} disabled={busy} onClick={() => {setPrompt(brief.prompt);invalidate();}}>{brief.label}</button>)}</div>
          <p className={styles.hint}>Portrait 4:5: FLUX at 1K; Flare at 1024 × 1280. These text-only concepts do not reproduce an exact product. Review hands, guitar details, lighting and relevance.</p>
        </div>}
        <h2>{photoMode ? "2" : "3"}. Describe the sample</h2><label htmlFor="lab-prompt">{photoMode ? "Image instructions" : "Delivery and setting"}</label><textarea id="lab-prompt" value={prompt} maxLength={2000} rows={6} disabled={busy} onChange={e => { setPrompt(e.target.value); invalidate(); }} placeholder={photoMode ? "Describe the person, setting, colors and any exact headline you want to test…" : "Friendly, relaxed delivery with natural expressions. Keep the presenter’s appearance and setting…"}/>
        <p className={styles.hint}>{model === "veo" ? "Describe the holding action and include a short spoken line in quotation marks—about 12–16 words for 8 seconds. Veo generates its own voice; it does not reuse your saved recording. Product fidelity is not guaranteed." : isFlare(model) ? "One 1024 × 1280 portrait photo using GPT Image 2.5 Flare. The selected Medium or High quality is fixed for this sample. Reference-photo editing is not part of this comparison." : model === "flux" ? "One portrait image at 1K. Include exact words if you want to test lettering, or request a clean photo to use with your existing ad templates." : "Start with a 10–15 second recording. Output quality and resolution need testing; the Fast model is not promised as HD. Uploaded inputs expire after seven days."}</p>
        <button type="button" className={styles.primary} disabled={busy || active || Boolean(estimateBlocker)} onClick={() => estimate()}>Get cost estimate</button>
        {videoMode && estimateBlocker && !busy && <p className={styles.hint}>{estimateBlocker}</p>}
        {(model === "veo" || voiceMode === "upload") && videoApproval}
        {active && <p className={styles.hint}>Finish or reconcile the existing sample before starting another.</p>}
      </section>
      <section className={styles.panel} aria-label="Test cost"><h2>Small tests. Clear costs.</h2><div className={styles.price}>{quote ? money(quote.estimateUsd) : selected ? money(selected.estimateUsd) : "—"}</div><p>{quote ? (quote.purpose === "voice" ? "AI voice estimate only · video priced separately" : quote.purpose === "holding" ? "Product photo estimate only · voice and video priced separately" : isFlare(model) ? "Calculated generation estimate including a conservative prompt allowance" : "Provider estimate for this sample") : isFlare(model) ? "Estimated image output only · get a complete estimate including your instructions" : model === "flux" ? "Published estimate per image" : model === "veo" ? "Published estimate for 8 seconds at 720p, including generated audio; get a live estimate before approval" : "Published video estimate for 15 seconds; AI voice generation costs extra"}</p><details><summary>Costs and test limits</summary><p className={styles.hint}>Estimates exclude tax, your existing hosting/storage costs and any new attempts. Provider billing is the final record. No additional Rumi generation credits are deducted in this owner/administrator workflow.</p><div className={styles.limits}><strong>Test allowance</strong><span>{money(lab?.dailyLimitUsd || 2)} in reserved estimates per workspace per day, resetting at midnight UTC. One sample at a time. Failed or unconfirmed submissions remain reserved to avoid overspending.</span></div></details>{quote && !videoApproval && <><p>Estimate expires after two minutes.</p><label className={styles.consent}><input type="checkbox" checked={acknowledge} disabled={busy} onChange={e => setAcknowledge(e.target.checked)}/><span>{quote.purpose === "voice" ? "I understand this starts one paid AI voice generation, not the video." : "I understand this starts one paid provider generation."}</span></label><button type="button" className={styles.primary} disabled={busy || !acknowledge} onClick={() => generate()}>{busy ? "Working…" : (quote.purpose === "voice" ? "Generate AI voice" : quote.purpose === "holding" ? "Create product presenter photo" : "Generate one sample")}</button></>}{selected && <a className={styles.source} href={quote?.purpose === "holding" ? lab?.models.find(item=>item.id === "holding")?.source || "https://wavespeed.ai/docs/docs-api/wavespeed-ai/flux-2-klein-4b-edit" : selected.source} target="_blank" rel="noreferrer">View provider details ↗</a>}</section>
    </div>
    {message && <div role="status" className={styles.message}>{message}</div>}
    <section className={styles.history}><div className={styles.sectionTitle}><div><h2>Sample history</h2><p>Choose up to three results, then click Compare selected. Refreshing history never starts a new generation.</p></div><button type="button" disabled={busy} onClick={() => { setBusy(true); reload().catch(error => setMessage(error.message)).finally(() => setBusy(false)); }}>Refresh history</button></div>
      {!lab?.jobs.length && <div className={styles.empty}>Your test samples will appear here, with their model and estimated cost.</div>}
      {compare.length >= 2 && <button type="button" onClick={() => setCompareOnly(true)}>Compare selected</button>}
      <div className={`${styles.results} ${compareOnly && compare.length === 3 ? styles.threeResults : ""}`}>{(lab?.jobs || []).filter(job => !compareOnly || compare.length < 2 || compare.includes(job.id)).map(job => <article key={job.id} className={styles.sample}><div className={styles.sampleHead}><strong>{job.kind === "audio" ? "AI voice" : job.kind === "image" ? (job.model === "holding" ? "Product presenter photo" : lab?.models.find(item => item.id === job.model)?.name || job.model) : job.model === "veo" ? "Veo 3.1 Fast · product references" : job.model === "kling" ? "Kling Avatar Standard" : "InfiniteTalk Fast"}</strong><span>{statuses[job.status] || job.status}</span></div>{job.url ? job.kind === "image" ? <img src={job.url} alt={job.prompt} /> : job.kind === "audio" ? <audio aria-label="AI voice sample" src={job.url} controls preload="none"/> : <video src={job.url} controls preload="metadata"/> : <div className={styles.placeholder}>{job.status === "uncertain" ? "Check the provider account before generating again." : job.status === "failed" ? "This sample could not be completed." : "Your sample is being prepared."}</div>}{job.kind === "video" && job.url && <><ExactProductVideo src={job.url} productSrc={job.productLayout === "beside" && job.productAssetId ? `/api/ai-lab/input-image?assetId=${encodeURIComponent(job.productAssetId)}` : undefined}/><VideoLogoEditor src={job.url}/></>}<p>{job.prompt}</p><small>{job.usageCostUsd != null ? `Cost from reported usage ${money(job.usageCostUsd)}` : `Estimated ${money(job.estimateUsd)}`} · {new Date(job.createdAt).toLocaleString()}</small>{job.photoSettings && <p className={styles.hint}>{job.photoSettings.quality === "high" ? "High" : "Medium"} quality · {job.photoSettings.size.replace("x", " × ")}{job.elapsedMs != null ? ` · ${(job.elapsedMs / 1000).toFixed(1)} seconds to generate` : ""}</p>}{job.error && <p className={styles.hint}>{job.error}</p>}<div className={styles.sampleActions}>{job.url && <><a href={job.url + "&download=1"}>Download</a>{job.kind === "image" && job.imageAssetId && <button type="button" disabled={busy || active} onClick={()=>{setModel(current=>current === "kling" ? "kling" : "infinitetalk");setPresenterSource(null);setImage({id:job.imageAssetId!,name:job.model === "holding" ? "Prepared product presenter" : "Saved presenter photo",needsReview:job.model === "holding"});setProductReviewed(false);invalidate();setMessage("Presenter photo selected. Review it above before creating the video.");}}>Use as presenter photo</button>}{job.kind === "video" && job.campaignId && job.contentItemId && <><button type="button" disabled={busy} onClick={() => useForPost(job)}>Use for campaign post</button><a href={`/studio/reels?campaignId=${encodeURIComponent(job.campaignId)}&contentItemId=${encodeURIComponent(job.contentItemId)}`}>Open reel editor</a></>}{job.kind === "audio" && job.audioAssetId && <button type="button" disabled={busy} onClick={() => { chooseModel(model === "kling" ? "kling" : "infinitetalk"); setVoiceJobId(""); setVoiceMode("text"); setScript(job.prompt); if (job.voiceId) setVoiceId(job.voiceId); setVoiceAccent(job.voiceAccent ?? "original"); setAccentSpeaker(job.accentSpeaker || ""); setVoiceEmotion(job.voiceEmotion ?? "neutral"); setVoiceSpeed(job.voiceSpeed ?? 1); setAudio({id: job.audioAssetId!, name: "Saved AI voice"}); invalidate(); setMessage("Saved voice selected. Add a presenter photo and get the video cost estimate."); }}>Use this voice for video</button>}<label><input type="checkbox" checked={compare.includes(job.id)} disabled={!compare.includes(job.id) && compare.length >= 3} onChange={e => setCompare(current => e.target.checked ? [...current, job.id].slice(-3) : current.filter(id => id !== job.id))}/>Compare</label></>}{["running", "saving"].includes(job.status) && <button disabled={busy} onClick={() => check(job)}>Check progress</button>}</div></article>)}</div>{compare.length > 0 && <button type="button" onClick={() => {setCompare([]);setCompareOnly(false);}}>Show all samples</button>}
    </section>
  </div>;
}
