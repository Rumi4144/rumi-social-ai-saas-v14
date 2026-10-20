import type { SocialSvgInput } from './svg';

export const BRAND_TEMPLATES = [
  { value: 'modern-gradient', label: 'Modern Gradient', description: 'Luminous brand colors, a spacious headline and a hero photograph.' },
  { value: 'framed-editorial', label: 'Framed Editorial', description: 'A crisp magazine layout with a framed photo and a clear call to action.' },
  { value: 'geometric-focus', label: 'Geometric Focus', description: 'Layered geometric shapes around a central photograph.' },
] as const;
export type BrandTemplate = typeof BRAND_TEMPLATES[number]['value'];
export function isBrandTemplate(value: string): value is BrandTemplate { return BRAND_TEMPLATES.some(t => t.value === value); }
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
const hex = (s: string | undefined, fallback: string) => /^#[a-f0-9]{6}$/i.test(s || '') ? s! : fallback;
const rgb = (color: string) => color.slice(1).match(/../g)!.map(v => parseInt(v, 16));
function mix(a: string, b: string, weight: number) {
  const first = rgb(a), second = rgb(b);
  return '#' + first.map((v, i) => Math.round(v * (1 - weight) + second[i] * weight).toString(16).padStart(2, '0')).join('');
}
function luminance(color: string) {
  const channels = rgb(color).map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];
}
const inkOn = (color: string) => luminance(color) > .179 ? '#111827' : '#ffffff';
// Approximate Arial glyph advances, rather than character counts. Wide words and
// compact model names therefore receive different amounts of space.
function measure(value: string, size: number, bold = false) {
  let units = 0;
  for (const char of value) units += /[MW@%]/u.test(char) ? .91 : /[ilI.,'!:;|]/u.test(char) ? .27 : char === ' ' ? .28 : /[A-Z0-9]/u.test(char) ? .66 : /[^\x00-\xff]/u.test(char) ? 1 : .54;
  return units * size * (bold ? 1.035 : 1);
}
function wrap(value: string, size: number, width: number, bold = false) {
  const lines: string[] = []; let line = '';
  for (const token of value.trim().split(/\s+/u).filter(Boolean)) {
    // A URL or unusually long word must still stay within its allocated panel.
    const parts: string[] = []; let part = '';
    for (const character of token) {
      if (part && measure(part + character, size, bold) > width) { parts.push(part); part = ''; }
      part += character;
    }
    if (part) parts.push(part);
    for (const word of parts) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next, size, bold) > width) { lines.push(line); line = word; } else line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
function fit(value: string, width: number, maximum: number, preferred: number, minimum: number, bold = false) {
  let size = preferred, lines = wrap(value, size, width, bold);
  while (lines.length > maximum && size > minimum) { size -= 2; lines = wrap(value, size, width, bold); }
  if (lines.length > maximum) {
    lines = lines.slice(0, maximum);
    let last = lines[maximum - 1];
    while (last && measure(last + '…', size, bold) > width) last = last.slice(0, -1);
    lines[maximum - 1] = last.trimEnd() + '…';
  }
  return { lines, size, height: lines.length * size * 1.12 };
}

/** Brand layouts use only supplied photos and copy, with no generated claims or motion. */
export function renderBrandTemplate(input: SocialSvgInput, style: BrandTemplate) {
  const h = input.format === 'story' ? 1920 : input.format === 'square' ? 1080 : 1350;
  const square = h === 1080, story = h === 1920;
  const primary = hex(input.primaryColor, '#172846'), accent = hex(input.accentColor, '#bd408d');
  const secondary = hex(input.secondaryColor, '#f5f1eb');
  const base = luminance(primary) > .16 ? mix(primary, '#071022', .72) : primary;
  const dark = mix(base, '#071022', .52), paper = mix(secondary, '#ffffff', .90);
  const foreground = style === 'framed-editorial' ? dark : '#ffffff';
  const margin = 76, width = 928;
  // Story layouts reserve top/bottom breathing room for social app controls.
  const top = story ? 160 : 52, bottom = story ? 170 : 62;
  const bodyFont = esc(input.bodyFont || 'Arial');
  const headingFont = esc(input.headingFont || 'Arial');
  const text = (value: string, x: number, y: number, size: number, color: string, opts: { bold?: boolean; center?: boolean; opacity?: number; width?: number; heading?: boolean } = {}) => {
    const available = opts.width ?? width;
    const constrain = measure(value, size, opts.bold) > available * .96;
    return `<text x="${x}" y="${y}" fill="${color}" font-family="${opts.heading ? headingFont : bodyFont}, Arial, sans-serif" font-size="${size}" font-weight="${opts.bold ? 700 : 400}" text-anchor="${opts.center ? 'middle' : 'start'}"${opts.opacity ? ` opacity="${opts.opacity}"` : ''}${constrain ? ` textLength="${available * .96}" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(value)}</text>`;
  };
  const block = (value: ReturnType<typeof fit>, x: number, y: number, color: string, bold = false, center = false) => value.lines.map((line, i) => text(line, x, y + value.size + i * value.size * 1.12, value.size, color, { bold, center, heading: bold })).join('');
  const logo = input.logoUrl ? `<rect x="${margin}" y="${top}" width="82" height="82" rx="18" fill="#ffffff"/><image href="${esc(input.logoUrl)}" x="${margin + 8}" y="${top + 8}" width="66" height="66" preserveAspectRatio="xMidYMid meet"/>` : '';
  const brandX = input.logoUrl ? margin + 106 : margin;
  const brand = fit(input.brand.toUpperCase(), input.logoUrl ? 730 : width, 2, 26, 20, true);
  const header = `${logo}${block(brand, brandX, top + (brand.lines.length > 1 ? 8 : 23), foreground, true)}<path d="M${margin} ${top + 112}H1004" stroke="${foreground}" stroke-opacity=".16"/>`;
  const cta = fit(input.cta || 'Learn more', 726, 1, 31, 22, true);
  const buttonY = h - bottom - 84;
  const button = `<rect x="${margin}" y="${buttonY}" width="${width}" height="84" rx="${style === 'framed-editorial' ? 3 : 22}" fill="${accent}"/>${text(cta.lines[0], 122, buttonY + 52, cta.size, inkOn(accent), { bold: true, width: 726 })}<path d="M934 ${buttonY + 42}h24m-9-9 9 9-9 9" fill="none" stroke="${inkOn(accent)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  const photo = (x: number, y: number, w: number, height: number, radius = 20) => `<rect x="${x}" y="${y}" width="${w}" height="${height}" rx="${radius}" fill="${style === 'framed-editorial' ? mix(primary, '#ffffff', .94) : mix(base, '#ffffff', .09)}"/>${input.imageUrl ? `<image href="${esc(input.imageUrl)}" x="${x + 14}" y="${y + 14}" width="${w - 28}" height="${height - 28}" preserveAspectRatio="xMidYMid meet"/>` : ''}`;
  let artwork = '', copy = '';
  const defs = `<defs><linearGradient id="brand-gradient" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${base}"/><stop offset="1" stop-color="${dark}"/></linearGradient><radialGradient id="brand-glow"><stop stop-color="${accent}" stop-opacity=".58"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>`;
  if (style === 'geometric-focus') {
    const title = fit(input.headline, width, square ? 2 : 3, square ? 62 : 76, 42, true);
    const detail = fit(input.subheadline || '', width - 48, square ? 2 : 3, 29, 24);
    const titleY = buttonY - 34 - title.height - (detail.height ? detail.height + 20 : 0);
    const photoTop = top + 145, available = titleY - photoTop - 26;
    const diameter = Math.min(story ? 800 : 690, available);
    const cy = photoTop + available / 2, radius = diameter / 2;
    artwork = `<path d="M810 0h270v${h}H810Z" fill="${accent}" opacity=".10"/><path d="M0 ${cy}h1080M810 0v${h}" stroke="#ffffff" stroke-opacity=".11"/>${[[ -radius * .28, -radius * .10, accent ], [radius * .22, -radius * .16, '#77c6dc'], [radius * .24, radius * .18, secondary], [-radius * .20, radius * .24, accent]].map(([dx, dy, color]) => `<circle cx="${540 + Number(dx)}" cy="${cy + Number(dy)}" r="${radius * .94}" fill="${color}" opacity=".22"/>`).join('')}<circle cx="540" cy="${cy}" r="${radius}" fill="${mix(base, '#ffffff', .08)}" stroke="#ffffff" stroke-opacity=".32" stroke-width="2"/>`;
    // Inscribing the image inside the circle preserves the complete supplied photo.
    const inset = diameter * .71;
    if (input.imageUrl) artwork += `<image href="${esc(input.imageUrl)}" x="${540 - inset / 2}" y="${cy - inset / 2}" width="${inset}" height="${inset}" preserveAspectRatio="xMidYMid meet"/>`;
    artwork += `<path d="M${540 - radius - 45} ${cy - radius * .4}v-42h42M${540 + radius + 45} ${cy + radius * .4}v42h-42" fill="none" stroke="${accent}" stroke-width="4"/>`;
    copy = block(title, 540, titleY, foreground, true, true) + block(detail, 540, titleY + title.height + 20, foreground, false, true);
  } else {
    const editorial = style === 'framed-editorial';
    const title = fit(input.headline, width, square ? 2 : 3, square ? 66 : 80, 42, true);
    const detail = fit(input.subheadline || '', width, square ? 2 : 3, 30, 24);
    const titleY = top + 149;
    const photoY = titleY + title.height + (detail.height ? detail.height + 22 : 0) + (square ? 32 : 42);
    const photoHeight = buttonY - photoY - 30;
    copy = block(title, margin, titleY, foreground, true) + block(detail, margin, titleY + title.height + 22, foreground);
    if (editorial) {
      artwork = `<rect x="1006" y="${top}" width="8" height="82" fill="${accent}"/><path d="M58 ${photoY - 12}H1022V${photoY + photoHeight + 12}H58Z" fill="none" stroke="${primary}" stroke-opacity=".34"/>${photo(margin, photoY, width, photoHeight, 0)}<path d="M58 ${photoY + photoHeight + 12}h120" stroke="${accent}" stroke-width="4"/>`;
    } else {
      artwork = `<ellipse cx="900" cy="${photoY + photoHeight * .48}" rx="650" ry="${Math.max(330, photoHeight)}" fill="url(#brand-glow)"/><g fill="none" stroke="${accent}" stroke-opacity=".5"><path d="M940 0l-80 160 150 90 70-60M0 ${h - 420}l48 100-48 120"/><circle cx="860" cy="160" r="7"/><circle cx="1010" cy="250" r="7"/></g><rect x="${margin - 1}" y="${photoY - 1}" width="${width + 2}" height="${photoHeight + 2}" rx="25" fill="#ffffff" fill-opacity=".22"/>${photo(margin, photoY, width, photoHeight, 24)}`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="${h}" viewBox="0 0 1080 ${h}">${defs}<rect width="1080" height="${h}" fill="${style === 'framed-editorial' ? paper : 'url(#brand-gradient)'}"/>${artwork}${header}${copy}${button}</svg>`;
}
