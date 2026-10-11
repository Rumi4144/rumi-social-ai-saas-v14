import type { ReelSource } from "./post-context";
import type { ReelDraft } from "./drafts";
import type { ReelProject } from "./timeline";

export function uploadSelection<T extends { size: number; type: string }>(files: T[], currentCount: number) {
  const valid = files.filter(file => file.size <= 100_000_000 && ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"].includes(file.type));
  const selected = valid.slice(0, Math.max(0, 30 - currentCount));
  return { selected, invalid: files.length - valid.length, overflow: valid.length - selected.length };
}

export function appendScenes(project: ReelProject, sources: ReelSource[], id: () => string): ReelProject {
  return { ...project, scenes: [...project.scenes, ...sources.slice(0, Math.max(0, 6 - project.scenes.length)).map(source => ({ id: id(), src: source.src, kind: source.kind, headline: "", detail: "", seconds: source.seconds || 4 }))] };
}

export function mergeSources(...groups: ReelSource[][]): ReelSource[] {
  return [...new Map(groups.flat().map(source => [source.src, source])).values()];
}

export function restoreLibrary(draft: ReelDraft, restored: Map<string, string>, postId: string) {
  // Older drafts stored only their scenes. Never revive another post's library.
  const sources = draft.sources || draft.project.scenes.map(scene => ({ ...scene, contentItemId: postId, label: "Saved photo or clip" }));
  return mergeSources(sources.filter(source => !source.contentItemId || source.contentItemId === postId)
    .filter(source => !source.src.startsWith("blob:") || restored.has(source.src))
    .map(source => ({ ...source, contentItemId: postId, src: restored.get(source.src) || source.src })));
}
