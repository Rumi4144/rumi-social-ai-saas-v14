"use client";

import { upload } from "@vercel/blob/client";
import { useRef, useState } from "react";

type Props = { brandId: string; brandName: string; onSaved: () => void };
type Prepared = { campaignId: string; contentItemId: string; pathname: string; saved: boolean };

async function read(response: Response) {
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || "Could not save your reel.");
  return result;
}

async function request(body: object) {
  return read(await fetch("/api/extras/upload-reel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

function durationOf(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(url);
    video.preload = "metadata";
    video.onloadedmetadata = () => { cleanup(); resolve(video.duration); };
    video.onerror = () => { cleanup(); reject(new Error("This video could not be read. Choose a playable MP4.")); };
    video.src = url;
  });
}

export default function UploadReel({ brandId, brandName, onSaved }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const active = useRef(false);

  async function submit(form: HTMLFormElement) {
    if (active.current) return;
    const fields = new FormData(form);
    const file = fields.get("video");
    const title = String(fields.get("title") || "").trim();
    const caption = String(fields.get("caption") || "").trim();
    setError("");
    setMessage("");
    if (!(file instanceof File) || file.type !== "video/mp4" || !file.size || file.size > 100_000_000) {
      setError("Choose an MP4 up to 100 MB.");
      return;
    }
    const key = JSON.stringify([brandId, title, caption, file.name, file.size, file.lastModified]);
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    const requestId = attempt.current.id;
    active.current = true;
    setBusy(true);
    try {
      const duration = await durationOf(file);
      if (!Number.isFinite(duration) || duration < 3 || duration > 90) throw new Error("Choose a video between 3 and 90 seconds.");
      const draft: Prepared = await request({ action: "prepare", brandId, requestId, title, caption });
      if (!draft.saved) {
        const check = async () => (await read(await fetch("/api/reels/upload?pathname=" + encodeURIComponent(draft.pathname), { cache: "no-store" }))).assetId as string | undefined;
        let assetId = await check();
        if (!assetId) {
          setMessage("Uploading and checking your video…");
          let uploadError: unknown;
          try {
            await upload(draft.pathname, file, {
              access: "private", contentType: "video/mp4", multipart: true, handleUploadUrl: "/api/reels/upload",
              clientPayload: JSON.stringify({ campaignId: draft.campaignId, contentItemId: draft.contentItemId, title, duration, sceneCount: 1 }),
            });
          } catch (reason) { uploadError = reason; }
          for (let index = 0; index < 15 && !assetId; index++) {
            assetId = await check();
            if (!assetId) await new Promise(resolve => setTimeout(resolve, 1200));
          }
          if (!assetId) throw uploadError || new Error("The video is still being verified. Retry with the same file.");
        }
        await request({ action: "finish", brandId, requestId, assetId });
      }
      attempt.current = null;
      form.reset();
      setMessage("Reel saved. Review and approve it under Your extra creations.");
      onSaved();
    } catch (reason) {
      setMessage("");
      setError(reason instanceof Error ? reason.message : "Could not save your reel.");
    } finally {
      active.current = false;
      setBusy(false);
    }
  }

  return <details>
    <summary>Upload existing video</summary>
    <p>Upload a finished MP4 for {brandName}. It will be saved for review.</p>
    <form onSubmit={event => { event.preventDefault(); void submit(event.currentTarget); }}>
      <fieldset disabled={busy}>
        <label>Video file<input type="file" name="video" accept="video/mp4,.mp4" required /></label>
        <label>Post title<input name="title" maxLength={160} required /></label>
        <label>Caption<textarea name="caption" maxLength={5000} rows={3} /></label>
        <button type="submit">{busy ? "Saving video…" : "Save reel for review"}</button>
      </fieldset>
    </form>
    {message && <p role="status">{message}</p>}
    {error && <p role="alert">{error}</p>}
  </details>;
}
