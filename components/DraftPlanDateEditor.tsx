"use client";
import { useState } from "react";

export default function DraftPlanDateEditor({ contentItemId, scheduledFor }: { contentItemId: string; scheduledFor: string | null }) {
  const [open, setOpen] = useState(false), [date, setDate] = useState(scheduledFor?.slice(0, 10) || "");
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  async function save(plannedDate: string | null) {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/content-items/${encodeURIComponent(contentItemId)}/planned-date`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plannedDate, expectedScheduledFor: scheduledFor }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update this draft's date.");
      window.location.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not update this draft's date."); setSaving(false); }
  }
  if (!open) return <><button type="button" onClick={() => setOpen(true)}>Change draft date</button>{" "}<a href={`/admin/drafts/${encodeURIComponent(contentItemId)}`}>Open saved post</a></>;
  return <section aria-label="Draft date" style={{ width: "100%", marginTop: 12 }}>
    <p>This changes the draft's place in the weekly list. Publishing still requires approval and a separate posting action.</p>
    <label htmlFor={`draft-date-${contentItemId}`}>Planned date</label>{" "}
    <input id={`draft-date-${contentItemId}`} type="date" value={date} disabled={saving} onChange={event => setDate(event.target.value)} />
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
      <button type="button" disabled={saving || !date} onClick={() => void save(date)}>Save draft date</button>
      {scheduledFor && <button type="button" disabled={saving} onClick={() => void save(null)}>Keep in Admin only</button>}
      <button type="button" disabled={saving} onClick={() => { setDate(scheduledFor?.slice(0, 10) || ""); setError(""); setOpen(false); }}>Cancel</button>
    </div>
    <p>“Keep in Admin only” removes this draft from the customer’s weekly list. Its photos, text and history stay in this campaign, and Admin can assign another date later.</p>
    {error && <p role="alert">{error}</p>}
  </section>;
}
