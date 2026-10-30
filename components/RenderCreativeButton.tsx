"use client";

import { useMemo, useState } from "react";
import { SHOWCASE_STYLES, automaticShowcaseStyle, isShowcaseStyle } from "@/lib/render/showcase";
import { WEEKLY_DESIGN_CHOICES, isWeeklyDesign } from "@/lib/render/weekly-layouts";
import { renderSocialSvg } from "@/lib/render/svg";
import CreativeTemplatePicker, { CreativeSvgPreview } from "@/components/CreativeTemplatePicker";
import type { StudioBrand } from "@/lib/studio/creative-context";

export default function RenderCreativeButton({
  campaignId,
  contentItemId,
  headline,
  caption,
  imageUrl,
  displayUrl,
  initialDesignStyle,
  brand,
  imageUrls,
  textPosition = "left",
  existingCreative = false,
  format = "portrait",
}: {
  campaignId: string;
  contentItemId: string;
  headline: string;
  caption?: string | null;
  imageUrl: string;
  displayUrl?: string;
  initialDesignStyle?: string;
  brand?: StudioBrand;
  imageUrls?: string[];
  textPosition?: "left" | "right" | "top";
  existingCreative?: boolean;
  format?: "portrait" | "story";
}) {
  const [designStyle, setDesignStyle] = useState(initialDesignStyle === "classic" || isShowcaseStyle(initialDesignStyle) || isWeeklyDesign(initialDesignStyle) ? initialDesignStyle! : "automatic");
  const [designChanged, setDesignChanged] = useState(false);
  const [status, setStatus] = useState("");

  const choices = useMemo(() => [
    { value: "automatic", label: "Automatic variety", description: "Choose a layout for this post using your workspace style.", previewStyle: automaticShowcaseStyle(contentItemId, brand?.designStyle) },
    ...SHOWCASE_STYLES,
    ...WEEKLY_DESIGN_CHOICES,
    { value: "classic", label: "Classic photo overlay", description: "A simple photograph with your headline and call to action." },
  ], [contentItemId, brand?.designStyle]);
  const preview = useMemo(() => ({ ...brand, brand: brand?.name || "Your business", headline,
    cta: "Discover More", imageUrl, imageUrls, textPosition, format,
  }), [brand, headline, imageUrl, imageUrls, textPosition, format]);

  const selectedPreview = useMemo(() => renderSocialSvg({
    ...preview, designStyle: designStyle === "automatic" ? automaticShowcaseStyle(contentItemId, brand?.designStyle) : designStyle,
  }), [preview, designStyle, contentItemId, brand?.designStyle]);

  function chooseDesign(value: string) {
    setDesignStyle(value);
    setDesignChanged(true);
    setStatus("");
  }

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
        format,
        designStyle,
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
      canvas.height = format === "story" ? 1920 : 1350;
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
      <div role="img" aria-label={`${headline} design preview`} style={{ width: "100%", borderRadius: 18, overflow: "hidden", marginBottom: 20 }}>
        {displayUrl && !designChanged ? <img src={displayUrl} alt="" style={{ width: "100%", height: "auto", display: "block" }} /> : <CreativeSvgPreview svg={selectedPreview} />}
      </div>
      <CreativeTemplatePicker label="Post design" value={designStyle} onChange={chooseDesign} options={choices} preview={preview} disabled={status === "Creating..."} />
      {designChanged && <p role="status" style={{ fontSize: 14 }}>Preview updated. Choose “{existingCreative ? "Update Branded Creative" : "Create Branded Creative"}” to save this design.</p>}
      {designStyle === "cinematic" && <p style={{ fontSize: 14 }}>Layered photos and elegant type. Extra views come from photos attached to this post.</p>}
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
        <span role="status" style={{ marginLeft: 10 }}>
          {status}
        </span>
      )}
    </div>
  );
}
