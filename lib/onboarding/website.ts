import sharp from "sharp";
import { fetchPublicBytes } from "@/lib/reels/public-fetch";
import { websiteBrandProfile, normalizedWebsite } from "@/lib/website/brand-profile";
import { catalogText, websiteCatalog, type CatalogItem } from "@/lib/campaign/website-catalog";
import { cleanPhotoUrl, extractProductPhotos, photoKey } from "@/lib/reels/product-photos";
import { reelPhotoMatchesProduct } from "@/lib/reels/product-identity";

export type WebsiteSetup = {
  website: string; brandName: string; logoUrl: string | null; logoSource: string | null;
  suggestions: Record<string, string>; products: CatalogItem[]; sources: string[]; warnings: string[];
};
const attr = (tag: string, name: string) => tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"))?.[2] || "";

/** Only use logo-labelled HTML or Organization structured data, never an invented brand mark. */
export function websiteIdentity(html: string, website: string) {
  const logos: string[] = [], products: CatalogItem[] = [];
  const origin = new URL(website).origin;
  const image = (value: unknown): string | null => {
    const source = typeof value === "string" ? value : value && typeof value === "object" ? (value as Record<string, unknown>).url || (value as Record<string, unknown>).contentUrl : null;
    return typeof source === "string" ? cleanPhotoUrl(source, website) : null;
  };
  const collect = (value: unknown, depth = 0) => {
    if (depth > 8) return;
    if (Array.isArray(value)) { value.slice(0, 100).forEach(row => collect(row, depth + 1)); return; }
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>, types = [node["@type"]].flat();
    if (types.some(type => ["Organization", "LocalBusiness", "Store", "Brand"].includes(String(type)))) { const logo = image(node.logo); if (logo) logos.push(logo); }
    if (types.includes("Product") && typeof node.name === "string" && typeof node.url === "string") {
      const sourceUrl = cleanPhotoUrl(node.url, website), label = catalogText(node.name).slice(0, 160);
      if (sourceUrl && label && new URL(sourceUrl).origin === origin) products.push({ label, sourceUrl, images: [node.image].flat().map(image).filter((url): url is string => Boolean(url)).slice(0, 3), family: label.split(" ")[0] });
    }
    if (node["@graph"]) collect(node["@graph"], depth + 1);
    if (node.mainEntity) collect(node.mainEntity, depth + 1);
    if (node.itemListElement) collect(node.itemListElement, depth + 1);
    if (node.item) collect(node.item, depth + 1);
  };
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) { try { collect(JSON.parse(script[1])); } catch { /* Ignore malformed source data. */ } }
  const clean = html.replace(/<(script|style|noscript|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
  for (const match of clean.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/logo|brand[-_ ]?mark/i.test([attr(tag, "alt"), attr(tag, "class"), attr(tag, "id"), attr(tag, "src")].join(" "))) continue;
    const value = attr(tag, "data-src") || attr(tag, "src");
    const source = value ? cleanPhotoUrl(value, website) : null; if (source) logos.push(source);
  }
  return { logos: [...new Set(logos)].slice(0, 3), products: products.slice(0, 20) };
}

async function originalLogo(url: string) {
  const result = await fetchPublicBytes(url, 2_000_000);
  if (!/^image\/(png|jpe?g|webp|svg\+xml)(?:;|$)/i.test(result.contentType)) throw new Error("Unsupported logo image");
  // Path-based SVG logos are supported; embedded resources and executable XML are not.
  if (/svg/i.test(result.contentType) && /<!doctype|<!entity|<script|<foreignObject|<image|(?:href|url)\s*[=(]/i.test(result.bytes.toString("utf8"))) throw new Error("Unsupported embedded logo resource");
  const png = await sharp(result.bytes, { limitInputPixels: 16_000_000 }).rotate().resize(640, 320, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

export async function readWebsiteSetup(value: string, brandName: string): Promise<WebsiteSetup> {
  const website = normalizedWebsite(value), page = await fetchPublicBytes(website, 1_000_000);
  if (!/text\/html|application\/xhtml/i.test(page.contentType)) throw new Error("Use a public page on your business website.");
  const html = page.bytes.toString("utf8"), identity = websiteIdentity(html, website), warnings: string[] = [];
  const catalog = await websiteCatalog(website, html);
  const products = [...new Map([...catalog, ...identity.products].filter(row => row.images.length).map(row => [row.sourceUrl, row])).values()].slice(0, 20);
  await Promise.allSettled(products.filter(row => row.images.length < 3).slice(0, 3).map(async product => {
    const detail = await fetchPublicBytes(product.sourceUrl, 1_000_000);
    if (!/text\/html|application\/xhtml/i.test(detail.contentType)) return;
    const productHtml = detail.bytes.toString("utf8");
    const title = catalogText(productHtml.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
    const gallery = extractProductPhotos(productHtml, product.sourceUrl);
    if (!gallery.length || !reelPhotoMatchesProduct(product.label, { metadata: { sourceEvidence: { sourceUrl: product.sourceUrl, title, imageUrl: gallery[0] } } })) return;
    const unique = new Map([...product.images, ...gallery].map(url => [photoKey(url), url]));
    product.images = [...unique.values()].slice(0, 3);
  }));
  let logoUrl: string | null = null, logoSource: string | null = null;
  for (const candidate of identity.logos) { try { logoUrl = await originalLogo(candidate); logoSource = candidate; break; } catch { /* Try the next actual website logo. */ } }
  if (!logoUrl) warnings.push("We could not read an actual logo. Admin can add it later; we will use your business name meanwhile.");
  let suggestions: Record<string, string> = {}, sources = [website];
  if (process.env.OPENAI_API_KEY) {
    try { const profile = await websiteBrandProfile(website, brandName); suggestions = profile.suggestions; sources = profile.sources; }
    catch { warnings.push("We could not summarize the website. Add a short business description below."); }
  } else warnings.push("Add a short description of your business below.");
  if (!products.length) warnings.push("No structured product catalog was found. Your website can still supply service information and photos when your week is prepared.");
  return { website, brandName, logoUrl, logoSource, suggestions, products, sources, warnings };
}
