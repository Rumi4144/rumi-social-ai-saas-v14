"use client";

import { useEffect, useState } from "react";
import type { ActivityPage } from "@/lib/activity/session";

export function duration(seconds: number) {
  if (seconds <= 0) return "0 min";
  if (seconds < 60) return "Less than 1 min";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}
function date(value: string | null) {
  return value ? new Date(value).toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "Not recorded";
}
const colors = { Online: "#dff3e9", Idle: "#fff0c5", Offline: "#edf0f1", "Signed out": "#edf0f1" };

export default function UserActivity() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [data, setData] = useState<ActivityPage | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true, pending = false;
    const controller = new AbortController();
    setData(null); setLoading(true); setError("");
    async function load() {
      if (pending) return;
      pending = true;
      try {
        const response = await fetch(`/api/admin/activity?q=${encodeURIComponent(search)}&page=${page}`, { cache: "no-store", signal: controller.signal });
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || "Could not load activity.");
        if (current) { setData(value); setError(""); }
      } catch (e: any) {
        if (current && e.name !== "AbortError") setError(e.message || "Could not load activity.");
      } finally { pending = false; if (current) setLoading(false); }
    }
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => { current = false; controller.abort(); window.clearInterval(timer); };
  }, [search, page, reload]);

  return <section className="card user-activity">
    <form onSubmit={event => { event.preventDefault(); setPage(0); setSearch(query.trim()); }} className="activity-search">
      <label>Find a person or business<input value={query} onChange={event => setQuery(event.target.value)} maxLength={100} placeholder="Name, email or business" /></label>
      <button type="submit" className="button">Search</button>
      <button type="button" onClick={() => setReload(value => value + 1)}>Refresh</button>
    </form>
    <p className="activity-explanation">Online means recent activity in an open Rumi tab. Idle means no interaction for five minutes or an inactive tab. Offline means no check-in for 90 seconds; it does not confirm a sign-out.</p>
    <p className="activity-explanation">Session span includes idle time and stops at the last check-in or sign-out. Active time is an estimate. Multiple tabs in the same sign-in count once. Each row is a separate sign-in.</p>
    {error && <p role="alert">{error} {data ? "The results below may be out of date." : ""}</p>}
    <p role="status">{loading ? "Loading user activity…" : data ? `Updated ${date(data.updatedAt)} · Times shown in your local time zone · Refreshes every 30 seconds` : "Activity is unavailable."}</p>
    {data && data.rows.length === 0 && <p>{search ? "No recorded sessions match this search." : "No activity has been recorded yet. New sign-ins and visits by signed-in users will appear here."}</p>}
    {!!data?.rows.length && <div className="activity-table-wrap"><table>
      <thead><tr><th scope="col">User / business</th><th scope="col">Status</th><th scope="col">Signed in</th><th scope="col">Last activity</th><th scope="col">Session span</th><th scope="col">Active time (est.)</th></tr></thead>
      <tbody>{data.rows.map(row => <tr key={row.id}>
        <td><strong>{row.userName}</strong>{row.email && <small>{row.email}</small>}<small>{row.business}</small></td>
        <td><span className="activity-status" style={{ background: colors[row.status] }}>{row.status}</span>{row.session.endedAt && <small>{date(row.session.endedAt)}</small>}</td>
        <td>{date(row.session.signedInAt || row.session.trackingStartedAt)}{!row.session.signedInAt && <small>Tracking started; sign-in time unknown</small>}</td>
        <td>{date(row.session.lastActiveAt)}<small>Last seen {date(row.session.lastSeenAt)}</small></td>
        <td>{duration(row.spanSeconds)}</td>
        <td>{duration(row.session.activeSeconds)}</td>
      </tr>)}</tbody>
    </table></div>}
    <div className="activity-pagination">
      <button type="button" disabled={page === 0 || loading} onClick={() => setPage(value => value - 1)}>Newer sessions</button>
      <span>Page {page + 1} · Up to 50 sessions per page</span>
      <button type="button" disabled={!data?.hasMore || loading} onClick={() => setPage(value => value + 1)}>Older sessions</button>
    </div>
    <p className="activity-explanation">Tracking begins with this feature. Earlier session durations are unavailable. Activity estimates describe app use, not work performance.</p>
  </section>;
}
