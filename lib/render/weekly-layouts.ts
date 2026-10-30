import type { SocialSvgInput } from "./svg";
import { lightBrandPalette, mixColor } from "./light-palette";

export const WEEKLY_DESIGNS = ["weekly-banner", "weekly-orbit", "weekly-editorial", "weekly-diagonal", "weekly-frame"] as const;
export type WeeklyDesign = typeof WEEKLY_DESIGNS[number];
export const WEEKLY_DESIGN_CHOICES = [
  { value: "weekly-banner", label: "Color Banner", description: "A large original photograph, bold headline and bright brand accent." },
  { value: "weekly-orbit", label: "Color Orbit", description: "Original product photography with lively circular accents and clear lettering." },
  { value: "weekly-editorial", label: "Editorial Feature", description: "Generous photography, elegant display lettering and fine rules." },
  { value: "weekly-diagonal", label: "Diagonal Spotlight", description: "A dynamic angled color panel around your unchanged product photo." },
  { value: "weekly-frame", label: "Signature Frame", description: "A clean color frame, prominent image and centered display headline." },
] as const;
export function isWeeklyDesign(value?: string): value is typeof WEEKLY_DESIGNS[number] { return WEEKLY_DESIGNS.some(style => style === value); }
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
function rows(value: string, columns: number, limit = 2) {
  const result: string[] = []; let row = "";
  for (const word of value.trim().split(/\s+/)) { if ((row + " " + word).trim().length > columns && row) { result.push(row); row = word; } else row = (row + " " + word).trim(); }
  if (row) result.push(row);
  return result.slice(0, limit).map((line, index) => line.length > columns || index === limit - 1 && result.length > limit ? line.slice(0, columns - 1) + "…" : line);
}
/** Layout is code; the customer's original photo and logo are embedded without
 * regenerating their product, introducing fake logos or inventing claims. */
