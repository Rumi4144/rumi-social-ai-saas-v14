"use client";

import { useState } from "react";

export default function EditContentButton({
  contentItemId,
  campaignId,
  headline,
  caption,
  imageUrl,
  cta = "Discover More",
  textPosition = "left",
}: {
  contentItemId: string;
  campaignId: string;
  headline: string;
  caption?: string | null;
  imageUrl?: string;
  cta?: string;
  textPosition?: "left" | "right" | "top";
}) {
  const [editing, setEditing] = useState(false);
  const [draftHeadline, setDraftHeadline] = useState(headline);
  const [draftCaption, setDraftCaption] = useState(caption || "");
  const [draftCta, setDraftCta] = useState(cta);
  const [draftTextPosition, setDraftTextPosition] =
    useState<"left" | "right" | "top">(textPosition);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!draftHeadline.trim()) {
      setError("Headline is required.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      // Save headline + caption
      const res = await fetch(
        `/api/content-items/${contentItemId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            headline: draftHeadline,
            caption: draftCaption,
          }),
        }
      );

      const result = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : JSON.stringify(result.error)
        );
      }

      // Automatically rebuild branded creative
      // from the ORIGINAL clean AI image.
      if (imageUrl) {
        const renderRes = await fetch("/api/creative/render", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            campaignId,
            contentItemId,
            headline: draftHeadline.trim(),
            subheadline: undefined,
            cta: draftCta.trim() || "Discover More",
            imageUrl,
            format: "portrait",
          textPosition: draftTextPosition,
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
      }

      setEditing(false);
      window.location.reload();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save changes"
      );
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraftHeadline(headline);
    setDraftCaption(caption || "");
    setDraftCta(cta);
    setDraftTextPosition(textPosition);
    setError("");
    setEditing(false);
  }

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)}>
        Edit
      </button>
    );
  }

  return (
    <div style={{ marginTop: 12, width: "100%" }}>
      <label
        style={{
          display: "block",
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        Headline
      </label>

      <input
        value={draftHeadline}
        onChange={(e) => setDraftHeadline(e.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          marginBottom: 12,
        }}
      />

      <label
        style={{
          display: "block",
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        Caption
      </label>

      <textarea
        rows={7}
        value={draftCaption}
        onChange={(e) => setDraftCaption(e.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          marginBottom: 12,
        }}
      />

      <label
        style={{
          display: "block",
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        Call to action
      </label>

      <input
        value={draftCta}
        onChange={(e) => setDraftCta(e.target.value)}
        placeholder="Discover More"
        style={{
          width: "100%",
          boxSizing: "border-box",
          marginBottom: 12,
        }}
      />

      <label
        style={{
          display: "block",
          fontWeight: 700,
          marginBottom: 6,
        }}
      >
        Text position
      </label>

      <select
        value={draftTextPosition}
        onChange={(e) =>
          setDraftTextPosition(
            e.target.value as "left" | "right" | "top"
          )
        }
        style={{
          width: "100%",
          boxSizing: "border-box",
          marginBottom: 16,
        }}
      >
        <option value="left">Left</option>
        <option value="right">Right</option>
        <option value="top">Top</option>
      </select>

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={save}
          disabled={saving}
        >
          {saving ? "Updating creative..." : "Save & Update Creative"}
        </button>

        <button
          type="button"
          onClick={cancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>

      {error && <p style={{ marginTop: 8 }}>{error}</p>}
    </div>
  );
}
