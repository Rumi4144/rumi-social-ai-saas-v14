"use client";
import { useState } from "react";
export default function OpenWorkspace({ organizationId, label = "Open workspace" }: { organizationId: string; label?: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <><button type="button" disabled={busy} onClick={async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/workspaces/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId }), signal: AbortSignal.timeout(15000) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not open workspace.");
      window.location.assign("/dashboard");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not open workspace."); setBusy(false); }
  }}>{busy ? "Opening…" : label}</button>{error && <p role="alert">{error}</p>}</>;
}
