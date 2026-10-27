import type { SocialSvgInput } from "./svg";
import { renderCinematic } from "./cinematic";
import {BRAND_TEMPLATES,isBrandTemplate,renderBrandTemplate} from './brand-templates';
import {lightBrandPalette} from './light-palette';
export const SHOWCASE_STYLES = [
  ...BRAND_TEMPLATES,
  { value: "cinematic", label: "Cinematic Showcase", description: "Layered photographs, luminous surroundings, elegant type and fine details." },
  { value: "heritage", label: "Heritage Showcase", description: "A light gallery setting, fine borders, a hero photo and detail studies." },
  { value: "gallery-story", label: "Gallery Story", description: "An editorial arrangement of a whole product and supporting views." },
  { value: "bold-spotlight", label: "Bold Spotlight", description: "Oversized headlines, confident color and a framed product photo." },
] as const;
export type ShowcaseStyle = typeof SHOWCASE_STYLES[number]["value"];
export function isShowcaseStyle(value?: string): value is ShowcaseStyle { return SHOWCASE_STYLES.some(style => style.value === value); }
export function automaticShowcaseStyle(seed:string,preferred?:string|null):ShowcaseStyle|'classic'{
  if(preferred==='classic'||isShowcaseStyle(preferred||undefined))return preferred as ShowcaseStyle|'classic';
  const automatic:ShowcaseStyle[]=['modern-gradient','framed-editorial','geometric-focus','gallery-story'];
  const index=[...seed].reduce((n,c)=>n+c.charCodeAt(0),0)%automatic.length;
  return automatic[index];
}
function esc(s: string) { return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!); }
function lines(value: string, limit: number, count: number) {
  const result: string[] = []; let line = "";
  for (const word of value.trim().split(/\s+/)) {
    if ((line + " " + word).trim().length > limit && line) { result.push(line); line = word; } else line = (line + " " + word).trim();
  }
  if (line) result.push(line);
  return result.slice(0, count).map((s, i) => s.length > limit ? s.slice(0, limit - 1) + "…" : i === count - 1 && result.length > count ? s.slice(0, limit - 1) + "…" : s);
}
export function renderShowcase(input: SocialSvgInput, style: ShowcaseStyle) {
  if(isBrandTemplate(style))return renderBrandTemplate(input,style);
  if (style === "cinematic") return renderCinematic(input);
  const h = input.format === "story" ? 1920 : input.format === "square" ? 1080 : 1350;
  const {ink: primary, accentInk: accent, paper, tint} = lightBrandPalette(input.primaryColor, input.accentColor, input.secondaryColor);
  const urls = [...new Set([input.imageUrl, ...(input.imageUrls || [])].filter((s): s is string => Boolean(s)))].slice(0, 3);
  const image = (url: string | undefined, x: number, y: number, w: number, height: number, detail: boolean | "lower" = false) => url ? `<svg x="${x}" y="${y}" width="${w}" height="${height}" viewBox="0 0 ${w} ${height}" overflow="hidden"><image href="${esc(url)}" x="${detail ? -w * .4 : 0}" y="${detail ? detail === "lower" ? -height * .8 : -height * .05 : 0}" width="${detail ? w * 1.8 : w}" height="${detail ? height * 1.8 : height}" preserveAspectRatio="xMidYMid ${detail ? "slice" : "meet"}" /></svg>` : `<rect x="${x}" y="${y}" width="${w}" height="${height}" fill="${accent}" opacity=".12"/>`;
  const text = (value: string, x: number, y: number, size: number, fill: string, limit: number, count: number, center = false, serif = false) => `<text fill="${fill}" font-family="${serif ? "Georgia, serif" : "Arial, sans-serif"}" font-size="${size}" font-weight="${serif ? 500 : 700}" text-anchor="${center ? "middle" : "start"}">${lines(value, limit, count).map((s, i) => `<tspan x="${x}" y="${y + i * size * 1.13}"${s.length * size * .9 > (center ? 960 : style === "bold-spotlight" ? 420 : 960) ? ` textLength="${center ? 960 : style === "bold-spotlight" ? 420 : 960}" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(s)}</tspan>`).join("")}</text>`;
  const brand = (y: number, fill: string) => text(input.brand.toUpperCase(), 540, y, 23, fill, 50, 1, true);
  const footer = (fill: string) => `<line x1="60" y1="${h - 142}" x2="1020" y2="${h - 142}" stroke="${accent}" opacity=".65"/>${text(input.cta || "Explore more", 540, h - 85, 29, fill, 42, 1, true)}${brand(h - 38, fill)}`;
  const panels = urls.length > 1 || input.detailCrops === true;
  let body = "";
  if (style === "heritage") {
    const y = 340, photoHeight = h - 540, half = (photoHeight - 22) / 2;
    body = `<rect width="1080" height="${h}" fill="${paper}"/><rect width="1080" height="${h}" fill="url(#glow)"/><rect x="25" y="25" width="1030" height="${h - 50}" rx="6" fill="none" stroke="${accent}" opacity=".5"/>
      ${brand(82, accent)}<path d="M430 106h92l18 10 18-10h92" stroke="${accent}" fill="none"/>
      ${text(input.headline, 540, 177, 68, primary, 25, 2, true, true)}${text(input.subheadline || "", 540, 292, 24, accent, 66, 1, true)}
      ${!panels ? image(urls[0], 70, y + 12, 940, photoHeight - 24) : `<rect x="58" y="${y}" width="620" height="${photoHeight}" fill="#ffffff" opacity=".06"/>${image(urls[0], 70, y + 12, 596, photoHeight - 24)}
      <rect x="702" y="${y}" width="320" height="${photoHeight}" fill="${paper}" opacity=".08"/>
      ${image(urls[1] || urls[0], 714, y + 12, 296, half - 12, Boolean(input.detailCrops) && !urls[1])}${image(urls[2] || urls[0], 714, y + half + 22, 296, half - 12, urls[2] || !input.detailCrops ? false : "lower")}
      ${text(urls.length > 1 ? "MORE VIEWS" : "DETAIL STUDIES", 860, h - 168, 16, accent, 24, 1, true)}`}${footer(primary)}`;
  } else if (style === "gallery-story") {
    const y = 330, photoHeight = h - 540;
    body = `<rect width="1080" height="${h}" fill="${paper}"/>${brand(78, primary)}<line x1="60" y1="108" x2="1020" y2="108" stroke="${primary}" opacity=".35"/>
      ${text(input.headline, 60, 182, 66, primary, 26, 2, false, true)}${text(input.subheadline || "", 60, 296, 24, primary, 68, 1)}
      ${!panels ? image(urls[0], 60, y, 960, photoHeight) : `<rect x="60" y="${y}" width="600" height="${photoHeight}" fill="${primary}" opacity=".07"/>${image(urls[0], 72, y + 12, 576, photoHeight - 24)}
      ${image(urls[1] || urls[0], 684, y, 336, photoHeight * .54 - 12, Boolean(input.detailCrops) && !urls[1])}${image(urls[2] || urls[0], 684, y + photoHeight * .54 + 12, 336, photoHeight * .46 - 12, urls[2] || !input.detailCrops ? false : "lower")}` }
      <rect x="60" y="${h - 178}" width="90" height="5" fill="${accent}"/>${footer(primary)}`;
  } else {
    const panelY = 120, panelH = h - 340;
    body = `<rect width="1080" height="${h}" fill="${tint}"/><rect x="540" width="540" height="${h - 190}" fill="${paper}"/>
      ${text(input.brand.toUpperCase(), 60, 76, 22, accent, 30, 1)}${text(input.headline, 60, 200, 66, primary, 12, 4)}
      <rect x="60" y="530" width="90" height="6" fill="${accent}"/>${text(input.subheadline || "", 60, 590, 26, primary, 28, 3)}
      ${image(urls[0], 558, panelY, 504, panelH)}${h > 1200 && panels ? image(urls[1] || urls[0], 60, 740, 418, Math.min(360, h - 1000), Boolean(input.detailCrops) && !urls[1]) : ""}${footer(primary)}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${h}" viewBox="0 0 1080 ${h}"><defs><radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".06"/><stop offset="1" stop-color="${primary}" stop-opacity="0"/></radialGradient></defs>${body}</svg>`;
}
