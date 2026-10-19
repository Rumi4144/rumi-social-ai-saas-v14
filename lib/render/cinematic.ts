import type { SocialSvgInput } from "./svg";

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const palette = (value: string | undefined, fallback: string) => /^#[a-f0-9]{6}$/i.test(value || "") ? value! : fallback;
function wrap(value: string, columns: number, maximum: number) {
  const rows: string[] = []; let row = "";
  for (const word of value.trim().split(/\s+/)) {
    if ((row + " " + word).trim().length > columns && row) { rows.push(row); row = word; } else row = (row + " " + word).trim();
  }
  if (row) rows.push(row);
  return rows.slice(0, maximum).map((line, i) => line.length > columns || (i === maximum - 1 && rows.length > maximum) ? line.slice(0, columns - 1) + "…" : line);
}

/** Layer real source photos without generating new product angles or business claims. */
export function renderCinematic(input: SocialSvgInput) {
  const height = input.format === "square" ? 1080 : input.format === "story" ? 1920 : 1350;
  const primary = palette(input.primaryColor, "#16231f"), accent = palette(input.accentColor, "#dfbf7c"), paper = "#fff7e8";
  const photos = [...new Set([input.imageUrl, ...(input.imageUrls || [])].filter((url): url is string => Boolean(url)))].slice(0, 3);
  const panels = photos.length > 1 || (photos.length === 1 && input.detailCrops === true);
  const title = wrap(input.headline, 31, 3), titleSize = title.length > 2 ? 61 : 76;
  const heroY = Math.max(300, 157 + title.length * titleSize * 1.04 + (input.subheadline ? 85 : 32));
  const heroH = height - heroY - 210;
  // Keep the main photograph close to a portrait frame even on tall Story canvases.
  const mainPhotoH = panels ? Math.min(heroH, 850) : heroH;
  const mainPhotoY = heroY + (heroH - mainPhotoH) / 2;
  const text = (value: string, x: number, y: number, size: number, fill: string, width: number, serif = false) => `<text x="${x}" y="${y}" text-anchor="middle" fill="${fill}" font-family="${serif ? "Cormorant Garamond, Georgia, serif" : "Arial, sans-serif"}" font-size="${size}" font-weight="${serif ? 500 : 400}"${value.length * size * .62 > width ? ` textLength="${width}" lengthAdjust="spacingAndGlyphs"` : ""}>${escape(value)}</text>`;
  const photo = (url: string | undefined, x: number, y: number, width: number, h: number, id: string, crop = false, lower = false) => !url ? "" : `<svg x="${x}" y="${y}" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" overflow="hidden"><g mask="url(#${id})"><image href="${escape(url)}" x="${crop ? -width * .28 : 0}" y="${crop ? -h * (lower ? .72 : .06) : 0}" width="${crop ? width * 1.6 : width}" height="${crop ? h * 1.8 : h}" preserveAspectRatio="xMidYMid ${crop ? "slice" : "meet"}"/></g></svg>`;
  const ornament = (y: number) => `<path d="M350 ${y}h150m80 0h150M526 ${y}l14-9 14 9-14 9Z" fill="none" stroke="${accent}" stroke-width="1.3" opacity=".8"/>`;
  const sideX = 645, sideW = 365, sideH = Math.max(140, (heroH - 90) / 2);
  const sidePhoto = (index: number, y: number) => {
    const source = photos[index] || (input.detailCrops ? photos[0] : undefined);
    if (!source) return "";
    return `<g transform="rotate(${index === 1 ? 3 : -3} ${sideX + sideW / 2} ${y + sideH / 2})"><rect x="${sideX - 8}" y="${y - 8}" width="${sideW + 16}" height="${sideH + 16}" rx="${sideW / 2}" fill="${primary}" stroke="${accent}" stroke-opacity=".55"/>${photo(source, sideX, y, sideW, sideH, "soft-panel", !photos[index] && Boolean(input.detailCrops), index === 2)}</g>${text(photos[index] ? `0${index + 1} / ANOTHER VIEW` : index === 1 ? "DETAIL STUDY / 01" : "DETAIL STUDY / 02", sideX + sideW / 2, y + sideH + 35, 15, accent, 350)}`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${height}" viewBox="0 0 1080 ${height}">
  <defs>
    <radialGradient id="cinema-light" cx="38%" cy="45%" r="72%"><stop stop-color="${accent}" stop-opacity=".22"/><stop offset="1" stop-color="${primary}" stop-opacity="0"/></radialGradient>
    <linearGradient id="cinema-vignette" x2="0" y2="1"><stop stop-color="#000000" stop-opacity=".4"/><stop offset=".45" stop-color="#000000" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".8"/></linearGradient>
    <radialGradient id="photo-feather"><stop offset=".78" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></radialGradient>
    <mask id="hero-photo" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#photo-feather)"/></mask>
    <mask id="soft-panel" maskContentUnits="objectBoundingBox"><rect width="1" height="1" rx=".48" fill="white"/></mask>
    <pattern id="cinema-grain" width="17" height="23" patternUnits="userSpaceOnUse"><circle cx="2" cy="4" r=".6" fill="${paper}" opacity=".14"/><circle cx="12" cy="15" r=".5" fill="${accent}" opacity=".18"/></pattern>
  </defs>
  <rect width="1080" height="${height}" fill="${primary}"/><rect width="1080" height="${height}" fill="url(#cinema-light)"/><rect width="1080" height="${height}" fill="url(#cinema-vignette)"/><rect width="1080" height="${height}" fill="url(#cinema-grain)"/>
  <rect x="23" y="23" width="1034" height="${height - 46}" fill="none" stroke="${accent}" stroke-opacity=".4"/>
  <path d="M45 110V45h90m810 0h90v65M45 ${height - 110}v65h90m810 0h90v-65" fill="none" stroke="${accent}" stroke-width="2"/>
  ${text(input.brand.toUpperCase(), 540, 83, 24, accent, 910)}${ornament(112)}
  ${title.map((line, i) => text(line, 540, 163 + i * titleSize * 1.04, titleSize, paper, 930, true)).join("")}
  ${input.subheadline ? wrap(input.subheadline, 64, 2).map((line, i) => text(line, 540, 177 + title.length * titleSize * 1.04 + i * 29, 23, accent, 900)).join("") : ""}
  <ellipse cx="${panels ? 360 : 540}" cy="${heroY + heroH * .6}" rx="${panels ? 300 : 440}" ry="${heroH * .53}" fill="none" stroke="${accent}" stroke-opacity=".18"/>
  ${photo(photos[0], panels ? 40 : 65, mainPhotoY, panels ? 640 : 950, mainPhotoH, "hero-photo")}
  ${panels ? sidePhoto(1, heroY + 5) + sidePhoto(2, heroY + sideH + 78) : ""}
  ${ornament(height - 163)}
  ${text(input.cta || "Discover more", 540, height - 107, 37, paper, 860, true)}
  ${text(input.brand.toUpperCase(), 540, height - 59, 18, accent, 890)}
  </svg>`;
}
