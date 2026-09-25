"use client";

import { useState } from "react";

export default function ApproveContentButton({
  contentItemId,
  headline,
  caption,
  initialStatus,
}: {
  contentItemId: string;
  headline: string;
  caption?: string | null;
  initialStatus: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function approve() {
    if (busy || status === "approved") return;

    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/api/content-items/${contentItemId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          headline,
          caption: caption || null,
          status: "approved",
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Could not approve content.",
        );
      }

      setStatus("approved");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not approve content.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={approve}
        disabled={busy || status === "approved"}
      >
        {busy
          ? "Approving..."
          : status === "approved"
            ? "✓ Approved"
            : "Approve"}
      </button>

      {error && (
        <span
          style={{
            display: "block",
            marginTop: 8,
            fontSize: 12,
          }}
        >
          {error}
        </span>
      )}
    </>
  );
}
