"use client";

import { useState } from "react";

export default function RenderCreativeButton({
  campaignId,
  contentItemId,
  headline,
  caption,
  imageUrl,
  textPosition = "left",
  existingCreative = false,
}: {
  campaignId: string;
  contentItemId: string;
  headline: string;
  caption?: string | null;
  imageUrl: string;
  textPosition?: "left" | "right" | "top";
  existingCreative?: boolean;
}) {
  const [status, setStatus] = useState("");

  async function render() {
    setStatus("Creating...");

    try {
      const res = await fetch("/api/creative/render", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          campaignId,
          contentItemId,
          headline,
          subheadline: undefined,
          cta: "Discover More",
          imageUrl,
          textPosition,
          format: "portrait",
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : JSON.stringify(result.error)
        );
      }

      setStatus("✓ Branded creative created");
      window.location.reload();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Render failed"
      );
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={render}
        disabled={status === "Creating..."}
      >
        {existingCreative
          ? "Update Branded Creative"
          : "Create Branded Creative"}
      </button>

      {status && (
        <span style={{ marginLeft: 10 }}>
          {status}
        </span>
      )}
    </div>
  );
}
