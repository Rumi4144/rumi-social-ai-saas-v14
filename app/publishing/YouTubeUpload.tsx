"use client";

import { useState } from "react";
import { YOUTUBE_CHUNK_SIZE, YOUTUBE_MAX_SIZE } from "./youtube-limits";

export default function YouTubeUpload({ accountName, connectionId }: { accountName: string; connectionId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState("private");
  const [madeForKids, setMadeForKids] = useState(false);
  const [synthetic, setSynthetic] = useState(false);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ videoId: string; privacy: string } | null>(null);

  const storageKey = `rumi-youtube-upload:${connectionId}`;
  function selectFile(selected: File | null) {
    setFile(selected); setUploadId(null); setResult(null); setProgress(0); setMessage("");
    if (!selected) return;
    try {
      const pending = JSON.parse(sessionStorage.getItem(storageKey) || "null");
      if (pending && pending.name === selected.name && pending.size === selected.size && pending.lastModified === selected.lastModified) {
        setUploadId(pending.id); setTitle(pending.title); setDescription(pending.description); setPrivacy(pending.privacy); setMadeForKids(pending.madeForKids); setSynthetic(pending.synthetic);
        setMessage("Previous upload found. Resume it to avoid uploading the same video twice.");
      }
    } catch { /* Uploads also work when browser storage is unavailable. */ }
  }

  async function read(response: Response) {
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || "Upload interrupted. Resume the same upload.");
    return data;
  }

  async function upload() {
    if (!file || !title.trim()) { setMessage("Choose a video and enter its title."); return; }
    if (!file.type.startsWith("video/") || file.size === 0 || file.size > YOUTUBE_MAX_SIZE) { setMessage("Choose a video file up to 2 GB."); return; }
    if (!uploadId && !confirm(`Upload “${title.trim()}” to ${accountName} with ${privacy} visibility?`)) return;
    setBusy(true); setMessage("");
    const id = uploadId || crypto.randomUUID();
    setUploadId(id);
    try { sessionStorage.setItem(storageKey, JSON.stringify({ id, name: file.name, size: file.size, lastModified: file.lastModified, title, description, privacy, madeForKids, synthetic })); } catch { /* Keep in-memory resume available. */ }
    try {
      const started = await read(await fetch("/api/publishing/youtube", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId: id, title, description, privacy, madeForKids, containsSyntheticMedia: synthetic, size: file.size, mimeType: file.type }),
      }));
      if (started.status === "succeeded") { setResult(started.result); setProgress(100); try { sessionStorage.removeItem(storageKey); } catch {} return; }
      let state = await read(await fetch(`/api/publishing/youtube?uploadId=${id}&check=true`, { method: "PUT" }));
      while (!state.done) {
        const offset = state.nextOffset;
        if (!Number.isSafeInteger(offset) || offset < 0 || offset >= file.size) throw new Error("Could not read upload progress. Resume this upload.");
        setProgress(Math.floor(offset / file.size * 100));
        const previous = offset;
        state = await read(await fetch(`/api/publishing/youtube?uploadId=${id}&offset=${offset}`, {
          method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: file.slice(offset, Math.min(offset + YOUTUBE_CHUNK_SIZE, file.size)),
        }));
        if (!state.done && state.nextOffset <= previous) throw new Error("The upload paused. Click Resume upload to try again.");
      }
      setProgress(100); setResult(state); try { sessionStorage.removeItem(storageKey); } catch {}
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload failed.");
    } finally { setBusy(false); }
  }

  return <div className="card" style={{ marginTop: 16 }}>
    <h3>Upload a YouTube video</h3>
    <p>Connected as <strong>{accountName}</strong>. Choose a video file up to 2 GB.</p>
    <p>This new YouTube API project is awaiting an audit. Google restricts its uploads to private viewing until approval.</p>
    <label style={{ display: "block", marginTop: 12 }}>Video file
      <input type="file" accept="video/*" disabled={busy} onChange={e => selectFile(e.target.files?.[0] || null)} />
    </label>
    <label style={{ display: "block", marginTop: 12 }}>Video title
      <input value={title} maxLength={100} disabled={busy || Boolean(uploadId)} onChange={e => setTitle(e.target.value)} />
    </label>
    <label style={{ display: "block", marginTop: 12 }}>Description
      <textarea value={description} maxLength={5000} disabled={busy || Boolean(uploadId)} onChange={e => setDescription(e.target.value)} rows={4} />
    </label>
    <label style={{ display: "block", marginTop: 12 }}>Visibility
      <select value={privacy} disabled={busy || Boolean(uploadId)} onChange={e => setPrivacy(e.target.value)}>
        <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
      </select>
    </label>
    <label style={{ display: "block", marginTop: 12 }}><input type="checkbox" checked={madeForKids} disabled={busy || Boolean(uploadId)} onChange={e => setMadeForKids(e.target.checked)} /> This video is made for kids</label>
    <label style={{ display: "block", marginTop: 12 }}><input type="checkbox" checked={synthetic} disabled={busy || Boolean(uploadId)} onChange={e => setSynthetic(e.target.checked)} /> This video contains realistic altered or synthetic content</label>
    <button type="button" onClick={upload} disabled={busy || !file || !title.trim() || Boolean(result)} style={{ marginTop: 16 }}>
      {busy ? `Uploading… ${progress}%` : uploadId ? "Resume upload" : "Upload to YouTube"}
    </button>
    {uploadId && !busy && !result ? <button type="button" style={{ marginLeft: 12 }} onClick={() => { if (confirm("Start a separate upload? If the previous upload completed, this can create a duplicate video. Try Resume upload first.")) { setUploadId(null); setMessage(""); try { sessionStorage.removeItem(storageKey); } catch {} } }}>Reset upload</button> : null}
    {busy ? <progress aria-label="Video upload progress" value={progress} max={100} style={{ display: "block", marginTop: 12 }} /> : null}
    {message ? <p role="alert">{message}</p> : null}
    {result ? <p role="status">Uploaded to YouTube with <strong>{result.privacy}</strong> visibility. YouTube may still be processing the video. <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(result.videoId)}`} target="_blank" rel="noreferrer">View video</a></p> : null}
  </div>;
}
