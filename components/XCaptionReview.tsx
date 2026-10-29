"use client";
import { useEffect, useId, useState } from "react";
import { xCaptionMetrics, type XCaptionReview as Review } from "@/lib/x/caption";

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
  return <section aria-label="X caption review" style={{ marginTop: 16 }}>
    <strong>Caption for X</strong>
    <p>A shorter draft is prepared automatically when needed. Your full caption stays unchanged for other platforms. Review this version before approving and posting.</p>
    {state.loading && <p role="status">Preparing X caption…</p>}
    {state.error && <p role="alert">{state.error}</p>}
    <button type="button" onClick={state.refresh} disabled={disabled || state.loading}>Refresh X caption</button>
    {state.draft && <><label htmlFor={id}>Edit X caption</label><textarea id={id} rows={5} value={state.draft.text} disabled={disabled} onChange={event => state.setText(event.target.value)} style={{ display: "block", width: "100%", boxSizing: "border-box" }} /><p role="status">{state.metrics.weightedLength} / 280 characters</p>{!state.metrics.valid && <p role="alert">{state.metrics.weightedLength > 280 ? "Shorten this X caption to 280 characters or fewer." : "Add valid text or select a photo or video."}</p>}</>}
  </section>;
}
