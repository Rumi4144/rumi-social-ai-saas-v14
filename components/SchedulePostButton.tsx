"use client";

import { useEffect, useRef, useState } from "react";
import PostDeliveryStatus from "./PostDeliveryStatus";

type Connection = {
  id: string;
  provider: string;
  accountName: string | null;
  externalId: string | null;
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
}: {
  contentItemId: string;
  initialStatus: string;
  initialScheduledFor?: string | null;
  isVideo?: boolean;
  openByDefault?: boolean;
  allowPostNow?: boolean;
  beforeSchedule?: () => Promise<void>;
}) {
  const [completed,setCompleted] = useState(false);

  const [youtubeCertified, setYoutubeCertified] = useState(false);
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [madeForKids, setMadeForKids] = useState(false);
  const [synthetic, setSynthetic] = useState(true);
  const [open, setOpen] = useState(openByDefault);
  const [postNow, setPostNow] = useState(allowPostNow);
  const [queuedNow, setQueuedNow] = useState(false);
  const schedulePanelRef = useRef<HTMLDivElement>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
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
    setScheduledFor(scheduleInputValue(initialScheduledFor,initialStatus));
  }, [initialStatus, initialScheduledFor]);

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
    if (!open || connections.length > 0) return;

    async function loadConnections() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch("/api/social/connections", {
          cache: "no-store",
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(
            typeof data?.error === "string"
              ? data.error
              : "Could not load social accounts.",
          );
        }

        const list: Connection[] = (Array.isArray(data.connections) ? data.connections : []).filter((connection: Connection) => (isVideo ? ["facebook", "instagram", "youtube"] : ["facebook", "instagram", "google_business"]).includes(connection.provider.toLowerCase()));

        setConnections(list);

        if (list.length === 1) {
          setSelected([list[0].id]);
        }
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Could not load social accounts.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadConnections();
  }, [open, connections.length]);

  const youtubeSelected = connections.some(c => c.provider === "youtube" && selected.includes(c.id));

  function toggleConnection(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  async function schedule() {
    if (busy || completed) return;
    if (!postNow && !scheduledFor) {
      setError("Choose a date and time.");
      return;
    }

    if (selected.length === 0) {
      setError("Choose at least one social account.");
      return;
    }

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
          style={{
            marginTop: 12,
            padding: 16,
            border: "1px solid rgba(0,0,0,.12)",
            borderRadius: 12,
            width: "100%",
          }}
        >
          <strong>{allowPostNow ? "Post your reel" : "Schedule Post"}</strong>
          <PostDeliveryStatus contentItemId={contentItemId} refreshKey={completed ? 1 : 0} />
          <p>Select a destination for this post. TikTok publishing setup is not complete yet.</p>
          {isVideo && <p>Google Business Profile is available for text and photo posts. Choose a photo for a Google post.</p>}

          <div style={{ marginTop: 12 }}>
            {loading && <p>Loading connected accounts...</p>}

            {!loading && connections.length === 0 && (
              <p>No connected social accounts found.</p>
            )}

            {connections.map((connection) => (
              <label
                key={connection.id}
                style={{
                  display: "block",
                  marginBottom: 8,
                }}
              >
                <input
                  type="checkbox"
                  disabled={busy || completed}
                  checked={selected.includes(connection.id)}
                  onChange={() => toggleConnection(connection.id)}
                />{" "}
                {connection.provider === "google_business" ? "Google Business Profile" : connection.provider}
                {connection.accountName ? ` · ${connection.accountName}` : ""}
              </label>
            ))}
          </div>

          {youtubeSelected && <div><p>The selected video, post headline and caption will be uploaded at the scheduled time.</p><label>Visibility <select disabled={busy || completed} value={privacy} onChange={e=>setPrivacy(e.target.value as "public" | "unlisted" | "private")}><option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select></label><label><input type="checkbox" disabled={busy || completed} checked={madeForKids} onChange={e=>setMadeForKids(e.target.checked)} /> This video is made for kids</label><label><input type="checkbox" disabled={busy || completed} checked={synthetic} onChange={e=>setSynthetic(e.target.checked)} /> Contains realistic altered or synthetic content</label><label><input type="checkbox" disabled={busy || completed} checked={youtubeCertified} onChange={e=>setYoutubeCertified(e.target.checked)} /> I authorize this YouTube upload with the selected visibility, have rights to the video, and confirm it complies with YouTube’s Community Guidelines and Terms of Service.</label></div>}
          {allowPostNow && <label>When<select value={postNow ? "now" : "later"} disabled={busy || completed} onChange={event => setPostNow(event.target.value === "now")}><option value="now">Post now</option><option value="later">Schedule for later</option></select></label>}
          {!postNow && <input
            type="datetime-local"
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
            disabled={busy || completed || connections.length === 0}
          >
            {completed ? "✓ Submitted" : busy ? "Preparing your post…" : postNow ? "Approve and post now" : allowPostNow ? "Approve and schedule" : "Schedule Post"}
          </button>

          <p role="status" aria-live="polite" style={{minHeight:"3em",marginTop:10}}>{completed ? "Submitted. Delivery status updates above." : ""}</p>
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
