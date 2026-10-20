"use client";
import { useMemo, useState } from "react";
import { renderSocialSvg } from "@/lib/render/svg";
import { SHOWCASE_STYLES, isShowcaseStyle } from "@/lib/render/showcase";
import type { StudioBrand } from "@/lib/studio/creative-context";
import RunwayVideo from "./RunwayVideo";

export default function CreativeStudio({ brand }: { brand: StudioBrand }) {
  const [headline, setHeadline] = useState("");
  const [subheadline, setSubheadline] = useState("");
  const [cta, setCta] = useState("Learn more");
  const [format, setFormat] = useState<"square" | "portrait" | "story">("portrait");
  const [detailCrops, setDetailCrops] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]), [photoError, setPhotoError] = useState("");
  const [treatment, setTreatment] = useState("brand");
  const svg = useMemo(() => renderSocialSvg({
    ...brand, brand: brand.name, headline: headline.trim() || "Your headline",
    subheadline: subheadline.trim() || "Your message goes here.", cta: cta.trim(), format,
    headingFont: treatment === "editorial" ? "Georgia" : treatment === "brand" ? brand.headingFont : "Arial",
    primaryColor: treatment === "minimal" ? brand.secondaryColor : brand.primaryColor,
    secondaryColor: treatment === "minimal" ? brand.primaryColor : brand.secondaryColor,
    imageUrl: photos[0], imageUrls: photos.slice(1), detailCrops,
    designStyle: isShowcaseStyle(treatment) ? treatment : treatment === "brand" ? (isShowcaseStyle(brand.designStyle) ? brand.designStyle : "modern-gradient") : undefined,
    textPosition: treatment === "bold" ? "top" : "left",
  }), [brand, headline, subheadline, cta, format, treatment, photos, detailCrops]);
  const previewUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return <>
    <div className="eyebrow">CREATIVE STUDIO</div>
    <h1>Turn campaign ideas into finished creative.</h1>
    <p>Creating for <strong>{brand.name}</strong>. Enter your message, or <a href="/campaigns">open a campaign post</a> to use its creative tools.</p>
    <div className="studio">
      <section className="controls">
        <label htmlFor="studio-headline">Headline</label>
        <input id="studio-headline" value={headline} maxLength={140} placeholder={`Write a headline for ${brand.name}`} onChange={e => setHeadline(e.target.value)} />
        <label htmlFor="studio-subheadline">Subheadline</label>
        <textarea id="studio-subheadline" value={subheadline} maxLength={280} rows={3} placeholder="Add your supporting message" onChange={e => setSubheadline(e.target.value)} />
        <label htmlFor="studio-cta">Call to action</label>
        <input id="studio-cta" value={cta} maxLength={40} onChange={e => setCta(e.target.value)} />
        <label htmlFor="studio-format">Format</label>
        <select id="studio-format" value={format} onChange={e => setFormat(e.target.value as typeof format)}>
          <option value="square">Square 1:1</option><option value="portrait">Portrait 4:5</option><option value="story">Story / Reel 9:16</option>
        </select>
        <label htmlFor="studio-treatment">Creative treatment</label>
        <select id="studio-treatment" value={treatment} onChange={e => setTreatment(e.target.value)}>
          {SHOWCASE_STYLES.map(style => <option key={style.value} value={style.value}>{style.label}</option>)}
          <option value="brand">Workspace brand style</option><option value="editorial">Editorial</option><option value="minimal">Minimal</option><option value="bold">Bold promotion</option>
        </select>
        {treatment === "cinematic" && <p>For a layered design, add up to three matching product views or service photos. With one photo, turn on detail close-ups only if cropping suits the subject.</p>}
        <label>Product or service photos · up to 3<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={async e => { const files = [...(e.target.files || [])].slice(0, 3); setPhotoError(""); if (files.some(file => !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5_000_000)) { setPhotoError("Choose JPEG, PNG or WebP photos under 5 MB each."); return; } try { const urls = await Promise.all(files.map(file => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(Error("Could not read photo.")); reader.readAsDataURL(file); }))); setPhotos(urls); } catch { setPhotoError("Could not read those photos. Please try again."); } }} /></label>
        <label><input type="checkbox" checked={detailCrops} onChange={e => setDetailCrops(e.target.checked)} /> Include detail close-ups from a single photo</label>
        {photos.length > 0 && <button type="button" onClick={() => setPhotos([])}>Remove photos</button>}{photoError && <p role="alert">{photoError}</p>}
        <p>Your preview updates as you edit. Photos stay in this browser until you download the creative.</p>
        {headline.trim() ? <a className="button" href={previewUrl} download={`${brand.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-creative.svg`}>Download creative · SVG</a> : <p>Enter a headline to download your creative.</p>}
      </section>
      <section aria-label={`${brand.name} creative preview`}>
        <img src={previewUrl} alt={`${brand.name} creative: ${headline.trim() || "Your headline"}`} style={{ display: "block", width: "100%", maxWidth: format === "story" ? 460 : 600, borderRadius: 20 }} />
      </section>
    </div>
    <section className="card" style={{ marginTop: 28 }}><h2>Finished reels</h2><p>Combine campaign photos or presenter clips with captions, music or nature sounds, and your workspace’s branded ending.</p><a className="button" href="/studio/reels">Open reel editor</a></section>
    <section className="card" style={{ marginTop: 28 }}><h2>AI presenter videos</h2><p>Introduce a product, service, or campaign topic with a short spoken script.</p><a className="button" href="/studio/presenters">Open presenter studio</a></section>
    <RunwayVideo />
  </>;
}
