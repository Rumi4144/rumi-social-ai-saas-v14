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
      const basePayload = {
        campaignId,
        contentItemId,
        headline,
        subheadline: undefined,
        cta: "Discover More",
        imageUrl,
        textPosition,
        format: "portrait" as const,
      };

      // Ask the server only to prepare the complete SVG. The browser then
      // rasterizes that exact SVG, matching what the browser can display.
      const prepareRes = await fetch("/api/creative/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...basePayload, prepareOnly: true }),
      });
      const prepared = await prepareRes.json();
      if (!prepareRes.ok || !prepared.svgDataUrl) {
        throw new Error(prepared.error || "Creative preparation failed");
      }

      const img = new Image();
      img.decoding = "async";
      img.src = prepared.svgDataUrl;
      await img.decode();

      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1350;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const browserRasterDataUrl = canvas.toDataURL("image/jpeg", 0.9);

      const saveRes = await fetch("/api/creative/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...basePayload, browserRasterDataUrl }),
      });
      const saved = await saveRes.json();
      if (!saveRes.ok) {
        throw new Error(saved.error || "Creative save failed");
      }

      setStatus("✓ Branded creative created");
      window.location.reload();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Render failed");
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
