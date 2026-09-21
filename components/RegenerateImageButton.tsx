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

    const prompt = `
Create premium editorial product photography for this campaign:

${headline}

Create only the underlying photograph/artwork.

ABSOLUTELY NO TEXT OR TYPOGRAPHY:
no words, letters, numbers, dates, headlines, captions, labels,
logos, brand marks, signatures, watermarks, signs, posters,
packaging text, or UI elements.

Do not render the campaign headline inside the image.
Do not render Rumi Guitars or FE14 as text.
Leave elegant negative space suitable for professional typography
to be added later by the application.

Show a refined classical guitar with realistic proportions,
natural craftsmanship, sophisticated warm editorial lighting,
museum-quality presentation, and an elegant luxury aesthetic.

COMPOSITION:
Position the primary product predominantly on the RIGHT side of the frame.
Keep the complete product visually important and unobstructed.
Reserve generous, visually calm NEGATIVE SPACE on the LEFT side for
professional editorial typography that will be added later by the application.
Do not place important product details in the left typography zone.
Maintain balanced luxury-advertising composition and natural perspective.

No people.
`.trim();

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

      setStatus("✓ New image created");
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
