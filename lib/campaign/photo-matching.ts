import { createHmac, timingSafeEqual } from "node:crypto";
export { matchingWebsitePhoto, modelCodes } from "./photo-subject";
export type PhotoEvidence = { imageUrl: string; sourceUrl: string; title: string };
function secret() { const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.TOKEN_ENCRYPTION_KEY; if (!value) throw new Error("Photo verification is temporarily unavailable."); return value; }
export function signPhotoEvidence(organizationId: string, website: string, photos: PhotoEvidence[]) {
  const data = Buffer.from(JSON.stringify({ organizationId, website, photos, expires: Date.now() + 86400000 })).toString("base64url");
  return `${data}.${createHmac("sha256", secret()).update(data).digest("base64url")}`;
}
export function verifyPhotoEvidence(receipt: string, organizationId: string, website: string): PhotoEvidence[] {
  try {
    if (receipt.length > 160000) throw Error();
    const [data, mac, extra] = receipt.split("."); if (!data || !mac || extra) throw Error();
    const actual = Buffer.from(mac, "base64url"), expected = createHmac("sha256", secret()).update(data).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw Error();
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    if (payload.organizationId !== organizationId || payload.website !== website || payload.expires < Date.now() || !Array.isArray(payload.photos) || payload.photos.length > 60) throw Error();
    return payload.photos;
  } catch { throw new Error("Website photo choices expired or changed. Find photos again before creating the campaign."); }
}
