import { fetchPublicBytes } from "@/lib/reels/public-fetch";
import { cleanPhotoUrl } from "@/lib/reels/product-photos";
export type CatalogItem = { label: string; sourceUrl: string; images: string[]; family: string };
export function catalogText(value: unknown) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff))).replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}
/** Round-robin families rather than taking the first maker's whole product block. */
export function balancedCatalog(items: CatalogItem[]) {
  const groups = new Map<string, CatalogItem[]>();
  for (const item of items) { const key = item.family.toLowerCase(); const group = groups.get(key) || []; group.push(item); groups.set(key, group); }
  const result: CatalogItem[] = [];
  for (let index = 0; index < items.length; index++) for (const group of groups.values()) if (group[index]) result.push(group[index]);
  return result;
}
export async function websiteCatalog(website: string, html: string): Promise<CatalogItem[]> {
  // Detect catalog support; service sites continue through ordinary heading discovery.
  if (!/woocommerce|wp-content|wp-json/i.test(html)) return [];
  const home = new URL(website), seen = new Set<string>(), items: CatalogItem[] = [];
  try {
    const response = await fetchPublicBytes(new URL("/wp-json/wc/store/v1/products?per_page=100&stock_status=instock&orderby=title&order=asc", home).href, 4_000_000);
    if (!/application\/json/i.test(response.contentType)) return [];
    const products: unknown = JSON.parse(response.bytes.toString("utf8"));
    if (!Array.isArray(products)) return [];
    for (const product of products.slice(0, 100)) {
      if (!product || typeof product !== "object" || typeof product.name !== "string" || typeof product.permalink !== "string" || product.is_in_stock === false) continue;
      const label = catalogText(product.name), url = new URL(product.permalink, home);
      if (!label || label.length > 160 || url.origin !== home.origin || url.protocol !== "https:" || url.username || url.password || url.search || url.hash || seen.has(url.href)) continue;
      seen.add(url.href);
      const images: string[] = Array.isArray(product.images) ? product.images.flatMap((image: unknown) => {
        if (!image || typeof image !== "object" || !("src" in image) || typeof image.src !== "string") return [];
        const source = cleanPhotoUrl(image.src, home.href); return source && source.length <= 2048 ? [source] : [];
      }).slice(0, 3) : [];
      const maker = Array.isArray(product.brands) ? catalogText(product.brands[0]?.name) : "";
      items.push({ label, sourceUrl: url.href, images, family: maker || label.split(/\s+/)[0] });
    }
  } catch { return []; }
  return balancedCatalog(items);
}
