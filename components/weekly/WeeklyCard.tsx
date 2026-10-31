"use client";
import { useRef, useState } from "react";
import { CalendarDays, Check, Download, MoreHorizontal, ZoomIn } from "lucide-react";
import SchedulePostButton from "@/components/SchedulePostButton";
import type { WeeklyItem } from "@/lib/weekly/types";
import { fullyPublished, lockedDeliveryStatuses } from "./item-policy";
import styles from "./weekly.module.css";

const platformNames: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", google_business: "Google Business Profile", youtube: "YouTube", tiktok: "TikTok", x: "X" };

export default function WeeklyCard({ item, canManage, onChanged, onFinish, busy = false }: { item: WeeklyItem; canManage: boolean; onChanged: () => void; onFinish?: (item: WeeklyItem) => void; busy?: boolean }) {
  const [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const [changesOpen, setChangesOpen] = useState(false), [comment, setComment] = useState("");
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false), [dateOpen, setDateOpen] = useState(false);
  const [dateDraft, setDateDraft] = useState(item.plannedDate || item.date);
  const preview = useRef<HTMLDialogElement>(null);
  const published = fullyPublished(item.status, item.deliveries);
  const approved = published || ["approved", "scheduled", "published"].includes(item.status);
  const locked = ["scheduled", "published"].includes(item.status) || item.deliveries.some(delivery => lockedDeliveryStatuses.includes(delivery.status));
  const excludedAccounts = item.deliveries.filter(delivery => lockedDeliveryStatuses.includes(delivery.status)).map(delivery => delivery.connectionId);
  const title = item.changeRequest ? "Changes requested" : item.needsAttention ? "Needs attention" : published ? "Posted" : item.status === "scheduled" ? "Scheduled" : approved ? "Approved" : item.isReady ? "Ready to review" : "Being prepared";
  const plannedDate = item.plannedDate || item.date;
  const canEditDate = canManage && item.canChangeDate && !locked;
  const formattedDate = new Date(`${plannedDate.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

  async function saveDate() {
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/weekly/items/${encodeURIComponent(item.id)}/date`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plannedDate: dateDraft, expectedDate: plannedDate }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save the date.");
      setDateOpen(false); setMessage("Planned date saved. Use Post or schedule to arrange delivery."); onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save the date."); }
    finally { setPending(false); }
  }

  async function review(action: "approve" | "request_changes") {
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/weekly/items/${encodeURIComponent(item.id)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "approve" ? { action, headline: item.headline, caption: item.caption, mediaUrl: item.mediaUrl } : { action, comment }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || "Could not save your review.");
      setMessage(action === "approve" ? "Approved. You can download, post or schedule it." : "Your changes have been sent to Admin.");
      setChangesOpen(false); onChanged();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save your review."); }
    finally { setPending(false); }
  }

  async function download() {
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/weekly/items/${encodeURIComponent(item.id)}/download`);
      if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || "Could not download this post."); }
      const blob = await response.blob(), url = URL.createObjectURL(blob), anchor = document.createElement("a");
      const extension = blob.type.startsWith("video/") ? "mp4" : "jpg";
      const name = response.headers.get("content-disposition")?.match(/filename="?([^";]+)/)?.[1];
      anchor.href = url; anchor.download = name || `rumi-${item.date}-${item.id}.${extension}`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000); setMessage("Download ready. Copy the caption to post it yourself.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not download this post."); }
    finally { setPending(false); }
  }

  return <article className={styles.post} aria-label={item.headline || "Your next post"} data-testid={`weekly-post-${item.id}`}>
    <div className={styles.media}>
      {item.mediaKind === "video" && item.previewUrl ? <video src={item.previewUrl} controls preload="metadata" playsInline aria-label={`Preview ${item.headline}`} /> : item.previewUrl ? <button className={styles.imageButton} aria-haspopup="dialog" aria-label={`Enlarge image: ${item.headline}`} onClick={() => preview.current?.showModal()}><img src={item.previewUrl} alt={item.headline || "Post preview"} loading="lazy" /><span className={styles.enlarge}><ZoomIn size={16} aria-hidden="true" /><span>Enlarge</span></span></button> : <div className={styles.placeholder}><strong>{item.kind === "image" ? "Your design is on its way" : "Your video is not finished yet"}</strong><span>Finished media will appear here.</span></div>}
      {item.kind !== "image" && item.mediaKind !== "video" && !item.isReady && <span className={styles.unfinished}>Source photo · video not finished</span>}
    </div>
    <div className={styles.postBody}>
      <div className={styles.dateRow}>
        {canEditDate ? <button className={styles.dateButton} disabled={pending || busy} aria-label={`Change planned date: ${item.headline}`} aria-expanded={dateOpen} onClick={() => { setDateDraft(plannedDate); setDateOpen(!dateOpen); }}><CalendarDays size={15} aria-hidden="true" /><span><small>Planned date</small>{formattedDate}</span></button> : <span className={styles.savedDate}><CalendarDays size={15} aria-hidden="true" /><span><small>Planned date</small><time dateTime={plannedDate}>{formattedDate}</time></span></span>}
        <span className={styles.badge} data-attention={item.needsAttention || undefined}>{title}</span>
      </div>
      {dateOpen && canEditDate && <form className={styles.dateForm} onSubmit={event => { event.preventDefault(); void saveDate(); }}><label htmlFor={`date-${item.id}`}>Planned post date</label><input id={`date-${item.id}`} type="date" value={dateDraft} onChange={event => setDateDraft(event.target.value)} required disabled={pending} /><p>Choose when you plan to post. This does not start automatic posting.</p><div><button className={styles.primary} disabled={pending || busy || !dateDraft}>Save date</button><button type="button" disabled={pending} onClick={() => setDateOpen(false)}>Cancel</button></div></form>}
      <div className={styles.actions}>
        {canManage && !approved && !item.changeRequest && <button className={styles.primary} aria-label="Approve post" disabled={pending || busy || !item.isReady || !!item.approvalBlockedReason} onClick={() => void review("approve")}><Check size={16} aria-hidden="true" />{pending ? "Saving…" : "Approve"}</button>}
        {approved && item.isReady && <button aria-label="Download post" disabled={pending} onClick={() => void download()}><Download size={16} aria-hidden="true" />Download</button>}
        <button aria-label={detailsOpen ? "Hide post details" : "Show post details"} aria-expanded={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)}><MoreHorizontal size={17} aria-hidden="true" />Details</button>
      </div>
      {canManage && item.nextAction === "finish_motion_reel" && onFinish && !item.changeRequest && <button className={styles.finish} disabled={pending || busy} onClick={() => onFinish(item)}>Finish reel · 4 credits</button>}
      {canManage && item.nextAction === "finish_ai_video" && onFinish && !item.changeRequest && <button className={styles.finish} disabled={pending || busy} onClick={() => onFinish(item)}>Finish AI video · up to 120 credits</button>}
      {detailsOpen && <section className={styles.postDetails} aria-label={`Post details: ${item.headline}`}>
      <span className={styles.kind}>{item.kind === "image" ? "Image post" : item.kind === "motion_reel" ? "Motion reel" : "AI video"}</span>
      <h2>{item.headline || "Your next post"}</h2>
      <div className={styles.secondaryActions}>
        <button disabled={!item.caption} onClick={async () => { try { await navigator.clipboard.writeText(item.caption); setMessage("Caption copied."); } catch { setMessage("Open Read caption and select its text to copy."); } }}>Copy caption</button>
        {canManage && !locked && <button disabled={pending || busy} onClick={() => setChangesOpen(!changesOpen)}>{item.changeRequest ? "Update request" : "Request changes"}</button>}
        {canManage && approved && item.isReady && item.type !== "story_post" && <button disabled={busy} onClick={() => setDeliveryOpen(!deliveryOpen)}>Post or schedule</button>}
      </div>
      <details className={styles.caption}><summary>Read caption</summary><p>{item.caption || "Caption is being prepared."}</p></details>
      {item.approvalBlockedReason && !approved && <p className={styles.notice}>{item.approvalBlockedReason}</p>}
      {item.changeRequest && <p className={styles.notice}><strong>Requested change:</strong> {item.changeRequest.comment}</p>}
      {item.deliveries.length > 0 && <ul className={styles.deliveries}>{item.deliveries.map(delivery => <li key={delivery.id}><strong>{platformNames[delivery.platform] || delivery.platform}{delivery.account ? ` · ${delivery.account}` : ""}</strong>: {delivery.status === "published" ? "Posted" : delivery.status === "scheduled" ? `Scheduled ${new Date(delivery.scheduledFor).toLocaleString()}` : delivery.status === "failed" ? "Posting failed" : delivery.status === "verification_pending" ? "Check the existing post before retrying" : delivery.status === "retry" ? "Waiting to retry" : delivery.status === "processing" ? "Processing" : "Posting"}{delivery.error && delivery.status !== "published" && <span>{delivery.error}</span>}</li>)}</ul>}
      {item.type === "story_post" && approved && <p>Download this Story and post it from your social app.</p>}
      {changesOpen && <form className={styles.changeForm} onSubmit={event => { event.preventDefault(); void review("request_changes"); }}><label htmlFor={`changes-${item.id}`}>What should we change?</label><textarea id={`changes-${item.id}`} value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} required minLength={3} placeholder="For example: use the blue guitar photo and a brighter background." /><button disabled={pending || comment.trim().length < 3}>Send to Admin</button></form>}
      {deliveryOpen && canManage && <SchedulePostButton key={item.deliveries.map(d => `${d.id}:${d.status}`).join(",")} contentItemId={item.id} initialStatus="approved" initialScheduledFor={plannedDate} isVideo={item.mediaKind === "video"} videoAssetId={item.mediaKind === "video" ? item.assetId || undefined : undefined} allowPostNow openByDefault excludedConnectionIds={excludedAccounts} onSubmitted={onChanged} />}
      </section>}
      <p role="status" className={styles.message}>{message}</p>
    </div>
    {item.previewUrl && item.mediaKind !== "video" && <dialog ref={preview} className={styles.previewDialog} aria-label={`Full-size preview: ${item.headline}`} onClick={event => { if (event.target === event.currentTarget) preview.current?.close(); }}>
      <div className={styles.previewHeader}><strong>{item.headline || "Post preview"}</strong><button autoFocus onClick={() => preview.current?.close()} aria-label="Close image preview">Close ✕</button></div>
      <img src={item.previewUrl} alt={item.headline || "Full-size post preview"} />
    </dialog>}
  </article>;
}
