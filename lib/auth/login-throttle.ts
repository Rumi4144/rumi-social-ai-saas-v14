import { rateLimit } from "@/lib/security/rate-limit";

const windowMs = 15 * 60 * 1000;

async function fingerprint(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function allowCredentialAttempt(email: string, request?: Request) {
  try {
    // Trust only Vercel's own overwritten header while running on Vercel.
    // Never accept arbitrary forwarded headers on a standalone Node deployment.
    // https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for
    const ip = process.env.VERCEL === "1" ? request?.headers.get("x-vercel-forwarded-for")?.trim().toLowerCase() : undefined;
    if (ip && ip.length <= 64 && /^[a-f0-9:.]+$/.test(ip)) {
      const address = await rateLimit(`login:ip:${await fingerprint(ip)}`, 100, windowMs, { failClosed: true });
      if (!address.ok) return false;
    }
    // Unknown accounts use the same quota and response as real accounts. Keys contain no raw email/IP.
    const identity = await fingerprint(email.trim().toLowerCase());
    return (await rateLimit(`login:email:${identity}`, 10, windowMs, { failClosed: true })).ok;
  } catch {
    // An unavailable rate-limit store must not disable the protection.
    return false;
  }
}
