import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";

export function publicAddress(address: string) {
  if (isIP(address) === 6) return /^2[0-9a-f]{3}:/i.test(address) && !/^2001:(?:0:|db8:)/i.test(address);
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
}
// Resolve once and pin the request to that public address, including redirect hops.
export async function fetchPublicBytes(value: string, maxBytes: number, redirects = 0): Promise<{ bytes: Buffer; contentType: string }> {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Choose a public HTTPS product page.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([lookup(url.hostname, { all: true }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Website lookup timed out.")), 5000); })]).finally(() => clearTimeout(timer));
  if (!addresses.length || addresses.some(a => !publicAddress(a.address))) throw new Error("Choose a public HTTPS product page.");
  return new Promise((resolve, reject) => {
    const req = request(url, { headers: { Accept: "text/html,image/*;q=0.9", "User-Agent": "RumiSocialAI-ReelPhotos/1.0" }, lookup: (_host, options, callback) => options.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family) }, res => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); const next = new URL(res.headers.location, url);
        if (redirects >= 2 || next.origin !== url.origin) { reject(new Error("Use the final product-page address.")); return; }
        fetchPublicBytes(next.toString(), maxBytes, redirects + 1).then(resolve, reject); return;
      }
      if (res.statusCode !== 200 || Number(res.headers["content-length"]) > maxBytes) { res.destroy(); reject(new Error("The website image or page is unavailable.")); return; }
      const parts: Buffer[] = []; let size = 0;
      res.on("data", (part: Buffer) => { size += part.length; if (size > maxBytes) { req.destroy(new Error("The website image or page is too large.")); return; } parts.push(part); });
      res.on("error", reject); res.on("end", () => resolve({ bytes: Buffer.concat(parts), contentType: String(res.headers["content-type"] || "") }));
    });
    const deadline = setTimeout(() => req.destroy(new Error("The website took too long to respond.")), 15000);
    req.on("close", () => clearTimeout(deadline)); req.on("error", reject); req.end();
  });
}
