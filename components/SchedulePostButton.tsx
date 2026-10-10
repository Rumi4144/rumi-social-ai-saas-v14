"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
}: {
  contentItemId: string;
  initialStatus: string;
  initialScheduledFor?: string | null;
  isVideo?: boolean;
}) {
  const router = useRouter();

  const [youtubeCertified, setYoutubeCertified] = useState(false);
  const [madeForKids, setMadeForKids] = useState(false);
  const [synthetic, setSynthetic] = useState(true);
  const [open, setOpen] = useState(false);
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

        const list: Connection[] = (Array.isArray(data.connections) ? data.connections : []).filter((connection: Connection) => (isVideo ? ["facebook", "youtube"] : ["facebook", "instagram"]).includes(connection.provider.toLowerCase()));

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
    if (!scheduledFor) {
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
      const isoTime = new Date(scheduledFor).toISOString();

      const res = await fetch("/api/publishing/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentItemId,
          socialConnectionIds: selected,
          scheduledFor: isoTime,
          ...(youtubeSelected ? { youtube: { certified: youtubeCertified, madeForKids, containsSyntheticMedia: synthetic } } : {}),
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
      setSavedTime(isoTime);
      setOpen(false);

      const scrollY = window.scrollY;
      router.refresh();

      requestAnimationFrame(() => {
        window.scrollTo({
          top: scrollY,
          behavior: "instant",
        });
      });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not schedule post.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (status === "scheduled") {
    return (
      <span>
        ✓ Scheduled
        {savedTime ? ` · ${new Date(savedTime).toLocaleString()}` : ""}
      </span>
    );
  }

  if (status !== "approved") {
    return null;
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(!open)}>
        Schedule
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
          <strong>Schedule Post</strong>
          <p>Select a destination for this post. TikTok publishing setup is not complete yet.</p>

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
                  checked={selected.includes(connection.id)}
                  onChange={() => toggleConnection(connection.id)}
                />{" "}
                {connection.provider}
                {connection.accountName ? ` · ${connection.accountName}` : ""}
              </label>
            ))}
          </div>

          {youtubeSelected && <div><p>YouTube uploads are private while this API project awaits audit. The selected video, post headline and caption will be uploaded at the scheduled time.</p><label><input type="checkbox" checked={madeForKids} onChange={e=>setMadeForKids(e.target.checked)} /> This video is made for kids</label><label><input type="checkbox" checked={synthetic} onChange={e=>setSynthetic(e.target.checked)} /> Contains realistic altered or synthetic content</label><label><input type="checkbox" checked={youtubeCertified} onChange={e=>setYoutubeCertified(e.target.checked)} /> I authorize this private YouTube upload, have rights to the video, and confirm it complies with YouTube’s Community Guidelines and Terms of Service.</label></div>}
          <input
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
            style={{
              display: "block",
              marginTop: 12,
              marginBottom: 12,
            }}
          />

          <button
            type="button"
            onClick={schedule}
            disabled={busy || connections.length === 0}
          >
            {busy ? "Scheduling..." : "Schedule Post"}
          </button>

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
    </>
  );
}
