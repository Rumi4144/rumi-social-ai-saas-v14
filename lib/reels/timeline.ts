export const REEL_STYLES = [
  { value: "product-film", label: "Full-screen product film", description: "Three moving shots fill the screen, with small captions and branding over the final shot." },
  { value: "footage", label: "Clean moving footage", description: "Keep the whole clip visible with its original light and color. Small captions appear only when you add them." },
  { value: "showcase", label: "Cinematic Showcase", description: "Layered photo frames, elegant animated titles, fine accents and smooth transitions. Optional close-ups use the current photo." },
  { value: "boutique", label: "Luxury brand story", description: "Elegant photo frames, oversized editorial headlines and varied scene compositions." },
  { value: "bold", label: "Bold brand story", description: "Strong color panels, large animated headlines and alternating photo layouts." },
  { value: "cinematic", label: "Cinematic close-ups / presenter", description: "A full-screen photo or clip with gentle movement and captions." },
  { value: "editorial", label: "Animated photo collage", description: "Distinct scene photos together. With one photo, a single large panel is used." },
  { value: "gallery", label: "Framed photo gallery", description: "Keep the whole photo visible in a frame with your brand colors." },
  { value: "spotlight", label: "Product spotlight", description: "A centered, uncropped product photo with a soft glow and a clear headline." },
  { value: "minimal", label: "Clean slideshow", description: "One photo per scene with a light background and simple captions." },
  { value: "split", label: "Split-screen details", description: "Two different scene photos side by side, or one large photo when only one is available." },
] as const;
export type ReelStyle = typeof REEL_STYLES[number]["value"];
export const REEL_ANIMATIONS = [
  {value:"gentle",label:"Gentle movement",description:"Slow photo zoom, soft caption entrances and smooth fades. Good for wellness and hypnosis."},
  {value:"pan",label:"Slow pan",description:"Alternate left and right photo movement with smooth scene transitions."},
  {value:"lively",label:"Lively movement",description:"Stronger zoom and sliding transitions for energetic product reels."},
  {value:"none",label:"No animation",description:"Still photos and direct scene cuts."},
] as const;
export type ReelAnimation = typeof REEL_ANIMATIONS[number]["value"];
export type ReelScene = { id: string; src: string; kind: "image" | "video"; headline: string; detail: string; seconds: number; direction?: string };
export type ReelProject = { brand: string; website: string; cta: string; color: string; accent: string; style: ReelStyle; animation?: ReelAnimation; showcaseDetails?: boolean; endingOverlay?: boolean; productSubject?: string; logo?: string; logoThroughout?: boolean; logoPosition?: import("../video/logo").LogoPosition; logoSize?: number; scenes: ReelScene[]; closingSeconds: number };
export const REEL_WIDTH = 1080, REEL_HEIGHT = 1920;
export function distinctSceneIndexes(scenes: ReelScene[], current: number, limit = 3) {
  const seen = new Set<string>(), indexes: number[] = [];
  for (let offset = 0; offset < scenes.length && indexes.length < limit; offset++) {
    const index = (current + offset) % scenes.length, scene = scenes[index];
    if (!seen.has(scene.src)) { seen.add(scene.src); indexes.push(index); }
  }
  return indexes;
}
export function reelDuration(project: ReelProject) { return project.scenes.reduce((sum, scene) => sum + scene.seconds, 0) + project.closingSeconds; }
export function frameAt(project: ReelProject, time: number) {
  let start = 0;
  for (let index = 0; index < project.scenes.length; index++) {
    const scene = project.scenes[index];
    if (time < start + scene.seconds) return { index, start, elapsed: Math.max(0, time - start), progress: Math.max(0, Math.min(1, (time - start) / scene.seconds)), closing: false };
    start += scene.seconds;
  }
  if(project.closingSeconds<=0)return {index:project.scenes.length-1,start,elapsed:project.scenes.at(-1)?.seconds||0,progress:1,closing:false};
  return { index: project.scenes.length - 1, start, elapsed: Math.max(0, time - start), progress: Math.max(0, Math.min(1, (time - start) / project.closingSeconds)), closing: true };
}
export function safeColor(color: string, fallback: string) { return /^#[a-f0-9]{6}$/i.test(color) ? color : fallback; }
export function wrappedLines(text: string, maxWidth: number, measure: (text: string) => number, maxLines = 4): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean), lines: string[] = [];
  let line = "";
  for (const word of words) {
    const parts: string[] = [];
    let part = "";
    for (const letter of word) {
      if (part && measure(part + letter) > maxWidth) { parts.push(part); part = ""; }
      part += letter;
    }
    if (part) parts.push(part);
    for (const piece of parts) {
      const candidate = line ? `${line} ${piece}` : piece;
      if (line && measure(candidate) > maxWidth) { lines.push(line); line = piece; } else line = candidate;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let last = lines[maxLines - 1];
    while (last && measure(last + "…") > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = last + "…";
  }
  return lines;
}
export function recorderMime(supported: (mime: string) => boolean): string | null {
  return ["video/mp4;codecs=avc1.420028,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(supported) || null;
}

/** A closing card is not a finished reel: at least one complete media scene is required. */
export function assertReelHasMedia(project: ReelProject) {
  if (!project.scenes.length || project.scenes.some(scene=>!scene.src?.trim() || !["image","video"].includes(scene.kind) || !Number.isFinite(scene.seconds) || scene.seconds<=0)) throw new Error("Add a photo or clip to every scene before exporting or saving this reel.");
}
