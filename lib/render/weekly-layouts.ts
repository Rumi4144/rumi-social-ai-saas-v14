import type { SocialSvgInput } from "./svg";
import { lightBrandPalette, mixColor } from "./light-palette";
import { weeklyFontMetrics, weeklyFontVerticalMetrics } from "./weekly-font-metrics";

export const WEEKLY_DESIGNS = ["weekly-banner", "weekly-orbit", "weekly-editorial", "weekly-diagonal", "weekly-frame", "weekly-ribbon", "weekly-duotone"] as const;
export type WeeklyDesign = typeof WEEKLY_DESIGNS[number];
export const WEEKLY_DESIGN_CHOICES = [
  { value: "weekly-banner", label: "Color Banner", description: "Giant display lettering and a sweeping color field beside the original product." },
  { value: "weekly-orbit", label: "Color Orbit", description: "An immersive photograph, luminous rings and a bold two-tone headline." },
  { value: "weekly-editorial", label: "Editorial Feature", description: "Oversized serif lettering, an offset photograph and sculpted color bands." },
  { value: "weekly-diagonal", label: "Diagonal Spotlight", description: "A full product view meets a dramatic angled headline panel." },
  { value: "weekly-frame", label: "Signature Frame", description: "A vivid typographic poster with a large photograph and graphic corner accents." },
  { value: "weekly-ribbon", label: "Ribbon Spotlight", description: "Flowing brand-color ribbons and a prominent headline around the photograph." },
  { value: "weekly-duotone", label: "Split Statement", description: "Contrasting color fields, a tall product view and stacked display lettering." },
] as const;
export function isWeeklyDesign(value?: string): value is WeeklyDesign { return WEEKLY_DESIGNS.some(style => style === value); }
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
type Face = "display" | "editorial" | "body";
function measure(value: string, size: number, face: Face) {
  return [...value].reduce((sum, c) => sum + (weeklyFontMetrics[face][c] ?? 1000), 0) * size / 1000;
}
function wrap(value: string, width: number, size: number, face: Face) {
  const lines: string[] = []; let line = "";
  for (const token of value.trim().split(/\s+/u).filter(Boolean)) {
    // Keep every character, even for unusually long model names. Never silently
    // truncate a generated headline or squeeze its lettering to an arbitrary width.
    const parts: string[] = []; let part = "";
    for (const character of token) {
      if (part && measure(part + character, size, face) > width) { parts.push(part); part = ""; }
      part += character;
    }
    if (part) parts.push(part);
    for (const word of parts) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next, size, face) > width) { lines.push(line); line = word; } else line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
