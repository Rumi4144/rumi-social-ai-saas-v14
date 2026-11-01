"use client";
import { useEffect, useRef, useState } from "react";
import type { WeeklyItem } from "@/lib/weekly/types";
import styles from "./weekly.module.css";

type Choice = { id: string; label: string; family: string; src: string };
type Library = { choices: Choice[]; currentDesign: string; page: number; pageCount: number; total: number; families: string[] };
export default function ChangeDesign({ item, onClose, onSaved }: { item: WeeklyItem; onClose: () => void; onSaved: () => void }) {
  const [snapshot] = useState(item), dialog = useRef<HTMLDialogElement>(null), request = useRef(0);
  const [library, setLibrary] = useState<Library | null>(null), [page, setPage] = useState(0), [family, setFamily] = useState("");
  const [loading, setLoading] = useState(true), [pending, setPending] = useState(false), [error, setError] = useState("");
  const [selected, setSelected] = useState<Choice | null>(null), [enlarged, setEnlarged] = useState<Choice | null>(null), [enlarging, setEnlarging] = useState(false), [retry, setRetry] = useState(0);
  const endpoint = `/api/weekly/items/${encodeURIComponent(snapshot.id)}/design`;
  function url(extra: Record<string, string>) { return `${endpoint}?${new URLSearchParams({ expectedMediaUrl: snapshot.mediaUrl || "", ...extra })}`; }
  useEffect(() => { dialog.current?.showModal(); return () => { request.current++; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setLibrary(previous => previous && { ...previous, choices: [] }); setError(""); setSelected(null); setEnlarged(null); setEnlarging(false); request.current++;
    fetch(url({ page: String(page), ...(family ? { family } : {}) }), { signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load the designs.");
      if (!controller.signal.aborted) setLibrary(data);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [endpoint, page, family, retry]);
  function close() { if (!pending) { dialog.current?.close(); onClose(); } }
  async function enlarge() {
    if (!selected) return;
    const id = ++request.current; setEnlarging(true); setError("");
    try {
      const response = await fetch(url({ layout: selected.id })); const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not enlarge this preview.");
      if (id === request.current) setEnlarged(data.choices[0]);
    } catch (error) { if (id === request.current) setError(error instanceof Error ? error.message : "Could not enlarge this preview."); }
    finally { if (id === request.current) setEnlarging(false); }
  }
  async function save() {
    if (!selected || selected.id === library?.currentDesign) return;
    setPending(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expectedMediaUrl: snapshot.mediaUrl, layout: selected.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not change this design.");
      dialog.current?.close(); onSaved();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not change this design."); }
    finally { setPending(false); }
  }
  return <dialog ref={dialog} className={`${styles.pictureDialog} ${styles.designDialog}`} aria-labelledby={`design-title-${item.id}`} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === event.currentTarget) close(); }}>
    <div className={styles.previewHeader}><h2 id={`design-title-${item.id}`}>Change design</h2><button autoFocus disabled={pending} onClick={close} aria-label="Close design chooser">Close ✕</button></div>
    <div className={styles.designBody}>
    <p>Choose a new look for this ad. Your photo, logo, wording and planned date stay the same.</p>
    <div className={styles.designToolbar}><label>Design family<select value={family} disabled={pending} onChange={event => { setFamily(event.target.value); setPage(0); }}><option value="">All designs</option>{library?.families.map(value => <option key={value}>{value}</option>)}</select></label><span>{library ? `${library.total} designs` : "90 designs"}</span></div>
    {loading ? <p role="status">Preparing previews with your photo…</p> : <div className={styles.designGrid}>{library?.choices.map(choice => <button key={choice.id} className={styles.pictureChoice} disabled={pending} aria-pressed={selected?.id === choice.id} onClick={() => { request.current++; setSelected(choice); setEnlarged(null); setEnlarging(false); setError(""); }}><img src={choice.src} alt={`${choice.label} preview`} /><span>{choice.label}{choice.id === library.currentDesign ? " · Current design" : ""}</span></button>)}</div>}
    {!loading && !!library?.choices.length && <nav className={styles.designPages} aria-label="Design pages"><button disabled={pending || loading || page === 0} onClick={() => setPage(value => value - 1)}>Previous designs</button><span>Page {library.page + 1} of {library.pageCount}</span><button disabled={pending || loading || page >= library.pageCount - 1} onClick={() => setPage(value => value + 1)}>More designs</button></nav>}
    {selected && <div className={styles.designSelected}><strong>{selected.label}</strong><button disabled={pending || enlarging} onClick={() => enlarged ? setEnlarged(null) : void enlarge()}>{enlarging ? "Opening preview…" : enlarged ? "Close large preview" : "Enlarge selected design"}</button>{enlarged && <img src={enlarged.src} alt={`${enlarged.label} full-size preview`} />}</div>}
    </div>
    {error && <p role="alert" className={styles.notice}>{error} {!pending && <button onClick={() => setRetry(value => value + 1)}>Reload designs</button>}</p>}
    <div className={styles.pictureFooter}><span>{pending ? "Saving your new design…" : "Review and approve the new design before posting. No AI credits used."}</span><button className={styles.primary} disabled={pending || loading || !selected || selected.id === library?.currentDesign} onClick={() => void save()}>{pending ? "Saving…" : "Use this design"}</button></div>
  </dialog>;
}
