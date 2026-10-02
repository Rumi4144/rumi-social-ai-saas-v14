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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");

  async function publishNow() {
    if (
      !confirm(
        `Publish this content to ${destination} now?`
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
          contentItemId,
          socialConnectionId: connectionId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || "Publishing failed."
        );
      }

      setMessage("Published successfully.");
      window.location.reload();
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
          contentItemId,
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
      window.location.reload();
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
      <button
        type="button"
        disabled={busy}
        onClick={publishNow}
      >
        {busy ? "Working..." : `Publish to ${destination}`}
      </button>

      <div style={{ marginTop: "12px" }}>
        <input
          type="datetime-local"
          value={scheduledFor}
          onChange={(e) =>
            setScheduledFor(e.target.value)
          }
        />

        <button
          type="button"
          disabled={busy || !scheduledFor}
          onClick={schedulePost}
          style={{ marginLeft: "8px" }}
        >
          Schedule
        </button>
      </div>

      {message ? (
        <p style={{ marginTop: "10px" }}>{message}</p>
      ) : null}
    </div>
  );
}
