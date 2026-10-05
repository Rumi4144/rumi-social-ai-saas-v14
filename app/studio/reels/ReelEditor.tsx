"use client";
import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { drawReel, type ReelMedia } from "@/lib/reels/draw";
import { exportReel, loadReelMedia } from "@/lib/reels/export";
import { frameAt, reelDuration, type ReelProject, type ReelScene, type ReelStyle } from "@/lib/reels/timeline";
import { loadDraft, saveDraft } from "@/lib/reels/drafts";
type Source = { id: string; src: string; kind: "image" | "video"; contentItemId?: string };
type Post = { id: string; headline: string | null; caption: string | null };
const empty: ReelProject = { brand: "", website: "", cta: "Explore more", color: "#132342", accent: "#dec184", style: "editorial", scenes: [], closingSeconds: 3 };

export default function ReelEditor({ initialCampaignId, initialContentItemId, initialCampaigns }: { initialCampaignId: string; initialContentItemId: string; initialCampaigns?: { id: string; title: string }[] }) {
  const [campaigns, setCampaigns] = useState<{ id: string; title: string }[]>(initialCampaigns || []), [campaignId, setCampaignId] = useState(initialCampaignId);
  const [loadingCampaigns, setLoadingCampaigns] = useState(initialCampaigns === undefined), [loadingProject, setLoadingProject] = useState(false);
  const [organizationId, setOrganizationId] = useState(""), [posts, setPosts] = useState<Post[]>([]), [sources, setSources] = useState<Source[]>([]);
  const [project, setProject] = useState<ReelProject>(empty), [contentItemId, setContentItemId] = useState(initialContentItemId);
  const [music, setMusic] = useState(true), [originalAudio, setOriginalAudio] = useState(false), [musicFile, setMusicFile] = useState<File>(), [voiceFile, setVoiceFile] = useState<File>();
  const [rendering, setRendering] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [progress, setProgress] = useState(0), [previewing, setPreviewing] = useState(false);
  const [rendered, setRendered] = useState<Blob>(), [downloadUrl, setDownloadUrl] = useState(""), [savedAsset, setSavedAsset] = useState("");
  const canvas = useRef<HTMLCanvasElement>(null), media = useRef<ReelMedia[]>([]), logo = useRef<HTMLImageElement | undefined>(undefined), playTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const controller = useRef<AbortController | undefined>(undefined), localFiles = useRef(new Map<string, Blob>()), localUrls = useRef(new Set<string>());
  const request = useRef<{ pathname: string; blob: Blob } | undefined>(undefined);
  const draftKey = `${organizationId}:${campaignId}`;
  const ownUrl = (blob: Blob) => { const url = URL.createObjectURL(blob); localUrls.current.add(url); return url; };
  const finishPreview = () => { if (playTimer.current) clearInterval(playTimer.current); playTimer.current = undefined; media.current.forEach(item => { if (item instanceof HTMLVideoElement) item.pause(); }); setPreviewing(false); };

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
  useEffect(() => { if (initialCampaigns === undefined) void refreshCampaigns(); return () => { controller.current?.abort(); if (playTimer.current) clearInterval(playTimer.current); localUrls.current.forEach(URL.revokeObjectURL); }; }, []);
  useEffect(() => {
    if (!campaignId) { setOrganizationId(""); setLoadingProject(false); return; }
    let disposed = false; setLoadingProject(true); finishPreview(); setMessage(""); setProject(empty); setSources([]); setPosts([]); setOrganizationId("");
    fetch(`/api/reels/project?campaignId=${encodeURIComponent(campaignId)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) }).then(async response => {
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not load campaign."); if (disposed) return;
      setOrganizationId(data.organizationId); setSources(data.sources); setPosts(data.posts); setContentItemId(data.posts.some((post: Post) => post.id === initialContentItemId) ? initialContentItemId : data.posts[0]?.id || "");
      const first = data.sources.filter((source: Source) => source.kind === "image").slice(0, 4) as Source[];
      let next: ReelProject = { ...empty, brand: data.brand.name, color: data.brand.color, accent: data.brand.accent, website: data.brand.website, logo: data.brand.logo, scenes: first.map((source, index) => ({ id: crypto.randomUUID(), src: source.src, kind: source.kind, seconds: 4, headline: data.posts.find((post: Post) => post.id === source.contentItemId)?.headline?.slice(0, 120) || (index ? "Discover the details" : data.campaign.title.slice(0, 120)), detail: "" })) };
      setProject(next); setLoadingProject(false);
      const draft = await loadDraft(`${data.organizationId}:${campaignId}`).catch(() => undefined); if (disposed) return;
      localFiles.current.clear(); setMusicFile(undefined); setVoiceFile(undefined); setMusic(true); setOriginalAudio(false);
      if (draft) {
        const restored = new Map<string, string>();
        draft.files.forEach(([old, file]) => { const url = ownUrl(file); restored.set(old, url); localFiles.current.set(url, file); });
        next = { ...draft.project, scenes: draft.project.scenes.map(scene => ({ ...scene, src: restored.get(scene.src) || scene.src })), logo: restored.get(draft.project.logo || "") || draft.project.logo };
        setMusic(draft.music); setOriginalAudio(draft.originalAudio); setMusicFile(draft.musicFile); setVoiceFile(draft.voiceFile);
        if (data.posts.some((post: Post) => post.id === draft.contentItemId)) setContentItemId(draft.contentItemId);
        setMessage("Your saved draft was restored.");
      }
      setProject(next);
    }).catch(error => { if (!disposed) { setMessage(error.message || "Could not open campaign. Try again."); setLoadingProject(false); } });
    return () => { disposed = true; };
  }, [campaignId]);
  const sourceKey = project.scenes.map(scene => `${scene.kind}:${scene.src}`).join("|");
  useEffect(() => {
    finishPreview();
    let disposed = false;
    if (project.scenes.length) loadReelMedia(project).then(loaded => { if (disposed) { loaded.media.forEach(item => { if (item instanceof HTMLVideoElement) { item.pause(); item.removeAttribute("src"); item.load(); } }); return; } media.current = loaded.media; logo.current = loaded.logo; if (canvas.current) drawReel(canvas.current.getContext("2d")!, project, loaded.media, 0.8, loaded.logo); }).catch(error => { if (!disposed) setMessage(error.message); });
    return () => { disposed = true; };
  }, [sourceKey, project.logo]);
  useEffect(() => {
    setRendered(undefined); setSavedAsset(""); request.current = undefined; finishPreview();
    if (canvas.current && media.current.length === project.scenes.length && project.scenes.length) drawReel(canvas.current.getContext("2d")!, project, media.current, 0.8, logo.current);
  }, [project, music, originalAudio, musicFile, voiceFile]);
  useEffect(() => { if (!rendered) { setDownloadUrl(""); return; } const url = URL.createObjectURL(rendered); setDownloadUrl(url); return () => URL.revokeObjectURL(url); }, [rendered]);
  const changeScene = (index: number, patch: Partial<ReelScene>) => setProject(old => ({ ...old, scenes: old.scenes.map((scene, i) => i === index ? { ...scene, ...patch } : scene) }));
  function addSource(source: Source) { if (project.scenes.length >= 6) return; setProject(old => ({ ...old, scenes: [...old.scenes, { id: crypto.randomUUID(), src: source.src, kind: source.kind, headline: "", detail: "", seconds: 4 }] })); }
  function importFile(file?: File) {
    if (!file) return;
    if (file.size > 100_000_000 || !["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"].includes(file.type)) { setMessage("Choose a JPEG, PNG, WebP, MP4 or WebM file up to 100 MB."); return; }
    const src = ownUrl(file); localFiles.current.set(src, file); const source: Source = { id: crypto.randomUUID(), src, kind: file.type.startsWith("video/") ? "video" : "image" }; setSources(old => [source, ...old]); addSource(source);
  }
  async function persist() { try { await saveDraft(draftKey, { project, files: [...localFiles.current.entries()].filter(([src]) => project.scenes.some(scene => scene.src === src) || project.logo === src), music, originalAudio, musicFile, voiceFile, contentItemId }); setMessage("Draft saved in this browser, including your uploaded files."); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save draft."); } }
  function preview() {
    if (previewing) { finishPreview(); return; }
    if (!canvas.current || media.current.length !== project.scenes.length) { setMessage("The scene media is still loading."); return; }
    setPreviewing(true); const started = performance.now(); let previous = -1;
    playTimer.current = setInterval(() => {
      const time = (performance.now() - started) / 1000, frame = frameAt(project, time), current = frame.closing ? -1 : frame.index;
      if (current !== previous) { media.current.forEach((item, index) => { if (item instanceof HTMLVideoElement) { if (index === current) { item.currentTime = 0; item.loop = true; void item.play().catch(() => {}); } else item.pause(); } }); previous = current; }
      if (canvas.current) drawReel(canvas.current.getContext("2d")!, project, media.current, time, logo.current);
      if (time >= reelDuration(project)) finishPreview();
    }, 1000 / 30);
  }
  async function render() {
    finishPreview(); setBusy(true); setRendering(true); setMessage("Exporting your reel. Keep this tab visible until it finishes."); setProgress(0);
    let audio: AudioContext | undefined; controller.current = new AbortController();
    const visibility = () => { if (document.hidden) controller.current?.abort(); }; document.addEventListener("visibilitychange", visibility);
    try { audio = new AudioContext(); await audio.resume(); const blob = await exportReel({ project, canvas: canvas.current!, audioContext: audio, audioFile: musicFile, voiceFile, music, originalAudio, signal: controller.current.signal, progress: setProgress }); setRendered(blob); setProgress(100); setMessage(blob.type === "video/mp4" ? "Your finished MP4 is ready. Watch it before saving or publishing." : "Your finished WebM is ready to download. For Facebook MP4 export, use a recent Chrome or Safari browser."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Export failed."); }
    finally { document.removeEventListener("visibilitychange", visibility); await audio?.close(); controller.current = undefined; setRendering(false); setBusy(false); }
  }
  async function save() {
    if (!rendered || !contentItemId) return; setBusy(true);
    try {
      const ext = rendered.type === "video/mp4" ? "mp4" : "webm";
      if (!request.current || request.current.blob !== rendered) request.current = { pathname: `reels/${organizationId}/${contentItemId}/${crypto.randomUUID()}.${ext}`, blob: rendered };
      const pathname = request.current.pathname;
      setMessage("Saving the finished reel to your private campaign library…");
      const existing = await fetch(`/api/reels/upload?pathname=${encodeURIComponent(pathname)}`);
      const existingData = existing.ok ? await existing.json() : {};
      if (existingData.assetId) { setSavedAsset(existingData.assetId); setMessage("Reel saved. Return to the campaign to review and select it for publishing."); return; }
      await upload(pathname, rendered, { access: "private", contentType: rendered.type, multipart: true, handleUploadUrl: "/api/reels/upload", clientPayload: JSON.stringify({ campaignId, contentItemId, title: project.scenes[0]?.headline || project.brand, duration: reelDuration(project) }) });
      for (let attempt = 0; attempt < 12; attempt++) {
        const response = await fetch(`/api/reels/upload?pathname=${encodeURIComponent(pathname)}`), data = await response.json();
        if (response.ok && data.assetId) { setSavedAsset(data.assetId); setMessage("Reel saved. Return to the campaign to review and select it for publishing."); return; }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      setMessage("Your upload completed. The campaign library is still updating; check the campaign shortly. Keep your downloaded copy.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save reel. Download your copy."); }
    finally { setBusy(false); }
  }
  return <><div className="eyebrow">REEL EDITOR</div><h1>Make a finished reel.</h1><p>Combine real photos, presenter clips or AI scenes with captions, transitions, music and your brand’s closing screen. Editing and export use no AI credits.</p>
    <label>Campaign<select value={campaignId} disabled={busy || loadingCampaigns} onChange={event => setCampaignId(event.target.value)}><option value="">{loadingCampaigns ? "Loading campaigns…" : "Choose campaign"}</option>{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.title}</option>)}</select></label>
    {!organizationId && <p role="status">{loadingCampaigns ? "Loading your campaigns…" : loadingProject ? "Opening campaign…" : message}</p>}
    {!loadingCampaigns && !campaigns.length && <section className="card"><h2>No campaigns available in this workspace</h2><p>Open an existing campaign from the Campaigns page, or create a campaign first to use its photos and save your reel.</p><a href="/campaigns">Open Campaigns</a> · <a href="/create">Create a campaign</a></section>}
    {!organizationId && <button type="button" disabled={loadingCampaigns || loadingProject} onClick={refreshCampaigns}>Refresh campaigns</button>}
    {campaignId && organizationId && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 24, marginTop: 24 }}>
      <section className="card"><h2>Your scenes</h2><fieldset disabled={busy || previewing} style={{ border: 0, padding: 0 }}>
        <label>Visual style<select value={project.style} onChange={event => setProject({ ...project, style: event.target.value as ReelStyle })}><option value="editorial">Animated photo collage</option><option value="cinematic">Cinematic close-ups / presenter</option><option value="gallery">Framed photo gallery</option></select></label>
        {project.scenes.map((scene, index) => <div key={scene.id} style={{ borderTop: "1px solid #7775", marginTop: 20, paddingTop: 14 }}><h3>Scene {index + 1}</h3>
          <label>Photo or clip<select value={scene.src} onChange={event => { const source = sources.find(source => source.src === event.target.value); if (source) changeScene(index, { src: source.src, kind: source.kind }); }}><option value={scene.src}>Current {scene.kind}</option>{sources.map((source, i) => <option key={source.id} value={source.src}>{source.kind === "video" ? "Video clip" : "Photo"} {i + 1}</option>)}</select></label>
          <label>Headline<input value={scene.headline} maxLength={120} onChange={event => changeScene(index, { headline: event.target.value })} /></label>
          <label>Supporting caption<textarea value={scene.detail} maxLength={160} onChange={event => changeScene(index, { detail: event.target.value })} /></label>
          <label>Scene length<select value={scene.seconds} onChange={event => changeScene(index, { seconds: Number(event.target.value) })}>{[3,4,5,6,8,10].map(seconds => <option key={seconds} value={seconds}>{seconds} seconds</option>)}</select></label>
          <button type="button" disabled={index === 0} onClick={() => { const scenes = [...project.scenes]; [scenes[index - 1], scenes[index]] = [scenes[index], scenes[index - 1]]; setProject({ ...project, scenes }); }}>Move earlier</button> <button type="button" onClick={() => setProject({ ...project, scenes: project.scenes.filter((_, i) => i !== index) })}>Remove scene</button>
        </div>)}
        <p>Up to 6 scenes. Short clips loop to fill their scene.</p><button type="button" disabled={project.scenes.length >= 6 || !sources.length} onClick={() => addSource(sources[0])}>Add scene</button>
        <label>Upload a photo or real / AI presenter clip<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={event => importFile(event.target.files?.[0])} /></label>
        <h2>Closing screen</h2><label>Brand name<input value={project.brand} maxLength={80} onChange={event => setProject({ ...project, brand: event.target.value })} /></label><label>Call to action<input value={project.cta} maxLength={70} onChange={event => setProject({ ...project, cta: event.target.value })} /></label><label>Website<input value={project.website} maxLength={140} onChange={event => setProject({ ...project, website: event.target.value })} /></label>
        <label>Brand color<input type="color" value={/^#[a-f0-9]{6}$/i.test(project.color) ? project.color : "#132342"} onChange={event => setProject({ ...project, color: event.target.value })} /></label><label>Accent color<input type="color" value={/^#[a-f0-9]{6}$/i.test(project.accent) ? project.accent : "#dec184"} onChange={event => setProject({ ...project, accent: event.target.value })} /></label>
        <label>Upload brand logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0]; if (!file || file.size > 5_000_000 || !["image/png","image/jpeg","image/webp"].includes(file.type)) { setMessage("Choose a PNG, JPEG or WebP logo under 5 MB."); return; } const src = ownUrl(file); localFiles.current.set(src, file); setProject({ ...project, logo: src }); }} /></label>{project.logo && <button type="button" onClick={() => setProject({ ...project, logo: undefined })}>Remove logo</button>}
        <h2>Sound</h2><label><input type="checkbox" checked={music} onChange={event => setMusic(event.target.checked)} /> Soft original background music</label><label><input type="checkbox" checked={originalAudio} onChange={event => setOriginalAudio(event.target.checked)} /> Keep audio from the video clips</label>
        <label>Your music<input type="file" accept="audio/*" onChange={event => { const file = event.target.files?.[0]; if (file && file.size > 20_000_000) { setMessage("Choose an audio file under 20 MB."); return; } setMusicFile(file); }} /></label>{musicFile && <><p>{musicFile.name}</p><button type="button" onClick={() => setMusicFile(undefined)}>Remove music</button></>}
        <label>Your recorded voiceover<input type="file" accept="audio/*" onChange={event => { const file = event.target.files?.[0]; if (file && file.size > 20_000_000) { setMessage("Choose a voiceover under 20 MB."); return; } setVoiceFile(file); }} /></label>{voiceFile && <><p>{voiceFile.name}</p><button type="button" onClick={() => setVoiceFile(undefined)}>Remove voiceover</button></>}
        <p>Music is a background soundtrack, not a recording of the instrument. Presenter clips keep their uploaded performance; this editor does not generate or lip-sync a new presenter.</p>
        <button type="button" onClick={persist}>Save draft in this browser</button>
      </fieldset></section>
      <section className="card" style={{ alignSelf: "start", position: "sticky", top: 20 }}><h2>Preview · {reelDuration(project)} seconds</h2><canvas ref={canvas} width={1080} height={1920} style={{ width: "100%", maxWidth: 350, background: project.color, borderRadius: 12 }} /><p>1080 × 1920 · vertical reel</p>
        <button type="button" disabled={busy || !project.scenes.length} onClick={preview}>{previewing ? "Stop preview" : "Preview visuals"}</button> <button type="button" disabled={busy || !project.scenes.length || !project.brand.trim()} onClick={render}>Export finished reel</button>
        {rendering && <><progress max={100} value={progress} aria-label="Reel export progress" /><button type="button" onClick={() => controller.current?.abort()}>Cancel export</button></>}
        {downloadUrl && <div style={{ marginTop: 20 }}><video controls playsInline src={downloadUrl} style={{ width: "100%", maxWidth: 350 }} /><p><a href={downloadUrl} download={`finished-reel.${rendered?.type === "video/mp4" ? "mp4" : "webm"}`}>Download finished reel</a></p>
          <label>Save to campaign post<select value={contentItemId} disabled={busy} onChange={event => { setContentItemId(event.target.value); request.current = undefined; setSavedAsset(""); }}>{posts.map(post => <option key={post.id} value={post.id}>{post.headline || "Untitled post"}</option>)}</select></label><button type="button" disabled={busy || !contentItemId || !!savedAsset} onClick={save}>{savedAsset ? "Saved to campaign" : "Save finished reel to campaign"}</button>
        </div>}
        <p role="status">{message}</p><a href={`/campaigns/${campaignId}`}>Return to campaign</a>
      </section>
    </div>}
  </>;
}
