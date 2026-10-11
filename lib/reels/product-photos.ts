type Product = { name: string; sourceUrl: string | null; imageUrl: string | null };
function decode(value: string) {
  return value.replace(/&amp;|&#0*38;/g, "&").replace(/&quot;|&#0*34;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff)));
}
export function cleanPhotoUrl(value: string, base: string) {
  try { const url = new URL(decode(value).replace(/\\\//g, "/"), base); if (url.protocol !== "https:" || url.username || url.password || url.port) return null; url.hash = ""; return url.toString(); } catch { return null; }
}
export function photoKey(value: string) {
  try { const url = new URL(value); for (const key of ["w", "h", "width", "height", "resize", "quality"]) url.searchParams.delete(key); url.searchParams.sort(); return `${url.origin}${url.pathname.replace(/-\d+x\d+(?=\.[a-z0-9]+$)/i, "").replace(/-scaled(?=\.[a-z0-9]+$)/i, "")}${url.search}`; } catch { return value; }
}
const pageKey = (value: string) => { try { const u = new URL(value); return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`; } catch { return ""; } };
const titleKey = (value: string) => decode(value).split("|")[0].toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export function pageBelongsToBrand(value: string, website: string, products: Product[]) {
  const url = cleanPhotoUrl(value, website); if (!url) return false;
  if (products.some(p => p.sourceUrl && pageKey(p.sourceUrl) === pageKey(url))) return true;
  try { return new URL(url).hostname.replace(/^www\./, "") === new URL(website).hostname.replace(/^www\./, "") && new URL(url).pathname !== "/"; } catch { return false; }
}
export function productPageForPost(post: { headline: string | null; caption: string | null }, website: string, products: Product[]) {
  const matches = products.filter(p => post.headline && titleKey(p.name) === titleKey(post.headline) && p.sourceUrl);
  if (matches.length === 1) return cleanPhotoUrl(matches[0].sourceUrl!, website);
  const urls = [...new Set((post.caption?.match(/https:\/\/[^\s<>"']+/g) || []).map(s => s.replace(/[).,;!?]+$/, "")).filter(s => pageBelongsToBrand(s, website, products)))];
  const productUrls = urls.filter(s => /\/products?\//i.test(new URL(s).pathname));
  const candidates = productUrls.length ? productUrls : urls;
  return candidates.length === 1 ? cleanPhotoUrl(candidates[0], website) : null;
}
function attr(tag: string, name: string) { return tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"))?.[2] || ""; }
function galleryHtml(html: string) {
  const start = /<div\b[^>]*class=["'][^"']*\bwoocommerce-product-gallery\b[^"']*["'][^>]*>/i.exec(html);
  if (!start) return "";
  const tail = html.slice(start.index); let depth = 0;
  for (const match of tail.matchAll(/<\/?div\b[^>]*>/gi)) { depth += /^<\//.test(match[0]) ? -1 : 1; if (depth === 0) return tail.slice(0, match.index! + match[0].length); }
  return ""; // Never scan beyond an incomplete gallery into related products.
}
export function extractProductPhotos(html: string, pageUrl: string): string[] {
  const gallery = galleryHtml(html), candidates: string[] = [];
  for (const match of gallery.matchAll(/<(?:img|a)\b[^>]*>/gi)) {
    const tag = match[0], value = attr(tag, "data-large_image") || attr(tag, "data-src") || (/^<a/i.test(tag) ? attr(tag, "href") : attr(tag, "src"));
    if (value && (/^<img/i.test(tag) || /\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(value))) candidates.push(value);
  }
  if (!candidates.length) {
    const products: Record<string, unknown>[] = [];
    const collect = (value: unknown) => {
      if (Array.isArray(value)) { value.forEach(collect); return; }
      if (!value || typeof value !== "object") return;
      const node = value as Record<string, unknown>, types = [node["@type"]].flat();
      if (types.includes("Product")) products.push(node);
      if (node["@graph"]) collect(node["@graph"]);
      if (node.mainEntity) collect(node.mainEntity);
    };
    for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) { try { collect(JSON.parse(match[1])); } catch {} }
    const matching = products.filter(p => typeof p.url === "string" && pageKey(p.url) === pageKey(pageUrl));
    const selected = matching.length === 1 ? matching[0] : products.length === 1 ? products[0] : undefined;
    if (selected) for (const image of [selected.image].flat()) {
      const value = typeof image === "string" ? image : image && typeof image === "object" ? (image as Record<string, unknown>).contentUrl || (image as Record<string, unknown>).url : null;
      if (typeof value === "string") candidates.push(value);
    }
  }
  if (!candidates.length) for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (attr(match[0], "property") === "og:image") candidates.push(attr(match[0], "content"));
  }
  const unique = new Map<string, string>();
  for (const candidate of candidates) {
    const url = cleanPhotoUrl(candidate, pageUrl); if (!url || /\.(?:svg|gif)(?:[?#]|$)/i.test(url)) continue;
    const key = photoKey(url), current = unique.get(key);
    const score = (src: string) => { const size = /-(\d+)x(\d+)(?=\.[a-z0-9]+(?:\?|$))/i.exec(src); return size ? Number(size[1]) * Number(size[2]) : Number.MAX_SAFE_INTEGER; };
    if (!current || score(url) > score(current)) unique.set(key, url);
  }
  return [...unique.values()].slice(0, 20);
}
