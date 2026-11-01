"use client";
import { useEffect, useId, useState } from "react";
import { xCaptionMetrics, type XCaptionReview as Review } from "@/lib/x/caption";
import styles from "./PostOptions.module.css";

type Draft = { contentItemId: string; sourceText: string; text: string; hasMedia: boolean };
export function useXCaptionReview(contentItemId: string, enabled: boolean) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    if (!enabled) { setDraft(null); setLoading(false); return; }
    const controller = new AbortController();
    setDraft(null); setLoading(true); setError("");
    void (async () => {
      try {
        const response = await fetch(`/api/content-items/${encodeURIComponent(contentItemId)}/x-caption`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Could not prepare the X caption.");
        if (data.contentItemId !== contentItemId || typeof data.text !== "string" || typeof data.sourceText !== "string") throw new Error("Reload the X caption before posting.");
        if (!controller.signal.aborted) setDraft(data);
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not prepare the X caption.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [contentItemId, enabled, refreshKey]);
  const current = draft?.contentItemId === contentItemId ? draft : null;
  const metrics = xCaptionMetrics(current?.text || "", current?.hasMedia);
  const ready = Boolean(current && metrics.valid && !loading && !error);
  return { draft: current, loading, error, ready, metrics, refresh: () => setRefreshKey(value => value + 1),
    setText: (text: string) => setDraft(value => value?.contentItemId === contentItemId ? { ...value, text } : value),
    review: ready && current ? { text: current.text, sourceText: current.sourceText, approved: true } as Review : undefined };
}

export default function XCaptionReview({ state, disabled = false }: { state: ReturnType<typeof useXCaptionReview>; disabled?: boolean }) {
  const id = useId();
  return <section aria-label="X caption review" className={styles.options}>
    <strong>Caption for X</strong>
    {state.loading && <p role="status">Preparing X caption…</p>}
    {state.error && <><p role="alert">{state.error}</p><button type="button" onClick={state.refresh} disabled={disabled || state.loading}>Retry X caption</button></>}
    {state.draft && <>
      <p className={styles.caption}>{state.draft.text || "Media only"}</p>
      <details>
        <summary>Edit caption</summary>
        <div className={styles.editor}>
          <label htmlFor={id}>Edit X caption</label>
          <textarea id={id} rows={4} value={state.draft.text} disabled={disabled} onChange={event => state.setText(event.target.value)} />
          <span role="status">{state.metrics.weightedLength} / 280 characters</span>
          <button type="button" onClick={state.refresh} disabled={disabled || state.loading}>Reset X caption</button>
        </div>
      </details>
      {!state.metrics.valid && <p role="alert">{state.metrics.weightedLength > 280 ? "Shorten this X caption to 280 characters or fewer." : "Add valid text or select a photo or video."}</p>}
    </>}
  </section>;
}
