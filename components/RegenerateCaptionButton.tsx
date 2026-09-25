"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegenerateCaptionButton({
  contentItemId,
}: {
  contentItemId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function regenerate() {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      const res = await fetch(
        `/api/content-items/${contentItemId}/regenerate-caption`,
        {
          method: "POST",
        },
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Could not regenerate caption.",
        );
      }

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
        error instanceof Error
          ? error.message
          : "Could not regenerate caption.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={regenerate} disabled={busy}>
        {busy ? "Writing..." : "Regenerate Caption"}
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
