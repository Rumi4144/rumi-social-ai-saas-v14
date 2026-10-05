export type ReelStyle = "editorial" | "cinematic" | "gallery";
export type ReelScene = { id: string; src: string; kind: "image" | "video"; headline: string; detail: string; seconds: number };
export type ReelProject = { brand: string; website: string; cta: string; color: string; accent: string; style: ReelStyle; logo?: string; scenes: ReelScene[]; closingSeconds: number };
export const REEL_WIDTH = 1080, REEL_HEIGHT = 1920;
export function reelDuration(project: ReelProject) { return project.scenes.reduce((sum, scene) => sum + scene.seconds, 0) + project.closingSeconds; }
export function frameAt(project: ReelProject, time: number) {
  let start = 0;
  for (let index = 0; index < project.scenes.length; index++) {
    const scene = project.scenes[index];
    if (time < start + scene.seconds) return { index, start, elapsed: Math.max(0, time - start), progress: Math.max(0, Math.min(1, (time - start) / scene.seconds)), closing: false };
    start += scene.seconds;
  }
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
