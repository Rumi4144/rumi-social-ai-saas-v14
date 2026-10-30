"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function RetryStep({ organizationId, packId, jobId }: { organizationId: string; packId: string; jobId: string }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""); const router = useRouter();
  async function retry() {
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/admin/weekly/retry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId, packId, jobId }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "This step needs review."); setMessage("Saved work resumed. No new pack charge."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not resume this step."); }
    finally { setBusy(false); }
  }
  return <div><button type="button" disabled={busy} onClick={() => void retry()}>{busy ? "Resuming…" : "Resume saved work"}</button><p role="status">{message}</p></div>;
}
