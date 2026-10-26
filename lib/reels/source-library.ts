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

function repeatedSceneIndex(project: ReelProject) {
  return project.scenes.findLastIndex((scene, index, scenes) => scenes.findIndex(other => other.src === scene.src) < index);
}

export function hasRoomForReelSource(project: ReelProject) {
  return project.scenes.length < 6 || repeatedSceneIndex(project) >= 0;
}

export function selectReelSource(project: ReelProject, source: ReelSource, id: () => string): ReelProject {
  if (project.scenes.some(scene => scene.src === source.src)) return project;
  if (project.scenes.length < 6) return appendScenes(project, [source], id);
  // A new choice can take a repeated photo's place without losing any scene's
  // captions, timing or identity. Keep at least one scene for every chosen photo.
  const index = repeatedSceneIndex(project);
  return index < 0 ? project : replaceScenePhoto(project, project.scenes[index].id, source);
}

/** Choose up to three distinct photos from the already scoped, available library. */
export function selectThreeReelPhotos(project: ReelProject, sources: ReelSource[], id: () => string): ReelProject {
  const eligible = sources.filter(source => source.kind === "image" && (!project.productSubject || source.productVerified === true || source.src.startsWith("blob:") || project.scenes.some(scene => scene.src === source.src)));
  const ordered = [...project.scenes.flatMap(scene => {
    const source = eligible.find(item => item.src === scene.src);
    return source ? [source] : [];
  }), ...eligible];
  const seen = new Set<string>();
  const chosen = ordered.filter(source => {
    let key = source.src;
    try {
      const url = new URL(source.src, "https://reel.invalid");
      // A saved photo may have both a post URL and a library URL. Those are
      // still one photo, even with different thumbnail or campaign parameters.
      if (url.pathname === "/api/reels/media" && url.searchParams.has("assetId")) key = `asset:${url.searchParams.get("assetId")}`;
      else { url.hash = ""; for (const name of ["width", "height", "w", "h", "fit", "quality", "q"]) url.searchParams.delete(name); url.searchParams.sort(); key = url.toString(); }
    } catch {}
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, 3);
  if (!chosen.length) return project;
  return { ...project, closingSeconds: 3, scenes: chosen.map((source, index) => {
    const existing = project.scenes.find(scene => scene.src === source.src);
    return { ...(existing || { id: id(), headline: "", detail: "" }), src: source.src, kind: "image", seconds: Math.floor(12 / chosen.length) + (index < 12 % chosen.length ? 1 : 0) };
  }) };
}

export function mergeSources(...groups: ReelSource[][]): ReelSource[] {
  return [...new Map(groups.flat().map(source => [source.src, source])).values()];
}

export function restoreLibrary(draft: ReelDraft, restored: Map<string, string>, postId: string, brandId?: string) {
  // Older drafts stored only their scenes. Never revive another post's library.
  const sources: ReelSource[] = draft.sources || draft.project.scenes.map(scene => ({ ...scene, contentItemId: postId, label: "Saved photo or clip" }));
  return mergeSources(sources.filter(source => source.libraryBrandId ? !!brandId && source.libraryBrandId === brandId : !source.contentItemId || source.contentItemId === postId)
    .filter(source => !source.src.startsWith("blob:") || restored.has(source.src))
    .map(source => ({ ...source, contentItemId: source.libraryBrandId ? source.contentItemId : postId, src: restored.get(source.src) || source.src })));
}

export function replaceScenePhoto(project: ReelProject, sceneId: string, source: ReelSource): ReelProject {
  return { ...project, scenes: project.scenes.map(scene => scene.id === sceneId ? { ...scene, src: source.src, kind: source.kind } : scene) };
}
