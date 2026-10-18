"use client";

import { useState } from "react";

export default function PublishingActions({
  contentItemId,
  connectionId,
  destination = "Facebook Page",
}: {
  contentItemId: string;
  connectionId: string;
  destination?: string;
}) {
  const isYouTube = destination.startsWith("YouTube");
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [certified,setCertified]=useState(false),[madeForKids,setMadeForKids]=useState(false),[synthetic,setSynthetic]=useState(true);
  const youtube = isYouTube ? { certified, privacy, madeForKids, containsSyntheticMedia: synthetic } : undefined;
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");

  async function publishNow() {
    if (busy || completed) return;
    if (isYouTube && !certified) { setMessage("Confirm YouTube upload settings first."); return; }
    if (
      !confirm(
        `${isYouTube ? `Upload this ${privacy} video to` : "Publish this content to"} ${destination} now?`
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const res = await fetch("/api/publishing/now", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentItemId, youtube,
          socialConnectionId: connectionId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || "Publishing failed."
        );
      }

      setMessage(data.pending ? data.message || "The platform is processing this post. Check publishing history." : "Published successfully.");
      setCompleted(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Publishing failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function schedulePost() {
    if (busy || completed) return;
    if (isYouTube && !certified) { setMessage("Confirm YouTube upload settings first."); return; }
    if (!scheduledFor) {
      setMessage("Choose a future date and time.");
      return;
    }

    const date = new Date(scheduledFor);

    if (date <= new Date()) {
      setMessage("Scheduled time must be in the future.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const res = await fetch("/api/publishing/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentItemId, youtube,
          socialConnectionIds: [connectionId],
          scheduledFor: date.toISOString(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Scheduling failed."
        );
      }

      setMessage("Scheduled successfully.");
      setCompleted(true);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Scheduling failed."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: "16px" }}>
      {isYouTube && <div><p>Uses this post’s selected video, headline and caption.</p><label>Visibility <select disabled={busy || completed} value={privacy} onChange={e=>setPrivacy(e.target.value as "public" | "unlisted" | "private")}><option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select></label><label><input type="checkbox" disabled={busy || completed} checked={madeForKids} onChange={e=>setMadeForKids(e.target.checked)} /> Made for kids</label><label><input type="checkbox" disabled={busy || completed} checked={synthetic} onChange={e=>setSynthetic(e.target.checked)} /> Realistic altered or synthetic content</label><label><input type="checkbox" disabled={busy || completed} checked={certified} onChange={e=>setCertified(e.target.checked)} /> I authorize the upload with the selected visibility, have rights to this video, and confirm it complies with YouTube’s Community Guidelines and Terms of Service.</label></div>}
      <button
        type="button"
        disabled={busy || completed}
        onClick={publishNow}
      >
        {busy ? "Working..." : `${isYouTube ? "Upload to" : "Publish to"} ${destination}`}
      </button>

      <div style={{ marginTop: "12px" }}>
        <input
          type="datetime-local"
          disabled={busy || completed}
          value={scheduledFor}
          onChange={(e) =>
            setScheduledFor(e.target.value)
          }
        />

        <button
          type="button"
          disabled={busy || completed || !scheduledFor}
          onClick={schedulePost}
          style={{ marginLeft: "8px" }}
        >
          Schedule
        </button>
      </div>

      <p role="status" aria-live="polite" style={{ marginTop: "10px", minHeight: "3em" }}>{message}</p>
    </div>
  );
}
