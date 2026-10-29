"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DESIGN_FORMATS, DESIGN_SIZES, designHeadline, renderDesignFormat, type DesignFormat, type DesignSize, type DesignFonts, type MeasureDesignText } from "@/lib/render/design-formats";
import styles from "./DesignFormats.module.css";

const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read this image.")); reader.readAsDataURL(blob);
});
const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("Could not open this image. Try another file.")); image.src = src;
});
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const faces = { display: "RumiDisplay", editorial: "RumiEditorial", italic: "RumiEditorialItalic", body: "RumiBody" } as const;
async function bundledImage(path: string) {
  const response = await fetch(path); if (!response.ok) throw new Error("The sample assets could not load. Try again or choose your own images.");
  const source = await dataUrl(await response.blob()); await loadImage(source); return source;
}
async function checkedImage(file: File, label: string) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12_000_000) throw new Error(`Choose a JPG, PNG or WebP ${label} under 12 MB.`);
  const source = await dataUrl(file), image = await loadImage(source);
  if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("Choose an image under 40 megapixels.");
  return source;
}
export default function DesignFormats() {
  const [brand, setBrand] = useState("Rumi Guitars"), [headline, setHeadline] = useState("Find your sound"), [cta, setCta] = useState("Explore the collection");
  const [detail, setDetail] = useState("Martinez MF-17 · Flamenco guitar"), [website, setWebsite] = useState("rumiguitars.com");
  const [size, setSize] = useState<DesignSize>("portrait"), [photo, setPhoto] = useState(""), [logo, setLogo] = useState("");
  const [customPhoto, setCustomPhoto] = useState(false), [logoSource, setLogoSource] = useState<"website" | "upload" | "missing">("website");
  const [customAccent, setCustomAccent] = useState(false), [accent, setAccent] = useState("#ef653d"), [fonts, setFonts] = useState<DesignFonts | null>(null);
  const [selected, setSelected] = useState<DesignFormat | null>(null), [downloading, setDownloading] = useState<DesignFormat | null>(null), [message, setMessage] = useState("");
  const [loadingPhoto, setLoadingPhoto] = useState(true), [loadingLogo, setLoadingLogo] = useState(true), [fontError, setFontError] = useState(false), [fontAttempt, setFontAttempt] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null), upload = useRef<HTMLInputElement>(null), logoUpload = useRef<HTMLInputElement>(null), photoRequest = useRef(0), logoRequest = useRef(0);
  async function resetSample() {
    const photoId = ++photoRequest.current, logoId = ++logoRequest.current;
    setLoadingPhoto(true); setLoadingLogo(true); setMessage("");
    setBrand("Rumi Guitars"); setWebsite("rumiguitars.com"); setDetail("Martinez MF-17 · Flamenco guitar"); setLogoSource("website");
    await Promise.all([
      bundledImage("/design-formats/rumi-guitar.png").then(value => { if (photoId === photoRequest.current) { setPhoto(value); setCustomPhoto(false); if (upload.current) upload.current.value = ""; } }).catch(error => { if (photoId === photoRequest.current) setMessage(error.message); }).finally(() => { if (photoId === photoRequest.current) setLoadingPhoto(false); }),
      bundledImage("/design-formats/rumi-guitars-logo.png").then(value => { if (logoId === logoRequest.current) { setLogo(value); if (logoUpload.current) logoUpload.current.value = ""; } }).catch(error => { if (logoId === logoRequest.current) { setLogo(""); setLogoSource("missing"); setMessage(error.message); } }).finally(() => { if (logoId === logoRequest.current) setLoadingLogo(false); }),
    ]);
  }
  useEffect(() => { void resetSample(); return () => { photoRequest.current++; logoRequest.current++; }; }, []);
  useEffect(() => {
    let active = true; setFontError(false);
    const files = { display: "/design-formats/display.woff2", editorial: "/design-formats/editorial.woff2", italic: "/design-formats/editorial-italic.woff2", body: "/fonts/noto-sans-latin-400-normal.woff" };
    void Promise.all((Object.entries(files) as Array<[keyof DesignFonts, string]>).map(async ([name, path]) => {
      const response = await fetch(path); if (!response.ok) throw new Error("Could not load the design lettering.");
      const bytes = await response.arrayBuffer(), source = await dataUrl(new Blob([bytes], { type: path.endsWith("woff2") ? "font/woff2" : "font/woff" }));
      const font = new FontFace(faces[name], bytes); await font.load(); if (active) document.fonts.add(font);
      return [name, source] as const;
    })).then(entries => { if (active) setFonts(Object.fromEntries(entries) as DesignFonts); }).catch(() => { if (active) setFontError(true); });
    return () => { active = false; };
  }, [fontAttempt]);
  useEffect(() => { if (selected && !dialog.current?.open) dialog.current?.showModal(); else if (!selected && dialog.current?.open) dialog.current.close(); }, [selected]);
  const measure = useMemo<MeasureDesignText | undefined>(() => {
    if (!fonts) return undefined;
    const context = document.createElement("canvas").getContext("2d");
    return context ? (value, pixels, face) => { context.font = `${pixels}px ${faces[face]}`; return context.measureText(value).width; } : undefined;
  }, [fonts]);
  const sample = { brand, headline, cta, photo, logo, detail, website, size, accent: customAccent ? accent : undefined, fonts: fonts || undefined, measure };
  const previews = useMemo(() => DESIGN_FORMATS.map(format => ({ ...format, svg: renderDesignFormat(sample, format.value) })), [brand, headline, cta, photo, logo, detail, website, size, accent, customAccent, fonts, measure]);
  const headlineTooLong = DESIGN_FORMATS.some(format => designHeadline(headline, format.value, measure).overflow);
  const loading = loadingPhoto || loadingLogo || !fonts;
  const canDownload = Boolean(photo && logo && brand.trim() && headline.trim() && cta.trim() && !headlineTooLong && !loading && !downloading);
  async function chooseImage(file: File | undefined, kind: "photo" | "logo") {
    if (!file) return;
    const request = kind === "photo" ? photoRequest : logoRequest, id = ++request.current;
    const setLoading = kind === "photo" ? setLoadingPhoto : setLoadingLogo;
    setLoading(true); setMessage("");
    try {
      const source = await checkedImage(file, kind); if (id !== request.current) return;
      if (kind === "photo") { setPhoto(source); setCustomPhoto(true); }
      else { setLogo(source); setLogoSource("upload"); }
    } catch (error) { if (id === request.current) setMessage(error instanceof Error ? error.message : "Could not read the image."); }
    finally { if (id === request.current) setLoading(false); }
  }
  function changeBrand(value: string) {
    setBrand(value);
    if (logoSource === "website" && value.trim().toLowerCase() !== "rumi guitars") {
      logoRequest.current++; setLoadingLogo(false); setLogo(""); setLogoSource("missing"); setWebsite(""); setDetail("");
      setMessage("Add this brand’s own logo below. The Rumi Guitars logo has been removed from the previews.");
    }
  }
  async function download(format: DesignFormat) {
    if (!canDownload) return;
    setDownloading(format); setMessage("");
    try {
      const artwork = previews.find(item => item.value === format)!;
      const image = await loadImage(svgUrl(artwork.svg));
      const canvas = document.createElement("canvas"); canvas.width = 1080; canvas.height = DESIGN_SIZES[size].height;
      const context = canvas.getContext("2d"); if (!context) throw new Error("Your browser could not prepare the image.");
      context.drawImage(image, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Could not create the download.")), "image/png"));
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `rumi-${format}-${size}-preview.png`; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      setMessage(`${artwork.label} sample downloaded.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not download this sample."); }
    finally { setDownloading(null); }
  }
  const open = previews.find(item => item.value === selected);
  return <div className={styles.page}>
    <header className={styles.header}>
      <div><span className={styles.badge}>ADMIN PREVIEW · BRANDED COMPOSITIONS</span><h1>Design Formats</h1><p>Your logo. Your product. A complete visual identity.</p></div>
      <p className={styles.note}>Compare complete ad designs before choosing customer defaults. Open any design to inspect the lettering and logo.</p>
    </header>
    <section className={styles.controls} aria-label="Preview settings">
      <div className={styles.assetStrip}>
        <div className={styles.assetLogo}>{logo ? <img src={logo} alt="Selected brand logo" /> : <span>Add your logo</span>}</div>
        <div className={styles.assetDescription}><strong>{logoSource === "website" ? "The actual Rumi Guitars website logo" : logoSource === "upload" ? "Your original brand logo" : "Use this brand’s own logo"}</strong><p>{logoSource === "website" ? <>{customPhoto ? "Paired with your selected product photo." : "Paired with the original Martinez product photo."} <a href="https://rumiguitars.com" target="_blank" rel="noreferrer">View source website ↗</a></> : "Your logo is placed as supplied, with its shape and colors preserved."}</p></div>
        <button type="button" onClick={() => void resetSample()} disabled={loadingPhoto || loadingLogo}>Use Rumi Guitars sample</button>
      </div>
      <div className={styles.row}>
        <label>Preview size<select value={size} onChange={event => setSize(event.target.value as DesignSize)}>{Object.entries(DESIGN_SIZES).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}</select></label>
        <label>Brand name<input maxLength={32} value={brand} onChange={event => changeBrand(event.target.value)} /></label>
        <label className={styles.headline}>Headline<input maxLength={64} value={headline} onChange={event => setHeadline(event.target.value)} aria-describedby="headline-tip" /></label>
        <label>Supporting line<input maxLength={48} value={detail} onChange={event => setDetail(event.target.value)} /></label>
        <label>Button text<input maxLength={32} value={cta} onChange={event => setCta(event.target.value)} /></label>
        <label>Website label<input maxLength={48} value={website} onChange={event => setWebsite(event.target.value)} /></label>
      </div>
      <p id="headline-tip" className={styles.hint}>A short headline gives the product room to shine. The layout includes your logo, display lettering, color accents, a supporting line and a clear next step.</p>
      <div className={styles.photoControls}>
        <label>Try your own photo<input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void chooseImage(event.target.files?.[0], "photo")} /></label>
        <label>Use your own logo<input ref={logoUpload} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void chooseImage(event.target.files?.[0], "logo")} /></label>
        <label className={styles.check}><input type="checkbox" checked={customAccent} onChange={event => setCustomAccent(event.target.checked)} /> Use one brand accent</label>
        {customAccent && <label>Accent color<input type="color" value={accent} onChange={event => setAccent(event.target.value)} /></label>}
      </div>
      <p className={styles.hint}>{customPhoto ? "Your photo is used only in this browser preview." : "Sample: an original Martinez MF-17 photo from the Rumi Guitars website."} Uploaded assets stay in this browser. Previewing uses no AI credits.</p>
      {!logo && !loadingLogo && <p className={styles.warning}>Upload this brand’s logo to finish its designs and enable downloads.</p>}
      {fontError && <p role="alert" className={styles.warning}>The design lettering could not load. <button type="button" onClick={() => setFontAttempt(value => value + 1)}>Retry lettering</button></p>}
      {headlineTooLong && <p role="alert" className={styles.warning}>Shorten the headline so it fits in three large, readable lines. Downloads will be available once it fits.</p>}
      <p role="status" className={styles.status}>{message}</p>
    </section>
    <div className={styles.grid}>
      {previews.map((format, i) => <article key={format.value} className={styles.card}>
        <div className={styles.cardHeader}><span className={styles.number}>0{i + 1}</span><div><h2>{format.label}</h2><p>{format.description}</p></div></div>
        <button type="button" className={styles.preview} aria-label={`Preview ${format.label}`} onClick={() => setSelected(format.value)} disabled={!photo || loading}>
          {photo && fonts ? <img src={svgUrl(format.svg)} alt={`${format.label} sample for ${brand}`} width={1080} height={DESIGN_SIZES[size].height} /> : <span className={styles.placeholder}>{fontError ? "Retry lettering above to see the finished design." : loading ? "Preparing branded designs…" : "Choose a photo to preview these formats."}</span>}
          <span className={styles.zoom}>View full size ↗</span>
        </button>
        <div className={styles.actions}><span>1080 × {DESIGN_SIZES[size].height} · PNG</span><button type="button" disabled={!canDownload} onClick={() => void download(format.value)}>{downloading === format.value ? "Preparing…" : `Download ${format.label}`}</button></div>
      </article>)}
    </div>
    <dialog ref={dialog} className={styles.dialog} onClose={() => setSelected(null)} onCancel={() => setSelected(null)} aria-label={open ? `${open.label} full-size preview` : "Design preview"}>
      {open && <><div className={styles.dialogHeader}><h2>{open.label}</h2><button type="button" autoFocus onClick={() => setSelected(null)}>Close preview</button></div><img src={svgUrl(open.svg)} alt={`${open.label} full-size sample`} width={1080} height={DESIGN_SIZES[size].height} /><button type="button" disabled={!canDownload} onClick={() => void download(open.value)}>Download sample PNG</button><p role="status">{message}</p></>}
    </dialog>
  </div>;
}
