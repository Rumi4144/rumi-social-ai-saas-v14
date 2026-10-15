"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function ClientControls({ organizationId, choices, existing }: { organizationId: string; choices: { id: string; name: string }[]; existing?: { id: string; clientOrganizationId: string; displayName: string } }) {
  const router = useRouter(), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  async function send(method: "POST" | "DELETE", body: object) {
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/agency/clients", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ organizationId, ...body }), signal: AbortSignal.timeout(15000) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save client."); setMessage(method === "DELETE" ? "Client unlinked. Its workspace and media are unchanged." : "Client saved."); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save client."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={event => { event.preventDefault(); const values = new FormData(event.currentTarget); void send("POST", { clientOrganizationId: existing?.clientOrganizationId || values.get("client"), displayName: values.get("name") }); }}><fieldset disabled={busy} style={{ border: 0, padding: 0 }}>{!existing && <label>Client workspace<select name="client" required defaultValue=""><option value="" disabled>Choose an accessible workspace</option>{choices.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}<label>Client display name<input name="name" defaultValue={existing?.displayName || ""} minLength={2} maxLength={100} required /></label><button type="submit">{busy ? "Saving…" : existing ? "Save client name" : "Link client workspace"}</button>{existing && <button type="button" onClick={() => void send("DELETE", { id: existing.id })}>Unlink client</button>}</fieldset><p role="status">{message}</p></form>;
}