export function renderWeeklyDesign(input: SocialSvgInput, style: typeof WEEKLY_DESIGNS[number]) {
  const h = input.format === "story" ? 1920 : input.format === "square" ? 1080 : 1350;
  const { ink, paper, brand, accent } = lightBrandPalette(input.primaryColor, input.accentColor, input.secondaryColor);
  const vivid = mixColor(accent, "#ffffff", .08), warm = mixColor(accent, "#ffffff", .9);
  const luminance = vivid.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
  const accentText = luminance > .55 ? ink : "#ffffff";
  const font = (name: string, value: string | undefined, weight: number) => value && /^data:font\/(?:woff2?|ttf);base64,[A-Za-z0-9+/=]+$/.test(value) ? `@font-face{font-family:'${name}';font-weight:${weight};src:url('${value}')}` : "";
  const fonts = `<style>${font("Barlow Condensed ExtraBold", input.designFonts?.display, 800)}${font("Cormorant Garamond Light", input.designFonts?.editorial, 600)}${font("Noto Sans", input.designFonts?.body, 400)}</style>`;
  const photo = (x: number, y: number, w: number, height: number) => input.imageUrl ? `<image href="${esc(input.imageUrl)}" x="${x}" y="${y}" width="${w}" height="${height}" preserveAspectRatio="xMidYMid meet"/>` : "";
  const title = ({ x, y, width, pixels, columns, lines = 2, fill = ink, serif = false, centered = false, uppercase = false }: { x: number; y: number; width: number; pixels: number; columns: number; lines?: number; fill?: string; serif?: boolean; centered?: boolean; uppercase?: boolean }) => {
    const copy = rows(uppercase ? input.headline.toUpperCase() : input.headline, columns, lines);
    return `<text fill="${fill}" font-family="${serif ? "Cormorant Garamond Light, Georgia, serif" : "Barlow Condensed ExtraBold, Arial, sans-serif"}" font-size="${pixels}" font-weight="${serif ? 600 : 800}" text-anchor="${centered ? "middle" : "start"}">${copy.map((line, index) => `<tspan x="${x}" y="${y + index * pixels * .96}"${line.length * pixels * (serif ? .52 : .43) > width ? ` textLength="${width}" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(line)}</tspan>`).join("")}</text>`;
  };
  const logo = input.logoUrl ? `<rect x="50" y="35" width="200" height="88" rx="12" fill="#ffffff"/><image href="${esc(input.logoUrl)}" x="60" y="43" width="180" height="72" preserveAspectRatio="xMidYMid meet"/>` : "";
  const brandText = `<text x="${input.logoUrl ? 276 : 56}" y="90" fill="${ink}" font-family="Noto Sans, Arial, sans-serif" font-size="23" font-weight="400"${input.brand.length > 36 ? ' textLength="715" lengthAdjust="spacingAndGlyphs"' : ""}>${esc(input.brand.toUpperCase())}</text>`;
  const button = (x: number, y: number, width: number, fill: string, foreground: string) => `<rect x="${x}" y="${y}" width="${width}" height="70" rx="35" fill="${fill}"/><text x="${x + width / 2}" y="${y + 45}" fill="${foreground}" font-family="Noto Sans, Arial, sans-serif" font-size="27" font-weight="400" text-anchor="middle"${(input.cta || "Explore more").length * 16 > width - 36 ? ` textLength="${width - 36}" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(rows(input.cta || "Explore more", 30, 1)[0] || "Explore more")}</text>`;
  let artwork = "";
  // Split poster: a tall type column and an oversized, unchanged product photo.
  if (style === "weekly-banner") {
    const titleY = Math.max(330, h * .29);
    artwork = `<rect y="144" width="1080" height="${h - 144}" fill="${warm}"/><rect x="0" y="144" width="410" height="${h - 144}" fill="${vivid}"/><path d="M410 144h670v120L410 ${h - 190}Z" fill="${mixColor(brand, "#ffffff", .94)}"/>${photo(398, 166, 660, h - 280)}<path d="M55 ${titleY - 112}h90" stroke="${accentText}" stroke-width="8"/>${title({ x: 54, y: titleY, width: 324, pixels: 146, columns: 8, lines: 4, fill: accentText, uppercase: true })}${button(54, h - 120, 340, ink, "#ffffff")}`;
  }
  // Cinematic full-photo treatment: broad image, deep color and luminous rings.
  if (style === "weekly-orbit") {
    artwork = `<defs><linearGradient id="weekly-photo-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${ink}" stop-opacity="0"/><stop offset=".46" stop-color="${ink}" stop-opacity=".42"/><stop offset="1" stop-color="${ink}" stop-opacity="1"/></linearGradient></defs><rect y="144" width="1080" height="${h - 144}" fill="${brand}"/><circle cx="910" cy="${h * .35}" r="450" fill="${vivid}"/>${photo(0, 144, 1080, h - 144)}<circle cx="990" cy="${h * .37}" r="400" stroke="${vivid}" stroke-width="20" fill="none"/><circle cx="990" cy="${h * .37}" r="438" stroke="#ffffff" stroke-opacity=".65" stroke-width="3" fill="none"/><rect y="${h - 560}" width="1080" height="560" fill="url(#weekly-photo-shade)"/>${title({ x: 56, y: h - 340, width: 960, pixels: 160, columns: 16, lines: 2, fill: "#ffffff", uppercase: true })}<rect x="56" y="${h - 145}" width="110" height="8" fill="${vivid}"/>${button(56, h - 110, 420, vivid, accentText)}`;
  }
  // An intentionally quiet editorial alternative among the vivid posters.
  if (style === "weekly-editorial") {
    const twoLines = rows(input.headline, 23, 2).length > 1;
    const photoH = h - (twoLines ? 520 : 450);
    artwork = `<rect x="30" y="150" width="1020" height="${photoH + 24}" fill="${warm}"/>${photo(54, 162, 972, photoH)}<path d="M54 ${photoH + 184}h972" stroke="${ink}" stroke-width="2"/>${title({ x: 56, y: h - (twoLines ? 275 : 210), width: 968, pixels: 112, columns: 23, serif: true })}${button(56, h - 110, 420, ink, "#ffffff")}`;
  }
  // The photo and giant angled headline occupy separate, interlocking fields.
  if (style === "weekly-diagonal") {
    artwork = `<rect y="144" width="1080" height="${h - 144}" fill="${ink}"/><path d="M0 144H1080V${h - 430}L0 ${h - 290}Z" fill="${warm}"/><path d="M815 144h265v${h - 144}H815Z" fill="${vivid}"/>${photo(36, 162, 930, h - 560)}<path d="M0 ${h - 435}L1080 ${h - 385}V${h}H0Z" fill="${vivid}"/><path d="M0 ${h - 447}L1080 ${h - 397}" stroke="${ink}" stroke-width="12"/>${title({ x: 56, y: h - 275, width: 970, pixels: rows(input.headline, 18, 2).length > 1 ? 116 : 146, columns: 18, lines: 2, fill: accentText, uppercase: true })}${button(56, h - 105, 420, ink, "#ffffff")}`;
  }
  // Type leads at the top; the large photograph sits in a generous color mat.
  if (style === "weekly-frame") {
    const headlineRows = rows(input.headline, 22, 2).length;
    const imageY = headlineRows > 1 ? 420 : 330;
    artwork = `<rect y="144" width="1080" height="${h - 144}" fill="${vivid}"/><rect x="30" y="164" width="1020" height="${h - 194}" rx="36" fill="${paper}"/>${title({ x: 540, y: 275, width: 928, pixels: 122, columns: 22, centered: true, serif: true })}<path d="M435 ${imageY - 24}h210" stroke="${vivid}" stroke-width="7"/>${photo(60, imageY, 960, h - imageY - 140)}${button(330, h - 112, 420, ink, "#ffffff")}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${h}" viewBox="0 0 1080 ${h}">${fonts}<rect width="1080" height="${h}" fill="${paper}"/>${artwork}${logo}${brandText}</svg>`;
}
