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
  const storageKey = `rumi-photo-request:${campaignId}:${contentItemId}:${format}`;

  async function regenerate() {
    if (busy) return;
    setBusy(true);
    setStatus("Generating and reviewing your photo…");

    const prompt = `Create a fresh, brand-relevant visual concept for this campaign message: ${headline}.
Use the current business context and previous campaign subjects supplied by the server.
Generate underlying photography or artwork only, with no text or branding; leave space for the existing creative layout.`;

    try {
      requestId.current ||= sessionStorage.getItem(storageKey) || crypto.randomUUID();
      sessionStorage.setItem(storageKey, requestId.current);
      let result: {pending?: boolean; needsReview?: boolean; error?: unknown; url?: string} = {};
      for (let check = 0; check < 8; check++) {
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

      result = await res.json();

      if (result.pending) {
        setStatus(typeof result.error === 'string' ? result.error : 'Checking saved photo progress…');
        if (check === 7) throw new Error('Your photo request is saved. Click again to continue without starting another generation.');
        await new Promise(resolve => setTimeout(resolve, 2500));
        continue;
      }

      if (!res.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : JSON.stringify(result.error)
        );
      }
      break;
      }

      if (result.needsReview) {
        requestId.current = null;
        sessionStorage.removeItem(storageKey);
        setStatus('Photo saved for your review. It has not replaced the current photo.');
        window.location.reload();
        return;
      }
      if (!result.url) throw new Error('The photo is saved but unavailable. Continue this request to check it again.');

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
    sessionStorage.removeItem(storageKey);
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
