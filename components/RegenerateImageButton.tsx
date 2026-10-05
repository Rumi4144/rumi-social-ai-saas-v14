"use client";

import { useState } from "react";

export default function RegenerateImageButton({
  campaignId,
  contentItemId,
  headline,
}: {
  campaignId: string;
  contentItemId: string;
  headline: string;
}) {
  const [status, setStatus] = useState("");

  async function regenerate() {
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
          campaignId,
          contentItemId,
          prompt,
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
        format: "portrait",
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
    window.location.reload();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Image generation failed"
      );
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={regenerate}
        disabled={status === "Generating..."}
      >
        Regenerate Image
      </button>

      {status && (
        <span style={{ marginLeft: 10 }}>
          {status}
        </span>
      )}
    </div>
  );
}
