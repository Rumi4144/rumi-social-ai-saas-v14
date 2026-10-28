import { cleanPhotoUrl, photoKey } from "./product-photos";
import { reelPhotoMatchesProduct } from "./product-identity";

function pageIdentity(value: string) {
  try { const url = new URL(value); return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}${url.search}`; }
  catch { return ""; }
}
/** Fallback only to actual website photos with the same page and product
 * provenance. Generated images and other products are never substitutes. */
export function cachedProductGallery(page: string, subject: string | undefined,
  products: { name: string; sourceUrl: string | null; imageUrl: string | null }[],
  assets: { kind: string; url: string | null; metadata?: unknown }[]) {
  const candidates: { name: string; image: string }[] = [];
  const samePage = (value: string) => !!pageIdentity(page) && pageIdentity(value) === pageIdentity(page);
  // Validate the saved name independently: a correct URL must not hide a
  // conflicting maker/model in old catalog data.
  const matchingName = (name: string) => reelPhotoMatchesProduct(subject, { metadata: { sourceEvidence: { title: name, sourceUrl: "", imageUrl: "cached-product-name" } } });
  for (const asset of assets) {
    if (asset.kind !== "product_photo" || !asset.url || !reelPhotoMatchesProduct(subject, asset)) continue;
    const m = asset.metadata as { sourceUrl?: string; productName?: string; sourceEvidence?: { sourceUrl?: string; title?: string; imageUrl?: string } } | null;
    const source = m?.sourceEvidence?.sourceUrl || m?.sourceUrl || "";
    const name = m?.sourceEvidence?.title || m?.productName || "";
    if (samePage(source) && name && matchingName(name) && (!m?.sourceEvidence?.imageUrl || photoKey(m.sourceEvidence.imageUrl) === photoKey(asset.url))) candidates.push({ name, image: asset.url });
  }
  for (const product of products) {
    if (!product.sourceUrl || !product.imageUrl || !samePage(product.sourceUrl)) continue;
    const metadata = { sourceEvidence: { title: product.name, sourceUrl: product.sourceUrl, imageUrl: product.imageUrl } };
    if (product.name.trim() && matchingName(product.name) && reelPhotoMatchesProduct(subject, { metadata })) candidates.push({ name: product.name, image: product.imageUrl });
  }
  const unique = new Map<string, string>();
  for (const candidate of candidates) { const image = cleanPhotoUrl(candidate.image, page); if (image) unique.set(photoKey(image), image); }
  return candidates.length && unique.size ? { productName: candidates[0].name, images: [...unique.values()].slice(0, 20) } : null;
}

export function transientProductReadError(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? error.code : "";
  return ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH"].includes(String(code)) ||
    error instanceof Error && /timed out|took too long|socket hang up/i.test(error.message);
}
