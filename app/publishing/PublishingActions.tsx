"use client";

import { useState } from "react";
import PostDeliveryStatus from "@/components/PostDeliveryStatus";
import { deliveryMessage, deliveryUrl, type ExistingDelivery } from "@/lib/publishing/eligibility";
import XCaptionReview, { useXCaptionReview } from "@/components/XCaptionReview";
import YouTubePostOptions from "@/components/YouTubePostOptions";

export default function PublishingActions({
  contentItemId,
  connectionId,
  destination = "Facebook Page",
  existingDelivery,
}: {
  contentItemId: string;
  connectionId: string;
  destination?: string;
  existingDelivery?: ExistingDelivery;
}) {
  const isYouTube = destination.startsWith("YouTube");
  const isX = destination.startsWith("X ·");
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("public");
  const [certified,setCertified]=useState(false),[madeForKids,setMadeForKids]=useState(false),[synthetic,setSynthetic]=useState(true);
  const youtube = isYouTube ? { certified, privacy, madeForKids, containsSyntheticMedia: synthetic } : undefined;
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [postUrl, setPostUrl] = useState("");
  const [watchDelivery, setWatchDelivery] = useState(false);
  const xCaption = useXCaptionReview(contentItemId, isX && !existingDelivery && !completed);

  async function publishNow() {
    if (busy || completed) return;
    if (isX && !xCaption.ready) { setMessage("Review a valid X caption before posting."); return; }
    if (isYouTube && !certified) { setMessage("Confirm YouTube upload settings first."); return; }
    if (
      !confirm(
        `${isYouTube ? `Upload this ${privacy} video to` : "Publish this content to"} ${destination} now?`
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage(isX ? "Sending your post to X…" : "Publishing…");

    try {
      const res = await fetch("/api/publishing/now", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentItemId, youtube,
          ...(isX ? { x: xCaption.review } : {}),
          socialConnectionId: connectionId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          `${data.submitted === false ? "Not sent to X. " : ""}${typeof data.error === "string" ? data.error : "Publishing failed. Check publishing history before trying again."}`
        );
      }

      setMessage(data.pending ? (isX ? "Delivery status updates below." : data.message || "The platform is processing this post. Check publishing history.") : isX ? "Posted to X." : isYouTube ? "Uploaded to YouTube." : "Published successfully.");
      if (!data.pending) setPostUrl(deliveryUrl(isX ? "x" : isYouTube ? "youtube" : "", data.externalPostId) || "");
      setWatchDelivery(Boolean(data.pending));
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
    if (isX && !xCaption.ready) { setMessage("Review a valid X caption before scheduling."); return; }
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
    setMessage("Scheduling your post…");

    try {
      const res = await fetch("/api/publishing/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contentItemId, youtube,
          ...(isX ? { x: xCaption.review } : {}),
          socialConnectionIds: [connectionId],
          scheduledFor: date.toISOString(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          `${data.submitted === false ? "Not scheduled. " : ""}${typeof data.error === "string" ? data.error : "Scheduling failed."}`
        );
      }

      setMessage(`Schedule saved for ${date.toLocaleString()}.${isX ? " Delivery status updates below." : ""}`);
      setWatchDelivery(true);
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

  if (existingDelivery) {
    const url = existingDelivery.status === "published" ? deliveryUrl(isX ? "x" : isYouTube ? "youtube" : "", existingDelivery.externalPostId) : null;
    return <div style={{ marginTop: 16 }}><p><strong>{destination}</strong>: {deliveryMessage(existingDelivery.status)}</p>{url && <p><a href={url} target="_blank" rel="noreferrer">{isYouTube ? "View YouTube video" : "View X post"}</a></p>}</div>;
  }

  return (
    <div style={{ marginTop: "16px" }}>
      {isX && !completed && <XCaptionReview state={xCaption} disabled={busy} />}
      {isYouTube && <YouTubePostOptions disabled={busy || completed} privacy={privacy} onPrivacyChange={setPrivacy} madeForKids={madeForKids} onMadeForKidsChange={setMadeForKids} synthetic={synthetic} onSyntheticChange={setSynthetic} certified={certified} onCertifiedChange={setCertified} />}
      <button
        type="button"
        disabled={busy || completed || (isX && !xCaption.ready)}
        onClick={publishNow}
      >
        {busy ? "Working..." : `${isYouTube ? "Upload to" : isX ? "Approve and publish to" : "Publish to"} ${destination}`}
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
          disabled={busy || completed || !scheduledFor || (isX && !xCaption.ready)}
          onClick={schedulePost}
          style={{ marginLeft: "8px" }}
        >
          {isX ? "Approve and schedule" : "Schedule"}
        </button>
      </div>

      <p role="status" aria-live="polite" style={{ marginTop: "10px", minHeight: "3em" }}>{message}</p>
      {postUrl && <p><a href={postUrl} target="_blank" rel="noreferrer">{isYouTube ? "View YouTube video" : "View X post"}</a></p>}
      {watchDelivery && <PostDeliveryStatus contentItemId={contentItemId} />}
    </div>
  );
}
