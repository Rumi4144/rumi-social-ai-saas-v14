"use client";

import { useState, useRef } from "react";

export default function RegenerateImageButton({
  campaignId,
  contentItemId,
  headline,
  format = "portrait",
  label = "Regenerate Image",
  showRegenerate = false,
}: {
  campaignId: string;
  contentItemId: string;
  headline: string;
  format?: "portrait" | "story";
  label?: string;
  showRegenerate?: boolean;
}) {
  const requestId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function regenerate() {
    if (busy) return;
    setBusy(true);
    requestId.current ||= crypto.randomUUID();
    setStatus("Generating...");

    const prompt = `Create a fresh, brand-relevant visual concept for this campaign message: ${headline}.
Use the current business context and previous campaign subjects supplied by the server.
Generate underlying photography or artwork only, with no text or branding; leave space for the existing creative layout.`;

    try {
      const res = await fetch("/api/creative/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId: requestId.current,
          campaignId,
          contentItemId,
          prompt,
          format,
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

    setStatus("Updating branded creative...");

    const renderRes = await fetch("/api/creative/render", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        campaignId,
        contentItemId,
        headline,
        cta: "Discover More",
        imageUrl: result.url,
        format,
      }),
    });

    const renderResult = await renderRes.json();

    if (!renderRes.ok) {
      throw new Error(
        typeof renderResult.error === "string"
          ? renderResult.error
          : JSON.stringify(renderResult.error)
      );
    }

    setStatus("✓ Image and branded creative updated");
    requestId.current = null;
    window.location.reload();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Image generation failed"
      );
    } finally { setBusy(false); }
  }

  return (
    <div style={{display:"flex",flexWrap:"wrap",gap:12,alignItems:"center"}}>
      <button
        type="button"
        onClick={regenerate}
        disabled={busy}
      >
        {label}
      </button>

      {showRegenerate && <button type="button" disabled={busy} onClick={regenerate}>Regenerate image</button>}
      {status && (
        <span style={{ marginLeft: 10 }}>
          {status}
        </span>
      )}
    </div>
  );
}
