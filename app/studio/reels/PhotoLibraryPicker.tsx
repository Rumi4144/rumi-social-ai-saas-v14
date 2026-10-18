"use client";
import { useEffect, useState } from "react";
import type { ReelSource } from "@/lib/reels/post-context";
import styles from "./ReelEditor.module.css";
type LibraryPhoto = ReelSource & { thumbnail: string; campaignTitle: string };

export default function PhotoLibraryPicker({ organizationId, campaignId, selectedSrc, disabled, onPhoto, purpose = "scene" }: { organizationId: string; campaignId: string; selectedSrc?: string; disabled: boolean; onPhoto: (source: ReelSource) => void; purpose?: "post" | "scene" }) {
  const [open, setOpen] = useState(false), [search, setSearch] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(1);
  const [photos, setPhotos] = useState<LibraryPhoto[]>([]), [hasMore, setHasMore] = useState(false), [loading, setLoading] = useState(false), [message, setMessage] = useState(""), [brand, setBrand] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    let disposed = false;
    setLoading(true); setPhotos([]); setHasMore(false); setMessage("");
    const params = new URLSearchParams({ organizationId, campaignId, q: query, page: String(page), ...(purpose === "post" ? {includeArchived:"1"} : {}) });
    fetch(`/api/reels/library?${params}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load your photos.");
      if (!disposed) { setPhotos(data.sources); setHasMore(data.hasMore); setBrand(data.brandName); }
    }).catch(error => { if (!disposed) setMessage(controller.signal.aborted ? "Loading took too long. Try again." : error.message || "Could not load your photos."); })
      .finally(() => { clearTimeout(timer); if (!disposed) setLoading(false); });
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [open, organizationId, campaignId, query, page, reload, purpose]);
  return <div>
    <button type="button" disabled={disabled} aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? "Close photo library" : "Choose from past campaign photos"}</button>
    {open && <section aria-label="Past campaign photos" className={styles.pastLibrary}>
      <p>Reuse photos from {brand || "this business"}’s campaigns. No generation credits needed.</p>
      <label>Search photos or campaign names<input value={search} maxLength={120} placeholder="For example: relaxation, confidence, ocean…" disabled={disabled} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); setQuery(search.trim()); setPage(1); setReload(value => value + 1); } }} /></label>
      <button type="button" disabled={disabled || loading} onClick={() => { setQuery(search.trim()); setPage(1); setReload(value => value + 1); }}>Search photos</button>
      <p role="status">{loading ? "Loading your photos…" : message || (!photos.length ? "No saved photos found. Try another search or generate a new scene photo." : purpose === "post" ? "Choose a saved photo to use for this post." : "Choose a photo to use for this scene.")}</p>
      {message && <button type="button" disabled={disabled || loading} onClick={() => setReload(value => value + 1)}>Try again</button>}
      <div className={styles.library}>{photos.map(photo => <div className={styles.photo} key={photo.id}>
        <img src={photo.thumbnail} alt={photo.label || "Campaign photo"} loading="lazy" />
        <p>{photo.label}</p><p>{photo.campaignTitle}</p>
        <button type="button" disabled={disabled} aria-pressed={selectedSrc === photo.src} onClick={() => { onPhoto(photo); setOpen(false); }}>{selectedSrc === photo.src ? "Selected photo" : purpose === "post" ? "Use for this post" : "Use for this scene"}</button>
      </div>)}</div>
      {!loading && !message && <div className={styles.actions}>
        <button type="button" disabled={disabled || page === 1} onClick={() => setPage(value => value - 1)}>Previous photos</button>
        <span>Page {page}</span>
        <button type="button" disabled={disabled || !hasMore} onClick={() => setPage(value => value + 1)}>Next photos</button>
      </div>}
    </section>}
  </div>;
}
