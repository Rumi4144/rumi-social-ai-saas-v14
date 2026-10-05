import type { ReelProject } from "./timeline";
export type ReelDraft = { project: ReelProject; files: [string, Blob][]; musicFile?: File; voiceFile?: File; music: boolean; originalAudio: boolean; contentItemId: string };
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("social-reel-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error("Draft storage unavailable in this browser."));
  });
}
export async function saveDraft(key: string, draft: ReelDraft) {
  const db = await database();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction("drafts", "readwrite"); tx.objectStore("drafts").put(draft, key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(new Error("Could not save draft. Browser storage may be full.")); }); } finally { db.close(); }
}
export async function loadDraft(key: string): Promise<ReelDraft | undefined> {
  const db = await database();
  try { return await new Promise((resolve, reject) => { const request = db.transaction("drafts").objectStore("drafts").get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error("Could not load draft.")); }); } finally { db.close(); }
}
