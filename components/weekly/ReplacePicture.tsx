"use client";
import { useEffect, useRef, useState } from "react";
import type { WeeklyItem } from "@/lib/weekly/types";
import styles from "./weekly.module.css";

type Photo = { id: string; src: string; label: string };
export default function ReplacePicture({ item, onClose, onSaved }: { item: WeeklyItem; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), fileInput = useRef<HTMLInputElement>(null);
  const [snapshot] = useState(item);
  const [photos, setPhotos] = useState<Photo[]>([]), [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null), [file, setFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null), [pending, setPending] = useState(false), [error, setError] = useState("");
  const endpoint = `/api/weekly/items/${encodeURIComponent(item.id)}/picture`;
  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    fetch(endpoint, { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load saved pictures.");
      setPhotos(data.photos);
    }).catch(error => { if (error.name !== "AbortError") setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint]);
  useEffect(() => {
    if (!file) { setUploadPreview(null); return; }
    const url = URL.createObjectURL(file); setUploadPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function close() { if (!pending) { dialog.current?.close(); onClose(); } }
  function chooseFile(next?: File) {
    setError("");
    if (!next) return;
    if (!next.size || next.size > 3_000_000 || !["image/jpeg", "image/png", "image/webp"].includes(next.type)) {
      setError("Choose a JPEG, PNG or WebP picture up to 3 MB."); if (fileInput.current) fileInput.current.value = ""; return;
    }
    setSelected(null); setFile(next);
  }
  async function save() {
    if (!file && !selected) return;
    setPending(true); setError("");
    try {
      let body: BodyInit, headers: HeadersInit | undefined;
      if (file) { const form = new FormData(); form.set("photo", file); form.set("expectedMediaUrl", snapshot.mediaUrl || ""); body = form; }
      else { headers = { "Content-Type": "application/json" }; body = JSON.stringify({ assetId: selected, expectedMediaUrl: snapshot.mediaUrl }); }
      const response = await fetch(endpoint, { method: "POST", headers, body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not replace the picture. Try again.");
      dialog.current?.close(); onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not replace this picture."); }
    finally { setPending(false); }
  }
  const choice = uploadPreview || photos.find(photo => photo.id === selected)?.src;
  return <dialog ref={dialog} className={styles.pictureDialog} aria-labelledby={`replace-title-${item.id}`} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className={styles.previewHeader}><h2 id={`replace-title-${item.id}`}>Replace picture</h2><button autoFocus disabled={pending} onClick={close} aria-label="Close picture chooser">Close ✕</button></div>
    <p>The design and wording stay the same. Choose a picture that matches this ad, then review the finished result.</p>
    <div className={styles.pictureUpload}><label htmlFor={`picture-file-${item.id}`}>Upload a picture</label><input ref={fileInput} id={`picture-file-${item.id}`} type="file" accept="image/jpeg,image/png,image/webp" disabled={pending} onChange={event => chooseFile(event.target.files?.[0])} /><small>JPG, PNG or WebP · up to 3 MB</small></div>
    <h3>Saved pictures</h3>
    {loading ? <p role="status">Loading pictures…</p> : photos.length ? <div className={styles.pictureGrid}>{photos.map(photo => <button key={photo.id} className={styles.pictureChoice} aria-pressed={selected === photo.id} disabled={pending} onClick={() => { setSelected(photo.id); setFile(null); setError(""); if (fileInput.current) fileInput.current.value = ""; }}><img src={photo.src} alt="" loading="lazy" /><span>{photo.label}</span></button>)}</div> : <p>No saved pictures yet. Upload one above.</p>}
    {choice && <div className={styles.pictureSelected}><img src={choice} alt="Selected replacement picture" /><span>{file?.name || photos.find(photo => photo.id === selected)?.label}</span></div>}
    {error && <p role="alert" className={styles.notice}>{error}</p>}
    <div className={styles.pictureFooter}><span>{pending ? "Preparing your updated ad…" : "You’ll approve the updated ad again before posting."}</span><button className={styles.primary} disabled={pending || (!selected && !file)} onClick={() => void save()}>{pending ? "Preparing…" : "Use this picture"}</button></div>
  </dialog>;
}
