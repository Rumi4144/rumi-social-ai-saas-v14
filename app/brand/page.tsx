"use client";

import { useEffect, useState } from "react";
import { INDUSTRIES } from "@/lib/industries";

export default function Brand() {
  const [form, setForm] = useState({
    name: "",
    industry: "",
    websiteUrl: "",
    description: "",
    targetAudience: "",
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
    designStyle: "Automatic by industry",
  });

  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [learning, setLearning] = useState(false);
  const [replaceFilled, setReplaceFilled] = useState(false);
  const [sources, setSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    async function loadBrand() {
      try {
        const res = await fetch("/api/brand-brain", {
          method: "GET",
          cache: "no-store",
        });

        if (res.status === 404) return;
        if (!res.ok) throw new Error("Could not load Brand Brain. Refresh before saving changes.");

        const result = await res.json();
        const brand = result.brand;

        if (!brand) return;

        setForm((old) => ({
          ...old,
          name: brand.name ?? old.name,
          industry: brand.industry ?? "",
          websiteUrl: brand.websiteUrl ?? "",
          description: brand.description ?? "",
          targetAudience: brand.targetAudience ?? "",
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
        setLoadError(true);
        setStatus("Could not load your saved Brand Brain. Refresh this page before saving.");
      } finally { setLoading(false); }
    }

    loadBrand();
  }, []);

  function set(field: string, value: string) {
    setForm((old) => ({ ...old, [field]: value }));
  }

  async function learnWebsite() {
    if (learning || loading || loadError || !form.websiteUrl.trim()) return;
    const requestedWebsite = form.websiteUrl;
    setLearning(true);setStatus("Reading your website and preparing Brand Brain…");setSources([]);
    try {
      const response = await fetch("/api/brand-brain/learn", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({websiteUrl:requestedWebsite}),signal:AbortSignal.timeout(85000)});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not read this website.");
      const allowed = ["description","targetAudience","industry","voice","positioning","preferredWords","bannedWords","visualRules"];
      setForm(current => {
        if (current.websiteUrl !== requestedWebsite) return current;
        const next = {...current, websiteUrl:data.websiteUrl || current.websiteUrl};
        for(const field of allowed){const key=field as keyof typeof next;const value=data.suggestions?.[field];if(typeof value==="string"&&value.trim()&&(replaceFilled||!next[key].trim()))next[key]=value;}
        return next;
      });
      setSources(data.sources || []);
      setStatus(Object.keys(data.suggestions || {}).length ? "Website details filled for review. Existing entries were kept unless you chose to update them. Review the fields, then click Save Brand Brain. Unsupported details stay blank." : "No supported profile details were found on the checked pages. Please enter the missing information manually.");
    } catch(error){setStatus(error instanceof Error ? error.message : "Could not fill Brand Brain from this website.");}
    finally{setLearning(false);}
  }

  async function save() {
    if (loading || loadError || saving || learning) return;
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

        {loading && <p role="status">Loading your saved business profile…</p>}
        <label>Business website</label>
        <input type="url" disabled={learning} value={form.websiteUrl} onChange={e=>set("websiteUrl",e.target.value)} placeholder="https://your-business.com" />
        <p>Use your website to fill Brand Brain, then review and save the details.</p>
        <button type="button" className="button" disabled={learning || loading || saving || loadError || !form.websiteUrl.trim()} onClick={learnWebsite}>{learning ? "Reading your website…" : "Fill from my website"}</button>
        <label style={{display:"flex",gap:8,alignItems:"center"}}><input type="checkbox" style={{width:"auto"}} checked={replaceFilled} disabled={learning} onChange={e=>setReplaceFilled(e.target.checked)} /> Also update fields that already contain text</label>
        {sources.length>0 && <details><summary>Website pages used</summary>{sources.map(source=><p key={source}><a href={source} target="_blank" rel="noreferrer">{source}</a></p>)}</details>}
        {status && <p role="status">{status}</p>}
        <label>Business description</label>
        <textarea rows={3} value={form.description} onChange={e=>set("description",e.target.value)} placeholder="Describe your services or products using verified facts." />
        <label>Target audience</label>
        <textarea rows={2} value={form.targetAudience} onChange={e=>set("targetAudience",e.target.value)} />
        <label>Business industry</label>
        <select value={form.industry} onChange={e => set("industry", e.target.value)}>
          <option value="">Choose your industry</option>
          {form.industry && !INDUSTRIES.some(value => value === form.industry) && <option value={form.industry}>{form.industry}</option>}
          {INDUSTRIES.map(value => <option key={value} value={value}>{value}</option>)}
        </select>
        <p>Used for automatic reel layouts and music. Set your design style to “Automatic by industry” to use these defaults.</p>
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
            disabled={saving || loading || loadError || learning}
          >
            {saving ? "Saving..." : "Save Brand Brain"}
          </button>
        </p>

        {status && <p className="status">{status}</p>}
      </div>
    </>
  );
}
