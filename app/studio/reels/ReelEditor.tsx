"use client";
import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { drawReel, type ReelMedia } from "@/lib/reels/draw";
import { exportReel, loadReelMedia } from "@/lib/reels/export";
import { REEL_STYLES, REEL_ANIMATIONS, frameAt, reelDuration, type ReelProject, type ReelScene, type ReelStyle, type ReelAnimation } from "@/lib/reels/timeline";
import { loadDraft, saveDraft } from "@/lib/reels/drafts";
import WeeklyReels from "./WeeklyReels";
import MusicControls from "./MusicControls";
import ScenePhotoControls from "./ScenePhotoControls";
import PhotoLibraryPicker from "./PhotoLibraryPicker";
import SchedulePostButton from "@/components/SchedulePostButton";
import { DEFAULT_MUSIC_VOLUME, musicSettings, prepareMusic, type MusicChoice } from "@/lib/reels/music";
import styles from "./ReelEditor.module.css";
import { appendScenes, mergeSources, restoreLibrary, uploadSelection, replaceScenePhoto } from "@/lib/reels/source-library";
import {reelDraftKey,selectedPostProject,matchingDraft,type ReelSource} from "@/lib/reels/post-context";
import { reelOperationIsCurrent, autoPlanMatches, automaticMusic, type AutoReelPlan } from "@/lib/reels/automatic";
type Source = ReelSource;
type Post = { id: string; headline: string | null; caption: string | null; visualDirection?: string | null };
const empty: ReelProject = { brand: "", website: "", cta: "Explore more", color: "#132342", accent: "#dec184", style: "editorial", scenes: [], closingSeconds: 3 };

