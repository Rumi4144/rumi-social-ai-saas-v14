export const DESIGN_FORMATS = [
  { value: "bright-bold", label: "Bright & Bold", description: "Oversized condensed lettering, a sweeping color field and a framed product portrait.", accent: "#ef653d" },
  { value: "vivid-overlay", label: "Vivid Overlay", description: "An immersive photograph, luminous color ribbons and a dramatic two-tone headline.", accent: "#ec418a" },
  { value: "clean-editorial", label: "Clean Editorial", description: "A sculpted photo window, expressive serif lettering and warm metallic accents.", accent: "#b58a40" },
] as const;
export type DesignFormat = typeof DESIGN_FORMATS[number]["value"];
export type DesignSize = "portrait" | "square" | "story";
export const DESIGN_SIZES = { portrait: { label: "Portrait · 4:5", height: 1350 }, square: { label: "Square · 1:1", height: 1080 }, story: { label: "Story · 9:16", height: 1920 } } as const;
export type DesignFonts = { display: string; editorial: string; italic: string; body: string };
export type MeasureDesignText = (text: string, size: number, face: "display" | "editorial" | "italic" | "body") => number;
export type DesignSample = { brand: string; headline: string; cta: string; photo: string; logo?: string; detail?: string; website?: string; size: DesignSize; accent?: string; fonts?: DesignFonts; measure?: MeasureDesignText };
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]!));
const fallbackMeasure: MeasureDesignText = (value, size, face) => [...value].reduce((sum, c) => sum + (/[MW@%]/.test(c) ? .83 : /[Iil.,'!:;|]/.test(c) ? .25 : c === " " ? .23 : /[A-Z0-9]/.test(c) ? .63 : .5), 0) * size * (face === "display" ? .75 : 1);
function linesFor(value: string, size: number, width: number, measure: MeasureDesignText, face: "display" | "editorial") {
  const lines: string[] = []; let current = "";
  for (const word of value.trim().split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (current && measure(next, size, face) > width) { lines.push(current); current = word; } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}
export function designHeadline(value: string, style: DesignFormat = "bright-bold", measure: MeasureDesignText = fallbackMeasure) {
  const editorial = style === "clean-editorial", face = editorial ? "editorial" : "display";
  const width = style === "vivid-overlay" ? 900 : editorial ? 530 : 490;
  const normalized = editorial ? value.trim() : value.trim().toUpperCase();
  let size = editorial ? 144 : style === "vivid-overlay" ? 174 : 168;
  let lines = linesFor(normalized, size, width, measure, face);
  while (size > 104 && (lines.length > 3 || lines.some(line => measure(line, size, face) > width))) { size -= 2; lines = linesFor(normalized, size, width, measure, face); }
  const overflow = lines.length > 3 || lines.some(line => measure(line, size, face) > width);
  return { size, lines: overflow ? lines.slice(0, 3).map(line => measure(line, size, face) > width ? line.slice(0, 8) + "…" : line) : lines, overflow };
}
const family = { display: "RumiDisplay", editorial: "RumiEditorial", italic: "RumiEditorialItalic", body: "RumiBody" } as const;
/** Standalone SVG: embeds the original photo, actual logo and licensed fonts so exports match previews. */
export function renderDesignFormat(sample: DesignSample, style: DesignFormat) {
  const h = DESIGN_SIZES[sample.size].height, square = sample.size === "square", story = sample.size === "story";
  const preset = DESIGN_FORMATS.find(item => item.value === style)!;
  const accent = /^#[a-f\d]{6}$/i.test(sample.accent || "") ? sample.accent! : preset.accent;
  const top = story ? 150 : 58, bottom = story ? 170 : 64;
  const headline = designHeadline(sample.headline, style, sample.measure);
  if (square && style !== "vivid-overlay") headline.size = Math.min(150, headline.size);
  const photo = (x: number, y: number, w: number, height: number, clip = "", position = "xMidYMid slice") => `<image data-role="product-photo" href="${esc(sample.photo)}" x="${x}" y="${y}" width="${w}" height="${height}" preserveAspectRatio="${position}" ${clip ? `clip-path="url(#${clip})"` : ""}/>`;
  const text = (value: string, x: number, y: number, size: number, fill: string, face: keyof typeof family = "body", extra = "") => `<text x="${x}" y="${y}" font-family="${family[face]}, ${face.includes("editorial") || face === "italic" ? "Georgia, serif" : "Arial, sans-serif"}" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`;
  // Do not replace a missing customer logo with a fabricated mark or another brand's logo.
  const logo = (x: number, y: number, w = 366) => sample.logo ? `<g data-role="logo-lockup"><rect x="${x - 12}" y="${y - 12}" width="${w + 24}" height="172" rx="4" fill="#fff"/><image data-role="brand-logo" href="${esc(sample.logo)}" x="${x}" y="${y}" width="${w}" height="148" preserveAspectRatio="xMidYMid meet"/></g>` : "";
  const title = (x: number, y: number, fill: string, highlight: string, editorial = false) => headline.lines.map((line, i) => {
    const last = i === headline.lines.length - 1;
    return text(line, x, y + i * headline.size * .97, headline.size, last ? highlight : fill, editorial ? last ? "italic" : "editorial" : "display", 'letter-spacing="-2"');
  }).join("");
  const cta = (x: number, y: number, fill: string, ink: string, outlined = false) => {
    const w = Math.min(720, Math.max(350, (sample.measure || fallbackMeasure)(sample.cta, 29, "body") + 110));
    return `<g data-role="call-to-action"><rect x="${x}" y="${y}" width="${w}" height="82" rx="41" fill="${fill}" ${outlined ? `stroke="${ink}" stroke-width="2"` : ""}/>${text(sample.cta, x + 30, y + 52, 29, ink)}<path d="M${x + w - 67} ${y + 41}h32m-11-11 11 11-11 11" stroke="${ink}" stroke-width="2.5" fill="none"/></g>`;
  };
  const footer = (fill: string) => `${text(sample.website || sample.brand, 64, h - bottom + 5, 25, fill)}<path d="M930 ${h - bottom - 3}h86" stroke="${fill}" stroke-width="1.5"/>`;
  const detail = (x: number, y: number, fill: string, width = 850) => {
    const value = (sample.detail || "").trim();
    const size = Math.min(31, width / Math.max(1, (sample.measure || fallbackMeasure)(value, 1, "body")));
    return text(value, x, y, size, fill);
  };
  let content = "", definitions = "";
  if (style === "bright-bold") {
    const py = top + 160, ph = h - py - bottom - 95;
    const titleY = top + (square ? 390 : story ? 480 : 370), detailY = titleY + (headline.lines.length - 1) * headline.size * .97 + 65;
    definitions = `<linearGradient id="paper"><stop stop-color="#fff5e4"/><stop offset=".46" stop-color="#fff5e4"/><stop offset="1" stop-color="#fff5e4" stop-opacity="0"/></linearGradient><radialGradient id="warm"><stop stop-color="#ffc75d"/><stop offset="1" stop-color="${accent}"/></radialGradient><clipPath id="hero"><path d="M415 ${py + 280}a310 280 0 0 1 620 0v${ph - 280}H415Z"/></clipPath>`;
    content = `<rect width="1080" height="${h}" fill="#fff5e4"/><circle cx="1030" cy="${top + 360}" r="640" fill="url(#warm)"/><g fill="none" stroke="#fff4cd" stroke-width="2" opacity=".65"><ellipse cx="1060" cy="${h * .55}" rx="570" ry="${h * .45}"/><ellipse cx="1060" cy="${h * .55}" rx="545" ry="${h * .43}"/></g><path d="M393 ${py + 280}a332 302 0 0 1 664 0v${ph - 265}H393Z" fill="#fefbf2"/>${photo(415, py, 620, ph, "hero")}<rect y="${top + 220}" width="650" height="${h - top - 220}" fill="url(#paper)"/>${logo(64, top)}${text("PRODUCT SPOTLIGHT", 64, titleY - 185, 23, "#85452e", "body", 'letter-spacing="4"')}<path d="M64 ${titleY - 155}h58" stroke="${accent}" stroke-width="7"/>${title(64, titleY, "#173832", accent)}${detail(66, detailY, "#345248", 440)}${cta(64, h - bottom - 153, "#173832", "#fff8e9")}${footer("#173832")}`;
  } else if (style === "vivid-overlay") {
    const titleY = h - bottom - 245 - (headline.lines.length - 1) * headline.size * .97;
    definitions = `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#0b1733" stop-opacity=".15"/><stop offset=".38" stop-color="#0b1733" stop-opacity="0"/><stop offset=".69" stop-color="#111b38" stop-opacity=".84"/><stop offset="1" stop-color="#101934"/></linearGradient><linearGradient id="ribbon"><stop stop-color="#5b5be9"/><stop offset=".6" stop-color="${accent}"/><stop offset="1" stop-color="#ffb44f"/></linearGradient>`;
    content = `${photo(0, 0, 1080, h)}<rect width="1080" height="${h}" fill="url(#shade)"/><path d="M1080 0C720 ${h * .2} 1330 ${h * .45} 1060 ${h * .69}" stroke="url(#ribbon)" stroke-width="145" fill="none" opacity=".88"/><path d="M1080 40C780 ${h * .2} 1300 ${h * .48} 1045 ${h * .65}" stroke="#ffe3a5" stroke-width="3" fill="none"/><path d="M-90 ${h * .72}Q230 ${h * .86} 260 ${h + 100}" stroke="url(#ribbon)" stroke-width="65" fill="none" opacity=".8"/>${logo(64, top)}${text("PRODUCT SPOTLIGHT", 64, titleY - headline.size - 18, 23, "#fff1d3", "body", 'letter-spacing="4"')}${title(64, titleY, "#fffaf0", "#ffcd73")}${detail(67, titleY + (headline.lines.length - 1) * headline.size * .97 + 55, "#fff1da")}${cta(64, h - bottom - 132, "#ffcd73", "#152539")}${footer("#fff1da")}`;
  } else {
    const py = top + 175, ph = h - py - bottom - 110, titleY = top + (square ? 390 : story ? 480 : 375);
    definitions = `<linearGradient id="vellum"><stop stop-color="#f7f5ea"/><stop offset=".36" stop-color="#f7f5ea"/><stop offset="1" stop-color="#f7f5ea" stop-opacity="0"/></linearGradient><clipPath id="arch"><rect x="365" y="${py}" width="660" height="${ph}" rx="330"/></clipPath><linearGradient id="gold"><stop stop-color="#f5dfab"/><stop offset=".5" stop-color="${accent}"/><stop offset="1" stop-color="#f5dfab"/></linearGradient>`;
    content = `<rect width="1080" height="${h}" fill="#f7f5ea"/><path d="M1080 ${top + 60}C680 ${top - 50} 140 ${h * .6} 480 ${h}" stroke="#d5e4d9" stroke-width="300" fill="none"/><rect x="346" y="${py - 18}" width="697" height="${ph + 36}" rx="349" fill="none" stroke="url(#gold)" stroke-width="2"/>${photo(365, py, 660, ph, "arch")}<rect y="${top + 210}" width="690" height="${h - top - 210}" fill="url(#vellum)"/>${logo(64, top)}${text("THE COLLECTION", 64, titleY - 168, 23, "#695733", "body", 'letter-spacing="4"')}<path d="M64 ${titleY - 139}h70" stroke="${accent}" stroke-width="2"/>${title(64, titleY, "#183a32", "#90662a", true)}${detail(66, titleY + (headline.lines.length - 1) * headline.size * .97 + 65, "#42594c", 460)}${cta(64, h - bottom - 153, "#f7f5ea", "#183a32", true)}${footer("#183a32")}`;
  }
  const fonts = sample.fonts ? `<style>${(Object.entries(sample.fonts) as Array<[keyof DesignFonts, string]>).filter(([, data]) => /^data:(font\/|application\/).+;base64,[a-z\d+/=]+$/i.test(data)).map(([name, data]) => `@font-face{font-family:${family[name]};src:url('${data}');font-weight:400;font-style:normal;}`).join("")}</style>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${h}" viewBox="0 0 1080 ${h}" role="img"><title>${esc(sample.brand)} — ${esc(sample.headline)}</title><defs>${fonts}${definitions}</defs>${content}</svg>`;
}