export function weeklyHeadline(value: string, width: number, height: number, preferred = 150, face: Face = "display") {
  const normalized = face === "display" ? value.trim().toUpperCase() : value.trim();
  let size = preferred, lines = wrap(normalized, width * .97, size, face);
  const metrics = weeklyFontVerticalMetrics[face];
  const extent = () => (metrics.ascent + metrics.descent) * size / 1000 + Math.max(0, lines.length - 1) * size * 1.04;
  const wordTooWide = () => normalized.split(/\s+/u).some(word => measure(word, size, face) > width * .97);
  while (size > 20 && (extent() > height || wordTooWide())) { size -= 2; lines = wrap(normalized, width * .97, size, face); }
  return { size, lines, baseline: metrics.ascent * size / 1000, height: extent() };
}
function inkOn(color: string) {
  const channels = color.slice(1).match(/../g)!.map(v => { const s = parseInt(v, 16) / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .179 ? "#111827" : "#ffffff";
}
/** These are the production weekly compositions, also used by the admin gallery.
 * Original product and logo pixels are embedded, never generated or redrawn. */
export function renderWeeklyDesign(input: SocialSvgInput, style: WeeklyDesign) {
  const h = input.format === "story" ? 1920 : input.format === "square" ? 1080 : 1350;
  const story = h === 1920, square = h === 1080, top = story ? 120 : 48, bottom = story ? 150 : 50;
  const { ink, paper, brand, accent } = lightBrandPalette(input.primaryColor, input.accentColor, input.secondaryColor);
  const warm = mixColor(accent, "#ffffff", .91), glow = mixColor(accent, "#ffffff", .70), accentText = inkOn(accent);
  const family = { display: "Barlow Condensed ExtraBold", editorial: "Cormorant Garamond Light", body: "Noto Sans" };
  const font = (name: string, value: string | undefined, weight: number) => value && /^data:font\/(?:woff2?|ttf);base64,[A-Za-z0-9+/=]+$/.test(value) ? `@font-face{font-family:'${name}';font-weight:${weight};src:url('${value}')}` : "";
  const fonts = `<style>${font(family.display, input.designFonts?.display, 800)}${font(family.editorial, input.designFonts?.editorial, 600)}${font(family.body, input.designFonts?.body, 400)}</style>`;
  const text = (value: string, x: number, y: number, size: number, fill: string, face: Face = "body", extra = "") => `<text x="${x}" y="${y}" fill="${fill}" font-family="${family[face]}, ${face === "editorial" ? "Georgia, serif" : "Arial, sans-serif"}" font-size="${size}" font-weight="${face === "display" ? 800 : face === "editorial" ? 600 : 400}" font-kerning="none" ${extra}>${esc(value)}</text>`;
  const photo = (x: number, y: number, w: number, height: number) => input.imageUrl ? `<image data-role="product-photo" href="${esc(input.imageUrl)}" x="${x}" y="${y}" width="${w}" height="${height}" preserveAspectRatio="xMidYMid meet"/>` : "";
  const title = (x: number, y: number, w: number, height: number, fill: string, highlight = fill, face: Face = "display", preferred = 150) => {
    const fitted = weeklyHeadline(input.headline, w, height, preferred, face);
    return `<g data-role="headline" data-box="${x},${y},${w},${height}">${fitted.lines.map((line, i) => text(line, x, y + fitted.baseline + i * fitted.size * 1.04, fitted.size, i === fitted.lines.length - 1 ? highlight : fill, face)).join("")}</g>`;
  };
  const logo = input.logoUrl ? `<g data-role="logo-lockup"><rect x="44" y="${top - 8}" width="326" height="142" rx="4" fill="#fff"/><image data-role="brand-logo" href="${esc(input.logoUrl)}" x="52" y="${top}" width="310" height="126" preserveAspectRatio="xMidYMid meet"/></g>` : "";
  const brandSize = Math.min(42, 900 / Math.max(1, measure(input.brand.toUpperCase(), 1, "body")));
  const brandName = text(input.brand.toUpperCase(), 52, top + 65, brandSize, ink);
  const button = (x: number, y: number, fill: string, foreground: string, maxWidth = 520) => {
    const value = input.cta || "Explore more", size = Math.min(29, (maxWidth - 100) / Math.max(1, measure(value, 1, "body")));
    const width = Math.min(maxWidth, Math.max(320, measure(value, size, "body") + 100));
    return `<g data-role="call-to-action"><rect x="${x}" y="${y}" width="${width}" height="78" rx="39" fill="${fill}"/>${text(value, x + 28, y + 49, size, foreground)}<path d="M${x + width - 58} ${y + 39}h28m-10-10 10 10-10 10" stroke="${foreground}" stroke-width="2.5" fill="none"/></g>`;
  };
  const py = top + 155, ctaY = h - bottom - 78;
  let artwork = "", headerColor = ink;
  if (style === "weekly-banner") {
    // Color and lettering share a tall split composition; the product has its own
    // uninterrupted area, including catalog photos with narrow/black backgrounds.
    artwork = `<rect width="1080" height="${h}" fill="${warm}"/><path d="M620 0H1080V${h}H380Q820 ${h * .6} 620 0" fill="${accent}"/><path d="M710 0Q950 ${h * .6} 460 ${h}" stroke="${glow}" stroke-width="3" fill="none"/><rect x="492" y="${py}" width="536" height="${h - py - bottom - 120}" rx="268" fill="${ink}"/>${photo(512, py + 20, 496, h - py - bottom - 160)}<path d="M52 ${py + 105}h80" stroke="${accent}" stroke-width="9"/>${title(52, py + 155, 430, Math.min(520, ctaY - py - 190), ink, accent, "display", 168)}${button(52, ctaY, ink, "#ffffff", 440)}`;
  } else if (style === "weekly-orbit") {
    headerColor = "#ffffff";
    artwork = `<rect width="1080" height="${h}" fill="${ink}"/>${photo(0, py - 50, 1080, h - py + 50)}<rect width="1080" height="${h}" fill="url(#weekly-shade)"/><circle cx="1090" cy="${h * .36}" r="410" stroke="${accent}" stroke-width="24" fill="none"/><circle cx="1090" cy="${h * .36}" r="448" stroke="${glow}" stroke-width="2" fill="none"/>${title(52, ctaY - 325, 976, 285, "#ffffff", glow, "display", 164)}${button(52, ctaY, accent, accentText)}`;
  } else if (style === "weekly-editorial") {
    artwork = `<rect width="1080" height="${h}" fill="${warm}"/><path d="M1060 0C290 ${h * .3} 1270 ${h * .7} 400 ${h}" stroke="${mixColor(brand, "#ffffff", .78)}" stroke-width="300" fill="none"/><path d="M1080 0C350 ${h * .3} 1310 ${h * .7} 460 ${h}" stroke="${accent}" stroke-width="3" fill="none"/><rect x="450" y="${py}" width="578" height="${h - py - bottom - 120}" fill="${ink}"/>${photo(470, py + 20, 538, h - py - bottom - 160)}<rect x="30" y="${py + 120}" width="555" height="${square ? 330 : 440}" fill="${warm}" fill-opacity=".96"/>${title(52, py + 140, 510, square ? 290 : 400, ink, ink, "editorial", 138)}<path d="M52 ${ctaY - 45}h130" stroke="${accent}" stroke-width="3"/>${button(52, ctaY, ink, "#ffffff")}`;
  } else if (style === "weekly-diagonal") {
    headerColor = "#ffffff";
    const panel = ctaY - 365;
    artwork = `<rect width="1080" height="${h}" fill="${ink}"/><path d="M785 0H1080V${h}H545Z" fill="${accent}"/>${photo(40, py - 25, 1000, panel - py + 110)}<path d="M0 ${panel}L1080 ${panel + 80}V${h}H0Z" fill="${accent}"/><path d="M0 ${panel - 18}L1080 ${panel + 62}" stroke="${glow}" stroke-width="4"/>${title(52, panel + 105, 976, 220, accentText, accentText, "display", 150)}${button(52, ctaY, ink, "#ffffff")}`;
  } else if (style === "weekly-frame") {
    const headlineH = square ? 210 : 280, imageY = py + headlineH + 20;
    artwork = `<rect width="1080" height="${h}" fill="${accent}"/><path d="M0 0H1080V${py - 12}L0 ${py + 30}Z" fill="${paper}"/>${title(52, py + 25, 976, headlineH - 20, accentText, accentText, "display", 152)}<rect x="80" y="${imageY + 18}" width="948" height="${ctaY - imageY - 40}" fill="${glow}"/><rect x="52" y="${imageY}" width="948" height="${ctaY - imageY - 40}" fill="${ink}"/>${photo(72, imageY + 12, 908, ctaY - imageY - 64)}<path d="M28 ${imageY + 90}V${imageY - 16}h130M1024 ${ctaY - 140}v116H894" stroke="${accentText}" stroke-width="4" fill="none"/>${button(52, ctaY, ink, "#ffffff")}`;
  } else if (style === "weekly-ribbon") {
    headerColor = "#ffffff";
    artwork = `<rect width="1080" height="${h}" fill="${ink}"/>${photo(0, py - 35, 1080, h - py + 35)}<rect width="1080" height="${h}" fill="url(#weekly-shade)"/><path d="M1100 -100C650 ${h * .18} 1290 ${h * .4} 1040 ${h * .65}" stroke="url(#weekly-ribbon)" stroke-width="120" fill="none"/><path d="M1100 -70C700 ${h * .18} 1270 ${h * .42} 1030 ${h * .66}" stroke="${glow}" stroke-width="3" fill="none"/><path d="M-65 ${h * .68}Q170 ${h * .8} 250 ${h + 90}" stroke="${accent}" stroke-width="55" fill="none"/>${title(52, ctaY - 325, 976, 285, "#ffffff", glow, "display", 164)}${button(52, ctaY, glow, ink)}`;
  } else if (style === "weekly-duotone") {
    artwork = `<rect width="1080" height="${h}" fill="${paper}"/><rect y="${py}" width="520" height="${h - py}" fill="${brand}"/><rect x="520" y="${py}" width="560" height="${h - py}" fill="${accent}"/><circle cx="820" cy="${py + 220}" r="210" fill="${glow}"/><rect x="570" y="${py + 90}" width="450" height="${h - py - bottom - 210}" fill="${ink}"/>${photo(588, py + 108, 414, h - py - bottom - 246)}<path d="M52 ${py + 65}h70" stroke="${glow}" stroke-width="8"/>${title(52, py + 120, 420, ctaY - py - 165, inkOn(brand), inkOn(brand), "display", 160)}${button(52, ctaY, glow, ink, 440)}`;
  }
  const defs = `<defs><linearGradient id="weekly-shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${ink}" stop-opacity=".05"/><stop offset=".40" stop-color="${ink}" stop-opacity="0"/><stop offset=".68" stop-color="${ink}" stop-opacity=".86"/><stop offset="1" stop-color="${ink}"/></linearGradient><linearGradient id="weekly-ribbon"><stop stop-color="${brand}"/><stop offset=".55" stop-color="${accent}"/><stop offset="1" stop-color="${glow}"/></linearGradient></defs>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${h}" viewBox="0 0 1080 ${h}" role="img"><title>${esc(input.brand)} — ${esc(input.headline)}</title>${fonts}${defs}${artwork}${logo || brandName.replace(`fill="${ink}"`, `fill="${headerColor}"`)}</svg>`;
}
