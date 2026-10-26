"use client";
import {useEffect, useRef, useState} from "react";
import {z} from "zod";

let database: Promise<IDBDatabase> | undefined;
function openDatabase() {
  return database ||= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("rumi-workflow-drafts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { database = undefined; reject(new Error("Browser storage is unavailable.")); };
  });
}
let pending = Promise.resolve();
export function writeBrowserDraft(key: string, value: unknown): Promise<void> {
  const next = pending.catch(() => {}).then(async () => {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("drafts", "readwrite");
      transaction.objectStore("drafts").put({version: 1, savedAt: Date.now(), value}, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(new Error("Your draft could not be saved in this browser."));
    });
  });
  pending = next;
  return next;
}
async function readBrowserDraft(key: string) {
  await pending.catch(() => {});
  const db = await openDatabase();
  return new Promise<unknown>((resolve, reject) => {
    const request = db.transaction("drafts").objectStore("drafts").get(key);
    request.onsuccess = () => {
      const row = request.result;
      resolve(row?.version === 1 && Date.now() - row.savedAt < 30 * 86400_000 ? row.value : undefined);
    };
    request.onerror = () => reject(new Error("Could not restore your saved draft."));
  });
}

// Keys come from the authenticated user/workspace, never from a URL or browser storage.
// Approval is deliberately excluded by callers; restoring a draft cannot start paid work.
export function useBrowserDraft<T>(key: string | undefined, value: T, schema: z.ZodType<T>, restore: (value: T) => void) {
  const [loadedKey, setLoadedKey] = useState<string>();
  const [message, setMessage] = useState("");
  const restoreRef = useRef(restore); restoreRef.current = restore;
  const serialized = JSON.stringify(value);
  useEffect(() => {
    let active = true;
    setLoadedKey(undefined);
    if (!key) return;
    setMessage("Checking for a saved draft…");
    readBrowserDraft(key).then(stored => {
      if (!active) return;
      const parsed = schema.safeParse(stored);
      if (parsed.success) { restoreRef.current(parsed.data); setMessage("Your saved draft was restored. Review it before continuing."); }
    }).catch(() => active && setMessage("Draft storage is unavailable. Keep this page open until you finish."))
      .finally(() => active && setLoadedKey(key));
    return () => { active = false; };
  }, [key, schema]);
  useEffect(() => {
    if (!key || key !== loadedKey) return;
    let active = true;
    setMessage("Saving draft…");
    writeBrowserDraft(key, JSON.parse(serialized)).then(() => active && setMessage("Draft saved in this browser."))
      .catch(() => active && setMessage("Draft could not be saved. Keep this page open; browser storage may be full."));
    return () => { active = false; };
  }, [key, loadedKey, serialized]);
  return {ready: !!key && loadedKey === key, message, save: async (next = value) => {
    if (!key || key !== loadedKey) throw new Error("Wait for your saved draft to load.");
    try {
      await writeBrowserDraft(key, next);
      setMessage("Draft saved in this browser.");
    } catch (error) {
      setMessage("Draft could not be saved. Keep this page open; browser storage may be full.");
      throw error;
    }
  }};
}
