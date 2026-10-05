"use client";
import { useState } from "react";
export default function UseCampaignVideo({ assetId, contentItemId, selected }: { assetId: string; contentItemId: string; selected: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function choose() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/video/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId, contentItemId }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not select video.");
      window.location.reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not select video."); }
    finally { setBusy(false); }
  }
  return <div><button type="button" disabled={busy || selected} onClick={choose}>{selected ? "Video selected for publishing" : busy ? "Selecting…" : "Use video for this post"}</button><p>Approve this post again after choosing its video. Facebook will publish the clip; download it for other platforms.</p>{error && <p role="alert">{error}</p>}</div>;
}
