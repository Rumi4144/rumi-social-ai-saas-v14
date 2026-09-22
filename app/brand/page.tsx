"use client";

import { useEffect, useState } from "react";

export default function Brand() {
  const [form, setForm] = useState({
    name: "Rumi Guitars",
    voice: "Refined, knowledgeable, warm and concise",
    positioning: "",
    preferredWords: "",
    bannedWords: "",
    visualRules: "",
    logoUrl: "",
    primaryColor: "#171C24",
    secondaryColor: "#F4F1EA",
    accentColor: "#D9BD7A",
    headingFont: "Georgia",
    bodyFont: "Arial",
    designStyle: "Luxury Editorial",
  });

  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadBrand() {
      try {
        const res = await fetch("/api/brand-brain", {
          method: "GET",
          cache: "no-store",
        });

        if (!res.ok) return;

        const result = await res.json();
        const brand = result.brand;

        if (!brand) return;

        setForm((old) => ({
          ...old,
          name: brand.name ?? old.name,
          voice: brand.voice ?? "",
          positioning: brand.positioning ?? "",
          preferredWords: brand.preferredWords ?? "",
          bannedWords: brand.bannedWords ?? "",
          visualRules: brand.visualRules ?? "",
          logoUrl: brand.logoUrl ?? "",
          primaryColor: brand.primaryColor ?? old.primaryColor,
          secondaryColor: brand.secondaryColor ?? old.secondaryColor,
          accentColor: brand.accentColor ?? old.accentColor,
          headingFont: brand.headingFont ?? old.headingFont,
          bodyFont: brand.bodyFont ?? old.bodyFont,
          designStyle: brand.designStyle ?? old.designStyle,
        }));
      } catch {
        // Keep local defaults if Brand Brain cannot be loaded.
      }
    }

    loadBrand();
  }, []);

  function set(field: string, value: string) {
    setForm((old) => ({ ...old, [field]: value }));
  }

  async function save() {
    alert("Brand Brain Save clicked");
    setSaving(true);
    setStatus("Saving...");

    try {
      const res = await fetch("/api/brand-brain", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : JSON.stringify(result.error)
        );
      }

      setStatus("✓ Brand Brain saved successfully");
    } catch (error: any) {
      setStatus("Error: " + (error?.message || "Could not save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="eyebrow">BRAND BRAIN</div>
      <h1>Teach the platform your brand.</h1>

      <div className="form">
        <label>Brand name</label>
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />

        <label>Voice</label>
        <textarea
          rows={3}
          value={form.voice}
          onChange={(e) => set("voice", e.target.value)}
        />

        <label>Positioning</label>
        <textarea
          rows={3}
          value={form.positioning}
          onChange={(e) => set("positioning", e.target.value)}
        />

        <label>Preferred words</label>
        <input
          value={form.preferredWords}
          onChange={(e) => set("preferredWords", e.target.value)}
        />

        <label>Banned words / claims</label>
        <input
          value={form.bannedWords}
          onChange={(e) => set("bannedWords", e.target.value)}
        />

        <label>Visual rules</label>
        <textarea
          rows={4}
          value={form.visualRules}
          onChange={(e) => set("visualRules", e.target.value)}
        />

      <h2>Visual Identity</h2>

      <label>Logo URL</label>
      <input
        value={form.logoUrl}
        onChange={(e) => set("logoUrl", e.target.value)}
        placeholder="https://example.com/logo.png"
      />

      <label>Primary color</label>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <input
          type="color"
          value={form.primaryColor}
          onChange={(e) => set("primaryColor", e.target.value)}
          style={{
            width: 64,
            height: 48,
            padding: 4,
            cursor: "pointer",
          }}
        />
        <input
          type="text"
          value={form.primaryColor}
          onChange={(e) => set("primaryColor", e.target.value)}
          placeholder="#000000"
          style={{ flex: 1 }}
        />
      </div>

      <label>Secondary color</label>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <input
          type="color"
          value={form.secondaryColor}
          onChange={(e) => set("secondaryColor", e.target.value)}
          style={{
            width: 64,
            height: 48,
            padding: 4,
            cursor: "pointer",
          }}
        />
        <input
          type="text"
          value={form.secondaryColor}
          onChange={(e) => set("secondaryColor", e.target.value)}
          placeholder="#000000"
          style={{ flex: 1 }}
        />
      </div>

      <label>Accent color</label>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <input
          type="color"
          value={form.accentColor}
          onChange={(e) => set("accentColor", e.target.value)}
          style={{
            width: 64,
            height: 48,
            padding: 4,
            cursor: "pointer",
          }}
        />
        <input
          type="text"
          value={form.accentColor}
          onChange={(e) => set("accentColor", e.target.value)}
          placeholder="#000000"
          style={{ flex: 1 }}
        />
      </div>

      <label>Heading font</label>
      <select
        value={form.headingFont}
        onChange={(e) => set("headingFont", e.target.value)}
      >
        <option value="Georgia">Georgia</option>
        <option value="Arial">Arial</option>
        <option value="Helvetica">Helvetica</option>
        <option value="Times New Roman">Times New Roman</option>
      </select>

      <label>Body font</label>
      <select
        value={form.bodyFont}
        onChange={(e) => set("bodyFont", e.target.value)}
      >
        <option value="Arial">Arial</option>
        <option value="Helvetica">Helvetica</option>
        <option value="Georgia">Georgia</option>
        <option value="Times New Roman">Times New Roman</option>
      </select>

      <label>Design style</label>
      <select
        value={form.designStyle}
        onChange={(e) => set("designStyle", e.target.value)}
      >
        <option value="Luxury Editorial">Luxury Editorial</option>
        <option value="Minimal Gallery">Minimal Gallery</option>
        <option value="Craftsmanship">Craftsmanship</option>
        <option value="Bold Promotion">Bold Promotion</option>
        <option value="Modern Clean">Modern Clean</option>
      </select>

        <p>
          <button
            className="button"
            type="button"
            onClick={save}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save Brand Brain"}
          </button>
        </p>

        {status && <p className="status">{status}</p>}
      </div>
    </>
  );
}
