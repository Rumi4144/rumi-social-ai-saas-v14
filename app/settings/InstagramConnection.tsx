"use client";
import { useState } from "react";

export default function InstagramConnection({ connectionId, accountName, canManage }: { connectionId: string; accountName: string | null; canManage: boolean }) {
  const [message, setMessage] = useState("Saved connection. Check whether Instagram still accepts it.");
  const [busy, setBusy] = useState(false);
  async function check() {
    setBusy(true);
    setMessage("Checking Instagram…");
    try {
      const response = await fetch(`/api/social/instagram/status?connectionId=${encodeURIComponent(connectionId)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      const data = await response.json();
      setMessage(data.message || data.error || "Could not check Instagram. Try again.");
    } catch { setMessage("Could not check Instagram. Try again shortly."); }
    finally { setBusy(false); }
  }
  return <div>
    <p>Instagram account: {accountName ? `@${accountName.replace(/^@/, "")}` : "Saved account"}</p>
    <p role="status" aria-live="polite">{message}</p>
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      <button type="button" disabled={busy} onClick={check}>{busy ? "Checking…" : "Check connection"}</button>
      {canManage && <a className="button" href={`/api/social/instagram/connect?connectionId=${encodeURIComponent(connectionId)}`}>Reconnect Instagram</a>}
    </div>
    {canManage ? <form action="/api/social/instagram/disconnect" method="POST" style={{ marginTop: 12 }} onSubmit={event => {
      if (!window.confirm("Disconnect this Instagram account from Rumi? Pending posts will stop until you reconnect and schedule them again. Posts already on Instagram and your history remain. A post already being sent may still finish.")) event.preventDefault();
    }}>
      <input type="hidden" name="connectionId" value={connectionId}/>
      <button type="submit">Disconnect Instagram</button>
    </form> : <p>Ask a workspace owner or team member to reconnect this account.</p>}
  </div>;
}
