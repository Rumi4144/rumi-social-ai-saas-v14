export const DESIGN_FORMATS = [
  { value: "bright-bold", label: "Bright & Bold", description: "A generous product photo, warm paper and a bold headline.", accent: "#f16437" },
  { value: "vivid-overlay", label: "Vivid Overlay", description: "A full-frame photograph with clear white lettering and a colorful accent.", accent: "#e32983" },
  { value: "clean-editorial", label: "Clean Editorial", description: "A bright photo-led layout with elegant lettering and a crisp frame.", accent: "#2364db" },
] as const;
export type DesignFormat = typeof DESIGN_FORMATS[number]["value"];
export type DesignSize = "portrait" | "square" | "story";
export const DESIGN_SIZES = { portrait: { label: "Portrait · 4:5", height: 1350 }, square: { label: "Square · 1:1", height: 1080 }, story: { label: "Story · 9:16", height: 1920 } } as const;
export type DesignSample = { brand: string; headline: string; cta: string; photo: string; size: DesignSize; accent?: string };
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
const measure = (value: string, size: number) => [...value].reduce((sum, c) => sum + (/[MW@%]/.test(c) ? .92 : /[Iil.,'!:;|]/.test(c) ? .28 : c === " " ? .28 : /[A-Z0-9]/.test(c) ? .68 : .56), 0) * size;
function linesFor(value: string, size: number, width: number) {
  const lines: string[] = []; let current = "";
  for (const word of value.trim().split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (current && measure(next, size) > width) { lines.push(current); current = word; } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}
export function designHeadline(value: string, width = 936) {
  const normalized = value.trim().toUpperCase();
  let size = 112, lines = linesFor(normalized, size, width);
  while (size > 84 && (lines.length > 3 || lines.some(line => measure(line, size) > width))) { size -= 2; lines = linesFor(normalized, size, width); }
  const overflow = lines.length > 3 || lines.some(line => measure(line, size) > width);
  // A long preview is visibly shortened; the gallery blocks download until the
  // administrator supplies a headline that fits at a readable type size.
  return { size, lines: overflow ? lines.slice(0, 3).map(line => measure(line, size) > width ? line.slice(0, Math.floor(width / size)) + "…" : line) : lines, overflow };
}

/** Preview-only layouts; customer template defaults are selected separately. */
export function renderDesignFormat(sample: DesignSample, style: DesignFormat) {
  const h = DESIGN_SIZES[sample.size].height, story = sample.size === "story";
  const preset = DESIGN_FORMATS.find(item => item.value === style)!;
  const accent = /^#[a-f\d]{6}$/i.test(sample.accent || "") ? sample.accent! : preset.accent;
  const ink = "#142b39", margin = 72, top = story ? 150 : 52, bottom = story ? 170 : 60;
  const headline = designHeadline(sample.headline), lineHeight = headline.size * 1.04;
  const copyHeight = Math.max(2, headline.lines.length) * lineHeight + 150;
  const copyTop = h - bottom - copyHeight;
  const photo = (x: number, y: number, w: number, height: number, fit = "xMidYMid slice") => `<image href="${esc(sample.photo)}" x="${x}" y="${y}" width="${w}" height="${height}" preserveAspectRatio="${fit}"/>`;
  const text = (value: string, x: number, y: number, size: number, fill: string, extra = "") => `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`;
  const brand = (fill: string) => text(sample.brand.toUpperCase(), margin, top + 30, 28, fill, 'font-weight="700" letter-spacing="3"');
  const title = (y: number, fill: string, editorial = false) => headline.lines.map((line, i) => `<text x="${margin}" y="${y + headline.size + i * lineHeight}" fill="${fill}" font-family="${editorial ? "Georgia, serif" : "Arial, Helvetica, sans-serif"}" font-size="${headline.size}" font-weight="${editorial ? 400 : 800}">${esc(line)}</text>`).join("");
  const ctaY = h - bottom - 74;
  const cta = (fill: string) => `${text(sample.cta || "Explore the collection", margin, ctaY + 47, 32, fill, 'font-weight="700"')}<path d="M944 ${ctaY + 35}h38m-13-13 13 13-13 13" stroke="${fill}" stroke-width="4" fill="none"/>`;
  let content = "";
  if (style === "bright-bold") {
    content = `<rect width="1080" height="${h}" fill="#fff7e8"/>${photo(0, 0, 1080, copyTop + 24)}<rect x="0" y="${copyTop}" width="1080" height="${h - copyTop}" fill="#fff7e8"/><rect x="${margin - 20}" y="${top - 12}" width="936" height="68" rx="12" fill="#fff7e8" fill-opacity=".95"/>${brand(ink)}<path d="M${margin} ${copyTop + 18}h100" stroke="${accent}" stroke-width="9"/>${title(copyTop + 38, ink)}${cta(ink)}<rect x="0" y="${h - 14}" width="1080" height="14" fill="${accent}"/>`;
  } else if (style === "vivid-overlay") {
    content = `${photo(0, 0, 1080, h)}<rect width="1080" height="${h}" fill="url(#shade)"/><rect x="${margin - 20}" y="${top - 12}" width="936" height="68" rx="12" fill="#fff" fill-opacity=".95"/>${brand(ink)}<path d="M${margin} ${copyTop + 18}h100" stroke="${accent}" stroke-width="9"/>${title(copyTop + 38, "#fff")}<rect x="${margin - 20}" y="${ctaY}" width="936" height="74" rx="12" fill="#fff"/>${cta(ink)}<rect width="14" height="${h}" fill="${accent}"/>`;
  } else {
    content = `<rect width="1080" height="${h}" fill="#fff"/>${brand(ink)}<path d="M${margin} ${top + 65}H1008" stroke="${accent}" stroke-width="5"/>${photo(36, top + 95, 1008, Math.max(200, copyTop - top - 87))}${title(copyTop + 28, ink, true)}<path d="M${margin} ${ctaY - 14}H1008" stroke="${accent}" stroke-width="3"/>${cta(ink)}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${h}" viewBox="0 0 1080 ${h}"><defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#102736" stop-opacity="0"/><stop offset=".40" stop-color="#102736" stop-opacity="0"/><stop offset=".70" stop-color="#102736" stop-opacity=".82"/><stop offset="1" stop-color="#102736" stop-opacity=".98"/></linearGradient></defs>${content}</svg>`;
}
