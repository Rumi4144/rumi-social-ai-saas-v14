import { drawReel, type ReelMedia } from "./draw";
import { recorderMime, reelDuration, REEL_WIDTH, REEL_HEIGHT, type ReelProject } from "./timeline";
import { prepareMusic, type MusicSettings } from "./music";

export async function loadReelMedia(project: ReelProject): Promise<{ media: ReelMedia[]; logo?: HTMLImageElement }> {
  const image = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const item = new Image(); item.crossOrigin = "anonymous"; item.onload = () => resolve(item); item.onerror = () => reject(new Error("One image could not be loaded. Choose another image.")); item.src = src; });
  const media = await Promise.all(project.scenes.map(scene => scene.kind === "image" ? image(scene.src) : new Promise<HTMLVideoElement>((resolve, reject) => {
    const item = document.createElement("video"); item.crossOrigin = "anonymous"; item.muted = true; item.playsInline = true; item.preload = "auto";
    item.onloadeddata = () => resolve(item); item.onerror = () => reject(new Error("One clip could not be loaded. Choose another MP4 clip.")); item.src = scene.src; item.load();
  })));
  return { media, logo: project.logo ? await image(project.logo) : undefined };
}

export async function exportReel(input: MusicSettings & { project: ReelProject; canvas: HTMLCanvasElement; audioContext: AudioContext; audioFile?: File; voiceFile?: File; originalAudio: boolean; signal: AbortSignal; progress: (percent: number) => void }): Promise<Blob> {
  if (typeof MediaRecorder === "undefined" || !input.canvas.captureStream) throw new Error("This browser cannot export reels. Use a recent Chrome or Safari browser.");
  const mime = recorderMime(type => MediaRecorder.isTypeSupported(type));
  if (!mime) throw new Error("This browser does not support reel recording. Use Chrome or Safari.");
  const duration = reelDuration(input.project), sources: AudioBufferSourceNode[] = [];
  const { media, logo } = await loadReelMedia(input.project);
  const canvas = input.canvas; canvas.width = REEL_WIDTH; canvas.height = REEL_HEIGHT;
  const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Reel preview unavailable.");
  const destination = input.audioContext.createMediaStreamDestination();
  let stopMusic = () => {}, stream: MediaStream | undefined, recorder: MediaRecorder | undefined, timer: ReturnType<typeof setInterval> | undefined;
  const mediaAudio: MediaElementAudioSourceNode[] = [];
  const volumes: GainNode[] = [];
  try {
    const beginMusic = await prepareMusic(input.audioContext, destination, { ...input, musicFile: input.audioFile }, duration, input.signal);
    for (const [file, volume] of [[input.voiceFile, 0.85]] as const) {
      if (!file) continue;
      const buffer = await input.audioContext.decodeAudioData(await file.arrayBuffer());
      const source = input.audioContext.createBufferSource(), gain = input.audioContext.createGain();
      source.buffer = buffer; gain.gain.value = volume; source.connect(gain).connect(destination); sources.push(source);
    }
    for (const item of media) if (item instanceof HTMLVideoElement && input.originalAudio) {
      const source = input.audioContext.createMediaElementSource(item), gain = input.audioContext.createGain(); gain.gain.value = 0;
      source.connect(gain).connect(destination); item.muted = false; mediaAudio.push(source); volumes.push(gain);
    }
    if (input.signal.aborted) throw new Error("Export cancelled.");
    drawReel(ctx, input.project, media, 0, logo);
    stream = canvas.captureStream(30);
    if (input.music || sources.length || mediaAudio.length) destination.stream.getAudioTracks().forEach(track => stream!.addTrack(track));
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 });
    const parts: Blob[] = [];
    const done = new Promise<Blob>((resolve, reject) => {
      recorder!.ondataavailable = event => { if (event.data.size) parts.push(event.data); };
      recorder!.onerror = () => reject(new Error("Reel export failed. Try a shorter reel or close other tabs."));
      recorder!.onstop = () => input.signal.aborted ? reject(new Error("Export cancelled.")) : resolve(new Blob(parts, { type: mime.split(";")[0] }));
    });
    let activeIndex = -1;
    const { frameAt } = await import("./timeline");
    const started = performance.now();
    recorder.start(500);
    sources.forEach(source => source.start());
    stopMusic = beginMusic();
    timer = setInterval(() => {
      const time = Math.min(duration, (performance.now() - started) / 1000), frame = frameAt(input.project, time);
      const nextIndex = frame.closing ? -1 : frame.index;
      if (nextIndex !== activeIndex) {
        let audioIndex = 0;
        for (let index = 0; index < media.length; index++) if (media[index] instanceof HTMLVideoElement) {
          const video = media[index] as HTMLVideoElement;
          if (index === nextIndex) { video.currentTime = 0; video.loop = true; void video.play().catch(() => {}); } else video.pause();
          if (input.originalAudio) volumes[audioIndex++].gain.value = index === nextIndex ? 0.65 : 0;
        }
        activeIndex = nextIndex;
      }
      drawReel(ctx, input.project, media, time, logo); input.progress(Math.floor(time / duration * 100));
      if (time >= duration || input.signal.aborted) { clearInterval(timer); timer = undefined; if (recorder?.state === "recording") recorder.stop(); }
    }, 1000 / 30);
    const blob = await done;
    if (!blob.size) throw new Error("The browser produced an empty reel. Try again.");
    return blob;
  } finally {
    if (timer) clearInterval(timer);
    if (recorder?.state === "recording") recorder.stop();
    stream?.getTracks().forEach(track => track.stop()); stopMusic();
    sources.forEach(source => { try { source.stop(); } catch {} source.disconnect(); });
    mediaAudio.forEach(source => source.disconnect()); volumes.forEach(gain => gain.disconnect());
    media.forEach(item => { if (item instanceof HTMLVideoElement) { item.pause(); item.removeAttribute("src"); item.load(); } });
  }
}
