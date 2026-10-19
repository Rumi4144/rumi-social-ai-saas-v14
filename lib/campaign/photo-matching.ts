import { createHmac, timingSafeEqual } from "node:crypto";
import { photoKey } from "@/lib/reels/product-photos";
export type PhotoEvidence = { imageUrl: string; sourceUrl: string; title: string };
function secret() { const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.TOKEN_ENCRYPTION_KEY; if (!value) throw new Error("Photo verification is temporarily unavailable."); return value; }
export function signPhotoEvidence(organizationId: string, website: string, photos: PhotoEvidence[]) {
  const data = Buffer.from(JSON.stringify({ organizationId, website, photos, expires: Date.now() + 86400000 })).toString("base64url");
  return `${data}.${createHmac("sha256", secret()).update(data).digest("base64url")}`;
}
export function verifyPhotoEvidence(receipt: string, organizationId: string, website: string): PhotoEvidence[] {
  try {
    if (receipt.length > 60000) throw Error();
    const [data, mac, extra] = receipt.split("."); if (!data || !mac || extra) throw Error();
    const actual = Buffer.from(mac, "base64url"), expected = createHmac("sha256", secret()).update(data).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw Error();
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (payload.organizationId !== organizationId || payload.website !== website || payload.expires < Date.now() || !Array.isArray(payload.photos) || payload.photos.length > 20) throw Error();
    return payload.photos;
  } catch { throw new Error("Website photo choices expired or changed. Find photos again before creating the campaign."); }
}
function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
export function modelCodes(value: string) { return [...new Set((value.match(/\b[a-z]{1,8}[- ]?\d{1,5}[a-z]{0,4}\b/gi) || []).map(code => code.toLowerCase().replace(/[^a-z0-9]/g, "")))]; }
export function matchingWebsitePhoto(post: { headline?: string | null; caption?: string | null; topics?: string[] }, photos: PhotoEvidence[], selectedUrls: string[]) {
  const selected = new Set(selectedUrls.map(photoKey)), expected = modelCodes(`${post.headline || ""} ${post.topics?.join(" ") || ""}`);
  // Multiple named models in one slot cannot be represented by an arbitrary photo.
  if (expected.length > 1) return null;
  const eligible = photos.filter(photo => selected.has(photoKey(photo.imageUrl)));
  if (expected.length) {
    return eligible.find(photo => {
      const sourceCodes = modelCodes(`${photo.title} ${photo.sourceUrl}`);
      const codes = sourceCodes.length ? sourceCodes : modelCodes(photo.imageUrl);
      return codes.length > 0 && codes.every(code => expected.includes(code)) && expected.every(code => codes.includes(code));
    }) || null;
  }
  const topics = post.topics?.length ? post.topics : [post.headline || ""];
  const ignored = new Set("the and for with your our from meet explore discover guitar guitars product service collection photo image classical electric nylon string cutaway".split(" "));
  return eligible.find(photo => {
    // A product-specific source cannot illustrate an unrelated generic topic.
    if (modelCodes(`${photo.title} ${photo.sourceUrl}`).length) return false;
    const source = new Set(normalize(photo.title + " " + photo.sourceUrl).split(" "));
    return topics.some(topic => {
      const terms = normalize(topic).split(" ").filter(word => word.length > 2 && !ignored.has(word));
      return terms.length > 0 && terms.every(word => source.has(word));
    });
  }) || null;
}
