"use client";

import { useEffect, useRef, useState } from "react";
import TikTokPostOptions from "./TikTokPostOptions";
import type {TikTokPostOptions as TikTokOptions} from "@/lib/tiktok/options";
import PostDeliveryStatus from "./PostDeliveryStatus";
import XCaptionReview, { useXCaptionReview } from "./XCaptionReview";
import YouTubePostOptions from "./YouTubePostOptions";
import styles from "./PostOptions.module.css";

type Connection = {
  id: string;
  provider: string;
  accountName: string | null;
  externalId: string | null;
  status?: string;
};

export function scheduleInputValue(value:string|null|undefined,status:string):string {
 if(!value)return "";
 const date=new Date(value);if(!Number.isFinite(date.getTime()))return "";
 if(status!=="scheduled"&&status!=="published")return value.slice(0,10)+"T10:00";
 const pad=(n:number)=>String(n).padStart(2,"0");
 return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function SchedulePostButton({
  contentItemId,
  initialStatus,
  initialScheduledFor,
  isVideo = false,
  openByDefault = false,
  allowPostNow = false,
  beforeSchedule,
  videoAssetId,
  excludedConnectionIds,
  onSubmitted,
}: {
  contentItemId: string;
  initialStatus: string;
  initialScheduledFor?: string | null;
  isVideo?: boolean;
  openByDefault?: boolean;
  allowPostNow?: boolean;
  beforeSchedule?: () => Promise<void>;
  videoAssetId?:string;
  excludedConnectionIds?: string[];
  onSubmitted?: () => void;
}) {
  const [tikTokOptions,setTikTokOptions]=useState<TikTokOptions|null>(null);
  const [completed,setCompleted] = useState(false);

  const [youtubeCertified, setYoutubeCertified] = useState(false);
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [madeForKids, setMadeForKids] = useState(false);
  const [synthetic, setSynthetic] = useState(true);
  const [open, setOpen] = useState(openByDefault);
  const [postNow, setPostNow] = useState(() => allowPostNow && !scheduleInputValue(initialScheduledFor, initialStatus));
  const [queuedNow, setQueuedNow] = useState(false);
  const schedulePanelRef = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [savedConnections, setSavedConnections] = useState<Connection[]>([]);
  const [connectionsLoaded, setConnectionsLoaded] = useState(false);
  const [connectionRefresh, setConnectionRefresh] = useState(0);
  const firstConnectionLoad = useRef(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [scheduledFor, setScheduledFor] = useState(()=>scheduleInputValue(initialScheduledFor,initialStatus));
  const [status, setStatus] = useState(initialStatus);
  const [savedTime, setSavedTime] = useState(initialScheduledFor || "");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    requestAnimationFrame(() => {
      schedulePanelRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }, [open]);

  useEffect(() => {
    setStatus(initialStatus);
    setSavedTime(initialScheduledFor || "");
    const plannedTime = scheduleInputValue(initialScheduledFor, initialStatus);
    setScheduledFor(plannedTime);
    setPostNow(allowPostNow && !plannedTime);
  }, [initialStatus, initialScheduledFor, allowPostNow]);

  useEffect(() => {
    function handleApproved(event: Event) {
      const customEvent = event as CustomEvent<{
        contentItemId: string;
      }>;

      if (customEvent.detail?.contentItemId === contentItemId) {
        setStatus("approved");
      }
    }

    window.addEventListener("content-item-approved", handleApproved);

    return () => {
      window.removeEventListener(
        "content-item-approved",
        handleApproved
      );
    };
  }, [contentItemId]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();

    async function loadConnections() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch("/api/social/connections", {
          cache: "no-store",
          signal: controller.signal,
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Could not load social accounts.",
          );
        }

        const available: Connection[] = (Array.isArray(data.connections) ? data.connections : []).filter((connection: Connection) => (isVideo ? ["facebook", "instagram", "youtube", "tiktok", "x"] : ["facebook", "instagram", "google_business", "x"]).includes(connection.provider.toLowerCase()));
        const list = available.filter(connection => !excludedConnectionIds?.includes(connection.id));

        if (controller.signal.aborted) return;
        const ready = list.filter(connection => connection.provider !== "x" || connection.status === "connected");
        const selectOnlyAccount = firstConnectionLoad.current && ready.length === 1;
        firstConnectionLoad.current = false;
        setSavedConnections(available);
        setConnections(list);
        setConnectionsLoaded(true);
        setSelected(current => selectOnlyAccount ? [ready[0].id] : current.filter(id => ready.some(connection => connection.id === id)));
      } catch (error) {
        if (controller.signal.aborted) return;
        setError(
          error instanceof Error
            ? error.message
            : "Could not load social accounts.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadConnections();
    return () => controller.abort();
  }, [open, isVideo, connectionRefresh]);

  const tikTokSelected=connections.find(connection=>connection.provider==="tiktok"&&selected.includes(connection.id));
  const youtubeSelected = connections.some(c => c.provider === "youtube" && selected.includes(c.id));
  const xSelected = connections.some(c => c.provider === "x" && selected.includes(c.id));
  const xCaption = useXCaptionReview(contentItemId, open && xSelected && !completed);

  function toggleConnection(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  async function schedule() {
    if (busy || completed || loading) return;
    if (!postNow && !scheduledFor) {
      setError("Choose a date and time.");
      return;
    }

    if (selected.length === 0) {
      setError("Choose at least one social account.");
      return;
    }

    if (xSelected && !xCaption.ready) { setError("Review a valid X caption before posting."); return; }

    if(tikTokSelected&&!tikTokOptions){setError("Review TikTok visibility, disclosures and music permissions below.");return;}
    if (youtubeSelected && !youtubeCertified) { setError("Confirm the YouTube upload settings."); return; }
    setBusy(true);
    setError("");

    try {
      if (beforeSchedule) await beforeSchedule();
      const isoTime = postNow ? new Date(Date.now() + 15_000).toISOString() : new Date(scheduledFor).toISOString();

      const res = await fetch("/api/publishing/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentItemId,
          socialConnectionIds: selected,
          scheduledFor: isoTime,
          ...(xSelected ? { x: xCaption.review } : {}),
          ...(tikTokSelected?{tiktok:tikTokOptions}:{}),
          ...(youtubeSelected ? { youtube: { certified: youtubeCertified, privacy, madeForKids, containsSyntheticMedia: synthetic } } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Could not schedule post.",
        );
      }

      setStatus("scheduled");
      setQueuedNow(postNow);
      setSavedTime(isoTime);
      setCompleted(true);
      onSubmitted?.();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not schedule post.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (status === "scheduled" && !completed) {
    return (
      <div role="status" aria-live="polite"><PostDeliveryStatus contentItemId={contentItemId} />
        {queuedNow ? "✓ Queued for posting. Check Publishing for delivery status." : "✓ Scheduled"}
        {!queuedNow && savedTime ? ` · ${new Date(savedTime).toLocaleString()}` : ""}
      </div>
    );
  }

  if (status === "published" && !completed) return <PostDeliveryStatus contentItemId={contentItemId} />;

  if (status !== "approved" && !completed) {
    return null;
  }

  return (
    <div>
      <button type="button" disabled={completed} onClick={() => setOpen(!open)}>
        {allowPostNow ? "Choose accounts and time" : "Schedule"}
      </button>

      {open && (
        <div
        ref={schedulePanelRef}
          className={styles.panel}
        >
          <strong>{allowPostNow ? "Post or schedule" : "Schedule Post"}</strong>
          <PostDeliveryStatus contentItemId={contentItemId} refreshKey={completed ? 1 : 0} />
          <p>Post to</p>

          <div style={{ marginTop: 12 }}>
            {loading && <p>Loading connected accounts...</p>}

            {!loading && connectionsLoaded && connections.length === 0 && (
              <p>{savedConnections.length ? "This post is already scheduled or posted to all available accounts. See the status above." : "No connected social accounts found."}</p>
            )}

            {connections.map((connection) => (
              <label
                key={connection.id}
                className={`${styles.check} ${styles.account}`}
              >
                <input
                  type="checkbox"
                  disabled={busy || completed || loading || (connection.provider === "x" && connection.status !== "connected")}
                  checked={selected.includes(connection.id)}
                  onChange={() => toggleConnection(connection.id)}
                /><span>
                {connection.provider === "google_business" ? "Google Business Profile" : connection.provider === "instagram" ? "Instagram" : connection.provider === "x" ? "X (Twitter)" : connection.provider}
                {connection.accountName ? ` · ${connection.accountName}` : ""}
                {connection.provider === "x" && connection.status !== "connected" && <> · <a href="/settings/x" target="_blank" rel="noopener noreferrer">Enable X posting</a></>}</span>
              </label>
            ))}
            {connectionsLoaded && !loading && !completed && !savedConnections.some(connection => connection.provider.toLowerCase() === "instagram") && (
              <div style={{ marginBottom: 12 }}>
                <strong>Instagram</strong> · Not connected{" "}
                <a href="/api/social/instagram/connect" target="_blank" rel="noopener noreferrer">Connect Instagram</a>
                <p>Connect in the new tab, then return here and refresh accounts. Your reel stays open.</p>
              </div>
            )}
            {!completed && <button type="button" disabled={busy || loading} onClick={() => setConnectionRefresh(value => value + 1)}>{loading ? "Loading accounts…" : "Refresh accounts"}</button>}
            {connections.some(connection => connection.provider === "x" && connection.status !== "connected") && <p>Enable X posting in the new tab, then return here and refresh accounts. Your post stays open.</p>}
          </div>

          {xSelected && !completed && <XCaptionReview state={xCaption} disabled={busy} />}

          {tikTokSelected&&<TikTokPostOptions connectionId={tikTokSelected.id} contentItemId={contentItemId} assetId={videoAssetId} disabled={busy||completed} onChange={setTikTokOptions}/>}
          {youtubeSelected && <YouTubePostOptions disabled={busy || completed} privacy={privacy} onPrivacyChange={setPrivacy} madeForKids={madeForKids} onMadeForKidsChange={setMadeForKids} synthetic={synthetic} onSyntheticChange={setSynthetic} certified={youtubeCertified} onCertifiedChange={setYoutubeCertified} />}
          {tikTokSelected&&!tikTokOptions&&!completed&&<p role="status">Complete TikTok’s visibility, disclosure and upload permission settings to enable posting.</p>}
          {allowPostNow && <label className={`${styles.field} ${styles.when}`}>When<select value={postNow ? "now" : "later"} disabled={busy || completed} onChange={event => setPostNow(event.target.value === "now")}><option value="now">Post now</option><option value="later">Schedule for later</option></select></label>}
          {!postNow && <input
            type="datetime-local"
            aria-label="Posting date and time"
            disabled={busy || completed}
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            style={{
              display: "block",
              marginTop: 12,
              marginBottom: 12,
            }}
          />}

          <button
            type="button"
            onClick={schedule}
            disabled={busy || completed || loading || connections.length === 0 || (!!tikTokSelected && !tikTokOptions) || (xSelected && !xCaption.ready)}
          >
            {completed ? "✓ Submitted" : busy ? "Preparing your post…" : postNow ? "Approve and post now" : allowPostNow || xSelected ? "Approve and schedule" : "Schedule Post"}
          </button>

          {completed && <p role="status" aria-live="polite">Submitted. Delivery status updates above.</p>}
          {error && (
            <p
              style={{
                marginTop: 10,
                fontSize: 12,
              }}
            >
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
