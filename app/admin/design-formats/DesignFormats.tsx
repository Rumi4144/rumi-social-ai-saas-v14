"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DESIGN_FORMATS, DESIGN_SIZES, designHeadline, renderDesignFormat, type DesignFormat, type DesignSize } from "@/lib/render/design-formats";
import styles from "./DesignFormats.module.css";

const dataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Could not read this photo.")); reader.readAsDataURL(blob);
});
const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("Could not open this picture. Try another photo.")); image.src = src;
});
const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export default function DesignFormats() {
  const [brand, setBrand] = useState("Rumi Guitars"), [headline, setHeadline] = useState("Find your sound"), [cta, setCta] = useState("Explore the collection");
  const [size, setSize] = useState<DesignSize>("portrait"), [photo, setPhoto] = useState("");
  const [customPhoto, setCustomPhoto] = useState(false), [customAccent, setCustomAccent] = useState(false), [accent, setAccent] = useState("#f16437");
  const [selected, setSelected] = useState<DesignFormat | null>(null), [downloading, setDownloading] = useState<DesignFormat | null>(null), [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const dialog = useRef<HTMLDialogElement>(null), upload = useRef<HTMLInputElement>(null), photoRequest = useRef(0);
  async function resetPhoto() {
    const request = ++photoRequest.current; setLoading(true); setMessage("");
    try {
      const response = await fetch("/design-formats/rumi-guitar.png");
      if (!response.ok) throw new Error("The sample photo could not load. Choose a photo below or try again.");
      const next = await dataUrl(await response.blob());
      if (request !== photoRequest.current) return;
      setPhoto(next); setCustomPhoto(false); if (upload.current) upload.current.value = "";
    } catch (error) { if (request === photoRequest.current) setMessage(error instanceof Error ? error.message : "Could not load the sample photo."); }
    finally { if (request === photoRequest.current) setLoading(false); }
  }
  useEffect(() => { void resetPhoto(); return () => { photoRequest.current++; }; }, []);
  useEffect(() => { if (selected && !dialog.current?.open) dialog.current?.showModal(); else if (!selected && dialog.current?.open) dialog.current.close(); }, [selected]);
  const sample = { brand, headline, cta, photo, size, accent: customAccent ? accent : undefined };
  const previews = useMemo(() => DESIGN_FORMATS.map(format => ({ ...format, svg: renderDesignFormat(sample, format.value) })), [brand, headline, cta, photo, size, accent, customAccent]);
  const headlineTooLong = designHeadline(headline).overflow;
  const canDownload = Boolean(photo && brand.trim() && headline.trim() && cta.trim() && !headlineTooLong && !loading && !downloading);
  async function choosePhoto(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12_000_000) { setMessage("Choose a JPG, PNG or WebP photo under 12 MB."); return; }
    const request = ++photoRequest.current; setLoading(true); setMessage("");
    try {
      const source = await dataUrl(file), image = await loadImage(source);
      if (image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error("Choose a photo under 40 megapixels.");
      if (request !== photoRequest.current) return;
      setPhoto(source); setCustomPhoto(true);
    } catch (error) { if (request === photoRequest.current) setMessage(error instanceof Error ? error.message : "Could not read the photo."); }
    finally { if (request === photoRequest.current) setLoading(false); }
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
      <div><span className={styles.badge}>ADMIN PREVIEW</span><h1>Design Formats</h1><p>Bigger pictures. Clearer headlines. More color.</p></div>
      <p className={styles.note}>Compare new formats before choosing customer defaults. Samples stay in this preview area.</p>
    </header>
    <section className={styles.controls} aria-label="Preview settings">
      <div className={styles.row}>
        <label>Preview size<select value={size} onChange={event => setSize(event.target.value as DesignSize)}>{Object.entries(DESIGN_SIZES).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}</select></label>
        <label>Brand name<input maxLength={32} value={brand} onChange={event => setBrand(event.target.value)} /></label>
        <label className={styles.headline}>Headline<input maxLength={64} value={headline} onChange={event => setHeadline(event.target.value)} aria-describedby="headline-tip" /></label>
        <label>Button text<input maxLength={32} value={cta} onChange={event => setCta(event.target.value)} /></label>
      </div>
      <p id="headline-tip" className={styles.hint}>Keep the headline short: 4–8 words works well. Longer explanations belong in the post caption.</p>
      <div className={styles.photoControls}>
        <label>Try your own photo<input ref={upload} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void choosePhoto(event.target.files?.[0])} /></label>
        <button type="button" onClick={() => void resetPhoto()} disabled={loading}>{loading ? "Loading photo…" : "Use Rumi Guitars sample"}</button>
        <label className={styles.check}><input type="checkbox" checked={customAccent} onChange={event => setCustomAccent(event.target.checked)} /> Use one brand accent</label>
        {customAccent && <label>Accent color<input type="color" value={accent} onChange={event => setAccent(event.target.value)} /></label>}
      </div>
      <p className={styles.hint}>{customPhoto ? "Your photo is used only in this browser preview." : "Sample: an original Martinez MF-17 photo from the Rumi Guitars website."} Previewing uses no AI credits.</p>
      {headlineTooLong && <p role="alert" className={styles.warning}>Shorten the headline so it fits in three large, readable lines. Downloads will be available once it fits.</p>}
      <p role="status" className={styles.status}>{message}</p>
    </section>
    <div className={styles.grid}>
      {previews.map((format, i) => <article key={format.value} className={styles.card}>
        <div className={styles.cardHeader}><span className={styles.number}>0{i + 1}</span><div><h2>{format.label}</h2><p>{format.description}</p></div></div>
        <button type="button" className={styles.preview} aria-label={`Preview ${format.label}`} onClick={() => setSelected(format.value)} disabled={!photo || loading}>
          {photo ? <img src={svgUrl(format.svg)} alt={`${format.label} sample for ${brand}`} width={1080} height={DESIGN_SIZES[size].height} /> : <span className={styles.placeholder}>{loading ? "Loading sample photo…" : "Choose a photo to preview these formats."}</span>}
          <span className={styles.zoom}>View full size ↗</span>
        </button>
        <div className={styles.actions}><span>1080 × {DESIGN_SIZES[size].height}</span><button type="button" disabled={!canDownload} onClick={() => void download(format.value)}>{downloading === format.value ? "Preparing…" : `Download ${format.label}`}</button></div>
      </article>)}
    </div>
    <dialog ref={dialog} className={styles.dialog} onClose={() => setSelected(null)} onCancel={() => setSelected(null)} aria-label={open ? `${open.label} full-size preview` : "Design preview"}>
      {open && <><div className={styles.dialogHeader}><h2>{open.label}</h2><button type="button" autoFocus onClick={() => setSelected(null)}>Close preview</button></div><img src={svgUrl(open.svg)} alt={`${open.label} full-size sample`} width={1080} height={DESIGN_SIZES[size].height} /><button type="button" disabled={!canDownload} onClick={() => void download(open.value)}>Download sample PNG</button><p role="status">{message}</p></>}
    </dialog>
  </div>;
}
