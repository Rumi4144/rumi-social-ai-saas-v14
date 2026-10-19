import type { PhotoEvidence } from "./photo-matching";
import { fetchPublicBytes } from "@/lib/reels/public-fetch";
import { cleanPhotoUrl, extractProductPhotos, photoKey } from "@/lib/reels/product-photos";

function attr(tag: string, name: string) { return tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"))?.[2] || ""; }
function plain(value: string) { return value.replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim(); }
function words(value: string) { return new Set(plain(value).toLowerCase().match(/[a-z0-9]{3,}/g) || []); }
function score(value: string, topics: string[]) { const tokens = words(value); return topics.reduce((best, topic) => Math.max(best, [...words(topic)].filter(w => tokens.has(w)).length), 0); }
const excluded = /logo|icon|avatar|payment|badge|spinner|placeholder|tracking|pixel|newsletter|social[-_ ]|facebook|instagram/i;
export function websitePhotoLinks(html: string, website: string, topics: string[]) {
  const links = new Map<string, number>(), home = new URL(website);
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(match[1], website);
      if (url.origin !== home.origin || url.search || url.hash || url.pathname === home.pathname || /\.(?:pdf|jpe?g|png|webp|svg|zip|mp4)$|\/wp-|\/cart|\/checkout|\/privacy|\/terms|\/account|\/login|\/feed/i.test(url.pathname)) continue;
      const alt = [...match[2].matchAll(/<img\b[^>]*>/gi)].map(m => attr(m[0], "alt")).join(" ");
      const weight = score(`${plain(match[2])} ${alt} ${decodeURIComponent(url.pathname).replace(/[-_/]/g, " ")}`, topics);
      // Named topics take priority. Product pages provide variety for generic briefs.
      if (weight || /\/products?\//i.test(url.pathname)) links.set(url.href, Math.max(links.get(url.href) || 0, weight));
    } catch { /* Ignore malformed site links. */ }
  }
  return [...links].sort((a, b) => b[1] - a[1]).map(([url]) => url).slice(0, 6);
}
export function websitePhotoCandidates(html: string, page: string) {
  const clean = html.replace(/<(script|style|footer|header|nav)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  const candidates = extractProductPhotos(html, page);
  // On collection and service pages include content photos, excluding UI artwork.
  if (!/woocommerce-product-gallery/i.test(html) && !/\/products?\//i.test(new URL(page).pathname)) for (const match of clean.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0], src = attr(tag, "data-large_image") || attr(tag, "data-src") || attr(tag, "src");
    const width = Number(attr(tag, "width")), height = Number(attr(tag, "height"));
    if ((width && width < 240) || (height && height < 180) || excluded.test(`${src} ${attr(tag, "alt")} ${attr(tag, "class")}`)) continue;
    const url = cleanPhotoUrl(src, page); if (url && !/\.(?:svg|gif)(?:[?#]|$)/i.test(url)) candidates.push(url);
  }
  const unique = new Map<string, string>();
  const size = (url: string) => { const match = /-(\d+)x(\d+)(?=\.[a-z]+(?:[?#]|$))/i.exec(url); return match ? Number(match[1]) * Number(match[2]) : Number.MAX_SAFE_INTEGER; };
  for (const url of candidates.filter(url => !excluded.test(url))) {
    const key = photoKey(url), current = unique.get(key);
    if (!current || size(url) > size(current)) unique.set(key, url);
  }
  return [...unique.values()].slice(0, 20);
}
export async function discoverWebsitePhotos(website: string, topics: string[], evidence: PhotoEvidence[] = []) {
  const home = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`);
  const root = await fetchPublicBytes(home.href, 1_000_000);
  if (!/text\/html|application\/xhtml/i.test(root.contentType)) throw new Error("This website does not provide a readable page.");
  const html = root.bytes.toString("utf8"), links = websitePhotoLinks(html, home.href, topics);
  const pages = await Promise.allSettled(links.map(async url => {
    const result = await fetchPublicBytes(url, 1_000_000);
    const pageHtml = result.bytes.toString("utf8");
    const title = plain(pageHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || pageHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").slice(0, 400);
    return /text\/html|application\/xhtml/i.test(result.contentType) ? { images: websitePhotoCandidates(pageHtml, url), sourceUrl: url, title } : { images: [], sourceUrl: url, title };
  }));
  const groups = pages.flatMap(result => result.status === "fulfilled" && result.value.images.length ? [result.value] : []);
  groups.push({ images: websitePhotoCandidates(html, home.href), sourceUrl: home.href, title: plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "") });
  const images: string[] = [], seen = new Set<string>();
  // Round-robin collection avoids filling every slot from the first product.
  for (let index = 0; index < 20 && images.length < 20; index++) for (const group of groups) {
    const url = group.images[index]; if (!url || seen.has(photoKey(url)) || images.length >= 20) continue;
    seen.add(photoKey(url)); images.push(url); evidence.push({ imageUrl: url, sourceUrl: group.sourceUrl, title: group.title });
  }
  return images;
}