export default function ReelEditor({ initialCampaignId, initialContentItemId, initialCampaigns, quick = false, embedded = false }: { embedded?: boolean; quick?: boolean; initialCampaignId: string; initialContentItemId: string; initialCampaigns?: { id: string; title: string }[] }) {
  const [planning, setPlanning] = useState(false), [planned, setPlanned] = useState(false);
  const planController = useRef<AbortController | undefined>(undefined);
  const selection = useRef("");
  const selectionIdentity = useRef("");
  const selectionRevision = useRef(0);
  const renderedContext = useRef("");
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>(initialCampaigns || []), [campaignId, setCampaignId] = useState(initialCampaignId);
  const [loadingCampaigns, setLoadingCampaigns] = useState(initialCampaigns === undefined), [loadingProject, setLoadingProject] = useState(false);
  const [organizationId, setOrganizationId] = useState(""), [posts, setPosts] = useState<Post[]>([]), [sources, setSources] = useState<Source[]>([]);
  const [project, setProject] = useState<ReelProject>(empty), [contentItemId, setContentItemId] = useState(initialContentItemId);
  const [savedReels, setSavedReels] = useState<Array<{id: string; contentItemId: string}>>([]);
  const [requestedPostId,setRequestedPostId]=useState(initialContentItemId);
  const [music, setMusic] = useState(true), [originalAudio, setOriginalAudio] = useState(false), [musicFile, setMusicFile] = useState<File>(), [voiceFile, setVoiceFile] = useState<File>();
  const [musicStyle, setMusicStyle] = useState<MusicChoice>("ambient"), [musicVolume, setMusicVolume] = useState(DEFAULT_MUSIC_VOLUME);
  const [loadingPhotos, setLoadingPhotos] = useState(false), [photoMessage, setPhotoMessage] = useState(""), [productUrl, setProductUrl] = useState("");
  const photoController = useRef<AbortController | undefined>(undefined);
  const [rendering, setRendering] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [progress, setProgress] = useState(0), [previewing, setPreviewing] = useState(false);
  const [rendered, setRendered] = useState<Blob>(), [downloadUrl, setDownloadUrl] = useState(""), [savedAsset, setSavedAsset] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null), media = useRef<ReelMedia[]>([]), logo = useRef<HTMLImageElement | undefined>(undefined), playTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const previewAudio = useRef<{ context: AudioContext; controller: AbortController; stopMusic?: () => void; voice?: AudioBufferSourceNode } | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined), localFiles = useRef(new Map<string, Blob>()), localUrls = useRef(new Set<string>());
  const request = useRef<{ pathname: string; blob: Blob } | undefined>(undefined);
  const [campaignScenePlan, setCampaignScenePlan] = useState<ReelProject | null>(null);
  const contextIdentity = `${organizationId}:${campaignId}:${requestedPostId || contentItemId}`;
  if (selectionIdentity.current !== contextIdentity) { selectionIdentity.current = contextIdentity; selectionRevision.current += 1; }
  selection.current = `${contextIdentity}:${selectionRevision.current}`;
  const draftKey = reelDraftKey(organizationId,campaignId,contentItemId);
  const ownUrl = (blob: Blob) => { const url = URL.createObjectURL(blob); localUrls.current.add(url); return url; };
  const finishPreview = () => {
    if (playTimer.current) clearInterval(playTimer.current); playTimer.current = undefined;
    const active = previewAudio.current; previewAudio.current = undefined;
    if (active) { active.controller.abort(); active.stopMusic?.(); try { active.voice?.stop(); } catch {} active.voice?.disconnect(); void active.context.close().catch(() => {}); }
    media.current.forEach(item => { if (item instanceof HTMLVideoElement) { item.pause(); item.muted = true; } });
    setPreviewing(false);
  };
  useEffect(() => {
    const hidden = () => { if (document.hidden) finishPreview(); };
    document.addEventListener("visibilitychange", hidden);
    return () => { document.removeEventListener("visibilitychange", hidden); finishPreview(); };
  }, []);

  async function refreshCampaigns() {
    setLoadingCampaigns(true); setMessage("");
    try {
      const response = await fetch("/api/reels/project", { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load campaigns. Try again.");
      setCampaigns(data.campaigns);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load campaigns. Try again."); }
    finally { setLoadingCampaigns(false); }
  }
  useEffect(() => { if (initialCampaigns === undefined) void refreshCampaigns(); return () => { planController.current?.abort(); controller.current?.abort(); photoController.current?.abort(); if (playTimer.current) clearInterval(playTimer.current); localUrls.current.forEach(URL.revokeObjectURL); }; }, []);
  useEffect(()=>{setCampaignId(initialCampaignId);setRequestedPostId(initialContentItemId);},[initialCampaignId,initialContentItemId]);
  useEffect(() => {
    planController.current?.abort(); setPlanning(false); setPlanned(false); controller.current?.abort();
    photoController.current?.abort(); photoController.current = undefined; setLoadingPhotos(false); setPhotoMessage(""); setProductUrl("");
    if (!campaignId) { setOrganizationId(""); setLoadingProject(false); return; }
    let disposed = false; setLoadingProject(true); finishPreview(); setMessage(""); setCampaignScenePlan(null); setSavedReels([]); setProject(empty); setSources([]); setPosts([]); setOrganizationId(""); setContentItemId(""); setRendered(undefined); setSavedAsset(""); request.current=undefined;
    fetch(`/api/reels/project?campaignId=${encodeURIComponent(campaignId)}${requestedPostId?`&contentItemId=${encodeURIComponent(requestedPostId)}`:""}`, { cache: "no-store", signal: AbortSignal.timeout(15000) }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load campaign."); if (disposed) return;
      const context=selectedPostProject(data,requestedPostId);
      let next=context.project;
      setCampaignScenePlan(context.project.scenes.some(scene=>scene.direction) ? context.project : null);
      if(context.project.scenes.some(scene=>scene.direction))setMessage("Campaign scenes loaded. Existing photos are placeholders for the planned shots; replace them with your own matching photos or clips.");
      let library: Source[] = data.sources.filter((source: Source) => source.contentItemId === context.post.id);
      const stored = await loadDraft(reelDraftKey(data.organizationId,campaignId,context.post.id)).catch(() => undefined);
      if(disposed)return;
      const draft=matchingDraft(stored,context.post.id);
      localFiles.current.clear(); setMusicFile(undefined); setVoiceFile(undefined); setMusic(true); setMusicStyle("ambient"); setMusicVolume(DEFAULT_MUSIC_VOLUME); setOriginalAudio(false);
      if (draft) {
        const restored = new Map<string, string>();
        draft.files.forEach(([old, file]) => { const url = ownUrl(file); restored.set(old, url); localFiles.current.set(url, file); });
        next = { ...draft.project, scenes: draft.project.scenes.map(scene => ({ ...scene, src: restored.get(scene.src) || scene.src })), logo: restored.get(draft.project.logo || "") || draft.project.logo };
        library = mergeSources(library, restoreLibrary(draft, restored, context.post.id, data.brand.id));
        const sound = musicSettings(draft);
        setMusic(sound.music); setMusicStyle(sound.musicStyle); setMusicVolume(sound.musicVolume); setOriginalAudio(draft.originalAudio); setMusicFile(draft.musicFile); setVoiceFile(draft.voiceFile);

        setMessage("Your saved draft was restored.");
      }
      setSavedReels(data.savedReels || []);setSources(library);setPosts(data.posts);setContentItemId(context.post.id);setProject(next);setOrganizationId(data.organizationId);setLoadingProject(false);
      if(!next.scenes.length)setMessage("This post has no ready matching photo or clip. Finish its photo in the campaign or upload media for this post.");
    }).catch(error => { if (!disposed) { setMessage(error.message || "Could not open campaign. Try again."); setLoadingProject(false); } });
    return () => { disposed = true; };
  }, [campaignId,requestedPostId]);
  const sourceKey = project.scenes.map(scene => `${scene.kind}:${scene.src}`).join("|");
  useEffect(() => {
    finishPreview();
    let disposed = false; media.current = []; logo.current = undefined;
    if (canvas.current) canvas.current.getContext("2d")?.clearRect(0, 0, 1080, 1920);
    if (project.scenes.length) loadReelMedia(project).then(loaded => { if (disposed) { loaded.media.forEach(item => { if (item instanceof HTMLVideoElement) { item.pause(); item.removeAttribute("src"); item.load(); } }); return; } media.current = loaded.media; logo.current = loaded.logo; if (canvas.current) drawReel(canvas.current.getContext("2d")!, project, loaded.media, 0.8, loaded.logo); }).catch(error => { if (!disposed) setMessage(error.message); });
    return () => { disposed = true; };
  }, [sourceKey, project.logo]);
  useEffect(() => {
    setRendered(undefined); setSavedAsset(""); request.current = undefined; finishPreview();
    if (canvas.current && media.current.length === project.scenes.length && project.scenes.length) drawReel(canvas.current.getContext("2d")!, project, media.current, 0.8, logo.current);
  }, [project, music, musicStyle, musicVolume, originalAudio, musicFile, voiceFile]);
  useEffect(() => { if (!rendered) { setDownloadUrl(""); return; } const url = URL.createObjectURL(rendered); setDownloadUrl(url); return () => URL.revokeObjectURL(url); }, [rendered]);
  const changeScene = (index: number, patch: Partial<ReelScene>) => setProject(old => ({ ...old, scenes: old.scenes.map((scene, i) => i === index ? { ...scene, ...patch } : scene) }));
  function addSource(source: Source) {
    setProject(old => appendScenes(old, [source], () => crypto.randomUUID()));
  }
  function importFiles(files: FileList | null) {
    if (!files?.length) return;
    const { selected, invalid, overflow } = uploadSelection([...files], sources.length);
    const added: Source[] = selected.map(file => {
      const src = ownUrl(file); localFiles.current.set(src, file);
      return { id: crypto.randomUUID(), src, kind: file.type.startsWith("video/") ? "video" : "image", contentItemId, label: file.name };
    });
    setSources(old => mergeSources(old, added));
    setProject(old => appendScenes(old, added, () => crypto.randomUUID()));
    setPhotoMessage(`${added.length} file${added.length === 1 ? "" : "s"} added. Up to 6 scenes can be used in one reel.${invalid > 0 ? " Some files were skipped: choose JPEG, PNG, WebP, MP4 or WebM up to 100 MB each." : ""}${overflow > 0 ? " The photo library holds up to 30 items." : ""}`);
  }
  async function loadProductPhotos() {
    photoController.current?.abort();
    const active = new AbortController(); photoController.current = active;
    const deadline = setTimeout(() => active.abort(), 45000);
    setLoadingPhotos(true); setPhotoMessage("Finding photos for this product…");
    try {
      const response = await fetch("/api/reels/photos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignId, contentItemId, ...(productUrl.trim() ? { url: productUrl.trim() } : {}) }), signal: active.signal });
      const data = await response.json();
      if (active.signal.aborted || photoController.current !== active) return;
      if (!response.ok) throw new Error(data.error || "Could not load product photos.");
      const photos = (data.sources as Source[]).filter(source => source.contentItemId === contentItemId);
      setSources(old => mergeSources(old, photos)); setProductUrl(data.sourceUrl);
      setPhotoMessage(`${photos.length} product photo${photos.length === 1 ? "" : "s"} available. Choose Add to reel, or replace a scene’s photo below.`);
    } catch (error) {
      if (photoController.current === active) setPhotoMessage(active.signal.aborted ? "Loading took too long. Try again or upload the photos." : error instanceof Error ? error.message : "Could not load product photos.");
    } finally {
      clearTimeout(deadline);
      if (photoController.current === active) { photoController.current = undefined; setLoadingPhotos(false); }
    }
  }
  async function createAutomatically() {
    if (!organizationId || !contentItemId || busy || planning) return;
    const context = { organizationId, campaignId, contentItemId };
    const key = selection.current;
    const active = new AbortController(); planController.current?.abort(); planController.current = active;
    const timeout = setTimeout(() => active.abort(), 30000);
    setPlanning(true); setPlanned(false); finishPreview(); setRendered(undefined); setSavedAsset(""); request.current = undefined;
    setMessage("Arranging your saved photos and captions…");
    try {
      const response = await fetch("/api/reels/auto-plan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(context), signal: active.signal });
      const data = await response.json();
      if (planController.current !== active || !reelOperationIsCurrent(key, selection.current, active.signal)) return;
      if (!response.ok) throw new Error(data.error || "Could not create this reel draft.");
      if (!autoPlanMatches(data, context)) throw new Error("This draft belongs to a different post. Select your post and try again.");
      const plan = data as AutoReelPlan;
      setProject(plan.project); setSources(plan.sources); setMusic(true); setMusicStyle(automaticMusic(plan.brand.name)); setMusicVolume(DEFAULT_MUSIC_VOLUME); setMusicFile(undefined); setVoiceFile(undefined); setOriginalAudio(false);
      setPlanned(plan.project.scenes.length > 0);
      setMessage([...plan.warnings, plan.project.scenes.length ? "Draft ready. Preview the photos and captions, then export your finished reel." : "Add a matching saved photo to this post in the campaign, then try again."].join(" "));
    } catch (error) {
      if (planController.current === active && reelOperationIsCurrent(key, selection.current)) setMessage(active.signal.aborted ? "Draft creation stopped. Try again." : error instanceof Error ? error.message : "Could not create reel draft.");
    } finally {
      clearTimeout(timeout);
      if (planController.current === active) { planController.current = undefined; setPlanning(false); }
    }
  }
  async function persist() {
    try {
      await saveDraft(draftKey, { project, sources, files: [...localFiles.current.entries()].filter(([src]) => sources.some(source => source.src === src) || project.scenes.some(scene => scene.src === src) || project.logo === src), music, musicStyle, musicVolume, originalAudio, musicFile, voiceFile, contentItemId });
      setMessage("Draft saved in this browser, including your photo library and uploaded files.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save draft."); }
  }
  async function preview() {
    if (previewing) { finishPreview(); return; }
    if (!canvas.current || media.current.length !== project.scenes.length) { setMessage("The scene media is still loading."); return; }
    const active = { context: new AudioContext(), controller: new AbortController(), stopMusic: undefined as (() => void) | undefined, voice: undefined as AudioBufferSourceNode | undefined };
    previewAudio.current = active; setPreviewing(true); setMessage("Preparing preview with your selected sound…");
    try {
      await active.context.resume();
      const beginMusic = await prepareMusic(active.context, active.context.destination, { music, musicStyle, musicVolume, musicFile }, reelDuration(project), active.controller.signal);
      if (voiceFile) {
        const buffer = await active.context.decodeAudioData(await voiceFile.arrayBuffer());
        if (active.controller.signal.aborted || previewAudio.current !== active) return;
        const voice = active.context.createBufferSource(), gain = active.context.createGain();
        voice.buffer = buffer; gain.gain.value = .85; voice.connect(gain).connect(active.context.destination); active.voice = voice;
      }
      if (active.controller.signal.aborted || previewAudio.current !== active) return;
      active.stopMusic = beginMusic(); active.voice?.start();
      setMessage("Playing your reel with the selected sound.");
    } catch (error) {
      if (previewAudio.current === active) { finishPreview(); setMessage(error instanceof Error ? error.message : "Could not play preview audio. Choose another sound and try again."); }
      return;
    }
    const started = performance.now(); let previous = -1;
    playTimer.current = setInterval(() => {
      const time = (performance.now() - started) / 1000, frame = frameAt(project, time), current = frame.closing ? -1 : frame.index;
      if (current !== previous) { media.current.forEach((item, index) => { if (item instanceof HTMLVideoElement) { item.muted = !originalAudio; item.volume = .65; if (index === current) { item.currentTime = 0; item.loop = true; void item.play().catch(() => {}); } else item.pause(); } }); previous = current; }
      if (canvas.current) drawReel(canvas.current.getContext("2d")!, project, media.current, time, logo.current);
      if (time >= reelDuration(project)) finishPreview();
    }, 1000 / 30);
  }
  async function render() {
    const key = selection.current;
    finishPreview(); setBusy(true); setRendering(true); setMessage("Exporting your reel. Keep this tab visible until it finishes."); setProgress(0);
    let audio: AudioContext | undefined; controller.current = new AbortController();
    const visibility = () => { if (document.hidden) controller.current?.abort(); }; document.addEventListener("visibilitychange", visibility);
    try { audio = new AudioContext(); await audio.resume(); const blob = await exportReel({ project, canvas: canvas.current!, audioContext: audio, audioFile: musicFile, voiceFile, music, musicStyle, musicVolume, originalAudio, signal: controller.current.signal, progress: value => { if (reelOperationIsCurrent(key, selection.current, controller.current?.signal)) setProgress(value); } }); if (!reelOperationIsCurrent(key, selection.current, controller.current.signal)) return; renderedContext.current = key; setRendered(blob); setProgress(100); setMessage(blob.type === "video/mp4" ? "Your finished MP4 is ready. Watch it before saving or publishing." : "Your finished WebM is ready to download. For Facebook MP4 export, use a recent Chrome or Safari browser."); }
    catch (error) { if (reelOperationIsCurrent(key, selection.current)) setMessage(error instanceof Error ? error.message : "Export failed."); }
    finally { document.removeEventListener("visibilitychange", visibility); await audio?.close(); controller.current = undefined; setRendering(false); setBusy(false); }
  }
  async function save() {
    if (!rendered || !contentItemId || busy || loadingProject || renderedContext.current !== selection.current) return; const key = selection.current; setBusy(true);
    try {
      const ext = rendered.type === "video/mp4" ? "mp4" : "webm";
      if (!request.current || request.current.blob !== rendered) request.current = { pathname: `reels/${organizationId}/${contentItemId}/${crypto.randomUUID()}.${ext}`, blob: rendered };
      const pathname = request.current.pathname;
      setMessage("Saving the finished reel to your private campaign library…");
      const existing = await fetch(`/api/reels/upload?pathname=${encodeURIComponent(pathname)}`);
      const existingData = existing.ok ? await existing.json() : {};
      if (!reelOperationIsCurrent(key, selection.current)) return;
      if (existingData.assetId) { setSavedAsset(existingData.assetId); setMessage("Reel saved. Choose your account and posting time below."); return; }
      await upload(pathname, rendered, { access: "private", contentType: rendered.type, multipart: true, handleUploadUrl: "/api/reels/upload", clientPayload: JSON.stringify({ campaignId, contentItemId, title: project.scenes[0]?.headline || project.brand, duration: reelDuration(project) }) });
      if (!reelOperationIsCurrent(key, selection.current)) return;
      for (let attempt = 0; attempt < 12; attempt++) {
        const response = await fetch(`/api/reels/upload?pathname=${encodeURIComponent(pathname)}`), data = await response.json();
        if (!reelOperationIsCurrent(key, selection.current)) return;
        if (response.ok && data.assetId) { setSavedAsset(data.assetId); setMessage("Reel saved. Choose your account and posting time below."); return; }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      setMessage("Your upload completed. The campaign library is still updating; check the campaign shortly. Keep your downloaded copy.");
    } catch (error) { if (reelOperationIsCurrent(key, selection.current)) setMessage(error instanceof Error ? error.message : "Could not save reel. Download your copy."); }
    finally { setBusy(false); }
  }
  const readyAsset = savedAsset && rendered?.type === "video/mp4" ? savedAsset : !rendered && !rendering && !planning ? savedReels.find(asset => asset.contentItemId === contentItemId)?.id : undefined;
  return <div className={styles.editor}><div className="eyebrow">{quick ? "AUTOMATIC REEL" : "REEL EDITOR"}</div>{embedded ? <h3>Create and post your reel</h3> : <h1>Make a finished reel.</h1>}{quick ? <p>Choose a campaign post. We arrange its saved photos, captions, music and branding into a reel. Review it, export it, then choose your accounts and posting time here. No subscription or AI credits needed.</p> : <><p>Combine real photos, presenter clips or AI scenes with captions, transitions, music and your brand’s closing screen. Editing and export use no AI credits.</p><p><a href="/studio/reels/quick">Create reel automatically</a></p></>}
    {!embedded && <label>Campaign<select aria-label="Campaign" value={campaignId} disabled={busy || loadingPhotos || loadingCampaigns} onChange={event => {setRequestedPostId("");setCampaignId(event.target.value);}}><option value="">{loadingCampaigns ? "Loading campaigns…" : "Choose campaign"}</option>{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}</select></label>}
    {!organizationId && <p role="status">{loadingCampaigns ? "Loading your campaigns…" : loadingProject ? "Opening campaign…" : message}</p>}
    {!loadingCampaigns && !campaigns.length && <section className="card"><h2>No campaigns available in this workspace</h2><p>Open an existing campaign from the Campaigns page, or create a campaign first to use its photos and save your reel.</p><a href="/campaigns">Open Campaigns</a> · <a href="/create">Create a campaign</a></section>}
    {!organizationId && <button type="button" disabled={loadingCampaigns || loadingProject} onClick={refreshCampaigns}>Refresh campaigns</button>}
    {campaignId && organizationId && <section className="card">
      <label>Campaign post<select aria-label="Campaign post" value={contentItemId} disabled={busy || loadingProject || loadingPhotos} onChange={event => setRequestedPostId(event.target.value)}>{posts.map(post => <option key={post.id} value={post.id}>{post.headline || "Untitled post"}</option>)}</select></label>
      {quick && <><button type="button" disabled={busy || loadingProject || planning || !contentItemId} onClick={createAutomatically}>{planning ? "Creating draft…" : "Create reel draft"}</button>{planning && <button type="button" onClick={() => planController.current?.abort()}>Cancel draft creation</button>}<p>Uses only saved photos and existing captions. Review your media rights before export. Saving keeps the reel private until you choose to publish it.</p></>}
    </section>}
    {campaignId && organizationId && <div className={styles.layout}>
      <section className="card">{quick && <><h2>Your automatic draft</h2><p>{planned ? `${project.scenes.length} scenes arranged with your brand’s closing screen.` : "Create a draft above to arrange the reel automatically."}</p><h3>Sound</h3><MusicControls music={music} musicStyle={musicStyle} musicVolume={musicVolume} musicFile={musicFile} disabled={busy || previewing || planning} onMusic={setMusic} onStyle={setMusicStyle} onVolume={setMusicVolume} onFile={setMusicFile} /></>}<details open={quick ? undefined : true}><summary>{quick ? "Adjust photos, captions and branding" : "Your scenes"}</summary>{campaignScenePlan && <><p>The campaign’s scene timings and short on-screen text are available. Photos are placeholders until you choose matching media.</p><button type="button" disabled={busy || previewing || loadingPhotos || planning} onClick={()=>{setProject(campaignScenePlan);setRendered(undefined);setSavedAsset("");request.current=undefined;setMessage("Campaign scene plan applied. Review each photo or clip before export.");}}>Use campaign scene plan</button></>}<fieldset disabled={busy || previewing || loadingPhotos || planning} style={{ border: 0, padding: 0 }}>
        <label>Visual style<select value={project.style} onChange={event => setProject({ ...project, style: event.target.value as ReelStyle })}>{REEL_STYLES.map(style => <option key={style.value} value={style.value}>{style.label}</option>)}</select></label>
        <p className={styles.hint}>{REEL_STYLES.find(style => style.value === project.style)?.description}</p>
        <label>Animation<select value={project.animation || "gentle"} onChange={event=>setProject({...project,animation:event.target.value as ReelAnimation})}>{REEL_ANIMATIONS.map(animation=><option key={animation.value} value={animation.value}>{animation.label}</option>)}</select></label>
        <p className={styles.hint}>{REEL_ANIMATIONS.find(animation=>animation.value===(project.animation || "gentle"))?.description} Applies to every scene automatically. No AI credits needed.</p>
        <h3>Photos and clips for this post</h3>
        <p className={styles.hint}>Reuse saved campaign photos, load this product’s gallery or upload your own photos. Add different photos to separate scenes; collages use those photos together.</p>
        <PhotoLibraryPicker key={`${campaignId}:${contentItemId}:library`} organizationId={organizationId} campaignId={campaignId} disabled={busy || previewing || loadingPhotos || project.scenes.length >= 6} onPhoto={source=>{setSources(old=>mergeSources(old,[source]));addSource(source);}} />
        <button type="button" disabled={loadingPhotos} onClick={loadProductPhotos}>{loadingPhotos ? "Loading photos…" : "Load product photos"}</button>
        <details><summary>Choose a product page</summary><label>Product page address<input type="url" placeholder="https://your-website.com/product/…" value={productUrl} onChange={event => setProductUrl(event.target.value)} /></label><p className={styles.hint}>Use this brand’s website. Leave blank to find the product link in the selected post.</p></details>
        <label>Upload photos or presenter clips<input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={event => { importFiles(event.target.files); event.target.value = ""; }} /></label>
        <p role="status" className={styles.hint}>{photoMessage}</p>
        <div className={styles.library}>{sources.map((source, index) => <div key={source.id} className={styles.photo}>
          {source.kind === "image" ? <img src={source.src} alt={source.label || `Photo ${index + 1}`} loading="lazy" /> : <video src={source.src} muted playsInline preload="metadata" aria-label={source.label || `Clip ${index + 1}`} />}
          <p>{source.label || `${source.kind === "image" ? "Photo" : "Clip"} ${index + 1}`}</p>
          <button type="button" disabled={project.scenes.length >= 6} onClick={() => addSource(source)} aria-label={`Add ${source.label || `item ${index + 1}`} to reel`}>{project.scenes.some(scene => scene.src === source.src) ? "Add again" : "Add to reel"}</button>
        </div>)}</div>
        {project.scenes.length === 1 && <p className={styles.hint}>One photo selected. It appears once in the collage. Add another photo for a multi-photo layout.</p>}
        {project.scenes.map((scene, index) => <div key={scene.id} style={{ borderTop: "1px solid #7775", marginTop: 20, paddingTop: 14 }}><h3>Scene {index + 1}</h3>
          <PhotoLibraryPicker key={`${campaignId}:${contentItemId}:${scene.id}`} organizationId={organizationId} campaignId={campaignId} selectedSrc={scene.src} disabled={busy || previewing || loadingPhotos || planning} onPhoto={source=>{setSources(old=>mergeSources(old,[source]));setProject(old=>replaceScenePhoto(old,scene.id,source));}} />
          <ScenePhotoControls organizationId={organizationId} campaignId={campaignId} contentItemId={contentItemId} sceneId={scene.id} sceneNumber={index+1} direction={scene.direction ?? `${scene.headline}. ${scene.detail}`} disabled={busy || previewing || loadingPhotos || planning} onBusy={setBusy} onDirection={direction=>changeScene(index,{direction})} onPhoto={source=>{setSources(old=>mergeSources(old,[source]));setProject(old=>({...old,scenes:old.scenes.map(item=>item.id===scene.id?{...item,src:source.src,kind:"image"}:item)}));setRendered(undefined);setSavedAsset("");request.current=undefined;}}/>
          <label>Photo or clip<select value={scene.src} onChange={event => { const source = sources.find(source => source.src === event.target.value); if (source) changeScene(index, { src: source.src, kind: source.kind, seconds: scene.seconds }); }}>{!sources.some(source => source.src === scene.src) && <option value={scene.src}>Current {scene.kind}</option>}{sources.map((source, i) => <option key={source.id} value={source.src}>{source.label || `${source.kind === "video" ? "Video clip" : "Photo"} ${i + 1}`}</option>)}</select></label>
          {scene.direction && <p><strong>Planned shot:</strong> {scene.direction}</p>}
          <label>Headline<input value={scene.headline} maxLength={120} onChange={event => changeScene(index, { headline: event.target.value })} /></label>
          <label>Supporting caption<textarea value={scene.detail} maxLength={160} onChange={event => changeScene(index, { detail: event.target.value })} /></label>
          <label>Scene length<select value={scene.seconds} onChange={event => changeScene(index, { seconds: Number(event.target.value) })}>{Array.from({length:15},(_,index)=>index+1).map(seconds => <option key={seconds} value={seconds}>{seconds} seconds</option>)}</select></label>
          <button type="button" disabled={index === 0} onClick={() => { const scenes = [...project.scenes]; [scenes[index - 1], scenes[index]] = [scenes[index], scenes[index - 1]]; setProject({ ...project, scenes }); }}>Move earlier</button> <button type="button" onClick={() => setProject({ ...project, scenes: project.scenes.filter((_, i) => i !== index) })}>Remove scene</button>
        </div>)}
        <p>Up to 6 scenes. Short clips loop to fill their scene.</p><button type="button" disabled={project.scenes.length >= 6 || !sources.length} onClick={() => addSource(sources.find(source => !project.scenes.some(scene => scene.src === source.src)) || sources[0])}>Add scene</button>
        <h2>Closing screen</h2><label>Closing screen length<select value={project.closingSeconds} onChange={event=>setProject({...project,closingSeconds:Number(event.target.value)})}>{[0,1,2,3,4,5].map(seconds=><option key={seconds} value={seconds}>{seconds===0 ? "No separate closing screen" : `${seconds} seconds`}</option>)}</select></label><label>Brand name<input value={project.brand} maxLength={80} onChange={event => setProject({ ...project, brand: event.target.value })} /></label><label>Call to action<input value={project.cta} maxLength={70} onChange={event => setProject({ ...project, cta: event.target.value })} /></label><label>Website<input value={project.website} maxLength={140} onChange={event => setProject({ ...project, website: event.target.value })} /></label>
        <label>Brand color<input type="color" value={/^#[a-f0-9]{6}$/i.test(project.color) ? project.color : "#132342"} onChange={event => setProject({ ...project, color: event.target.value })} /></label><label>Accent color<input type="color" value={/^#[a-f0-9]{6}$/i.test(project.accent) ? project.accent : "#dec184"} onChange={event => setProject({ ...project, accent: event.target.value })} /></label>
        <label>Upload brand logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; if (!file || file.size > 5_000_000 || !["image/png","image/jpeg","image/webp"].includes(file.type)) { setMessage("Choose a PNG, JPEG or WebP logo under 5 MB."); return; } const src = ownUrl(file); localFiles.current.set(src, file); setProject({ ...project, logo: src }); }} /></label>{project.logo && <button type="button" onClick={() => setProject({ ...project, logo: undefined })}>Remove logo</button>}
        <h2>Sound</h2><MusicControls key={contentItemId} music={music} musicStyle={musicStyle} musicVolume={musicVolume} musicFile={musicFile} disabled={busy || previewing || loadingPhotos || planning} onMusic={setMusic} onStyle={setMusicStyle} onVolume={setMusicVolume} onFile={setMusicFile} />
        <label><input type="checkbox" checked={originalAudio} onChange={event => setOriginalAudio(event.target.checked)} /> Keep audio from the video clips</label>
        <label>Your recorded voiceover<input type="file" accept="audio/*" onChange={event => { const file = event.target.files?.[0]; if (file && file.size > 20_000_000) { setMessage("Choose a voiceover under 20 MB."); return; } setVoiceFile(file); }} /></label>{voiceFile && <><p>{voiceFile.name}</p><button type="button" onClick={() => setVoiceFile(undefined)}>Remove voiceover</button></>}
        <p>Music is a background soundtrack, not a recording of the instrument. Presenter clips keep their audio when “Keep audio” is selected. Create a new presenter in the AI presenter studio.</p>
        <button type="button" onClick={persist}>Save draft in this browser</button>
      </fieldset></details></section>
      <section className={`card ${styles.preview}`}><h2>Preview · {reelDuration(project)} seconds</h2><canvas ref={canvas} width={1080} height={1920} style={{ width: "100%", maxWidth: 350, background: project.color, borderRadius: 12 }} /><p>1080 × 1920 · vertical reel</p>
        <button type="button" disabled={busy || planning || loadingProject || loadingPhotos || (quick && !planned) || !project.scenes.length} onClick={preview}>{previewing ? "Stop preview" : "Preview reel with sound"}</button> <button type="button" disabled={busy || planning || loadingProject || loadingPhotos || (quick && !planned) || !project.scenes.length || !project.brand.trim()} onClick={render}>Export finished reel</button>
        {rendering && <><progress max={100} value={progress} aria-label="Reel export progress" /><button type="button" onClick={() => controller.current?.abort()}>Cancel export</button></>}
        {downloadUrl && <div style={{ marginTop: 20 }}><video controls playsInline src={downloadUrl} style={{ width: "100%", maxWidth: 350 }} /><p><a href={downloadUrl} download={`finished-reel.${rendered?.type === "video/mp4" ? "mp4" : "webm"}`}>Download finished reel</a></p>
          <p>Save to: {posts.find(post => post.id === contentItemId)?.headline || "Selected post"}</p><button type="button" disabled={busy || !contentItemId || !!savedAsset} onClick={save}>{savedAsset ? "Reel saved" : "Save reel and continue to posting"}</button>
          {savedAsset && rendered?.type !== "video/mp4" && <p>Download this version, or export an MP4 using a recent Chrome or Safari browser to post from this page.</p>}
        </div>}
          {readyAsset && <section key={`${contentItemId}:${readyAsset}`} aria-label="Post this reel" style={{ marginTop: 20 }}>
            <h3>{savedAsset ? "Ready to post" : "Previously saved reel · ready to post"}</h3>{!downloadUrl && <video controls playsInline src={`/api/video/media/${readyAsset}`} style={{ width: "100%", maxWidth: 350 }} />}<p>{project.brand}</p><p><strong>Caption</strong></p><p style={{ whiteSpace: "pre-wrap" }}>{posts.find(post => post.id === contentItemId)?.caption || posts.find(post => post.id === contentItemId)?.headline}</p>
            <SchedulePostButton contentItemId={contentItemId} initialStatus="approved" isVideo openByDefault allowPostNow beforeSchedule={async () => {
              const post = posts.find(post => post.id === contentItemId);
              if (!post?.headline) throw new Error("Reopen this reel to review its post title.");
              const response = await fetch("/api/reels/prepare-publishing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, contentItemId, assetId: readyAsset, headline: post.headline, caption: post.caption }) });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error || "Could not prepare this reel for posting.");
            }} />
            <p><a href="/publishing">Check posting status</a></p>
          </section>}
        <p role="status">{message}</p>{!embedded && <a href={`/campaigns/${campaignId}`}>Return to campaign</a>}
      </section>
    </div>}
    {!quick && campaignId && organizationId && <><a href={`/studio/presenters?campaignId=${encodeURIComponent(campaignId)}`}>Create an AI presenter with a real product photo</a><WeeklyReels key={campaignId} project={project} campaignId={campaignId} organizationId={organizationId} music={music} musicStyle={musicStyle} musicVolume={musicVolume} originalAudio={originalAudio} musicFile={musicFile} voiceFile={voiceFile}/></>}
  </div>;
}
