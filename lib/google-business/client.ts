import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";

export const GOOGLE_BUSINESS_PROVIDER = "google_business";
export const GOOGLE_BUSINESS_SCOPE = "https://www.googleapis.com/auth/business.manage";
export type GoogleGrant = { accessToken: string; refreshToken: string; expiresAt: number };
export type BusinessLocation = { name: string; title: string; address: string };
export const LOCATION_NAME = /^accounts\/[a-zA-Z0-9_-]+\/locations\/[a-zA-Z0-9_-]+$/;

export function googleBusinessConfigured() {
  return Boolean(process.env.GOOGLE_BUSINESS_CLIENT_ID && process.env.GOOGLE_BUSINESS_CLIENT_SECRET && process.env.NEXT_PUBLIC_APP_URL);
}
export function googleBusinessRedirectUri() {
  if (!process.env.NEXT_PUBLIC_APP_URL) throw new Error("Google Business Profile setup is incomplete.");
  return new URL("/api/social/google-business/callback", process.env.NEXT_PUBLIC_APP_URL).toString();
}
export async function googleJson(url: string, accessToken: string, init?: RequestInit) {
  const target = new URL(url);
  if (!["mybusiness.googleapis.com", "mybusinessaccountmanagement.googleapis.com", "mybusinessbusinessinformation.googleapis.com"].includes(target.hostname) || target.protocol !== "https:" || target.username || target.password) throw new Error("Invalid Google API address.");
  const response = await fetch(target, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${accessToken}` }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(12000) });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) throw new Error("Reconnect Google Business Profile in Settings.");
    if (response.status === 403) throw new Error("Google denied access. Check Business Profile API approval and your permission to manage this location.");
    if (response.status === 429) throw new Error("Google Business Profile quota is unavailable or temporarily exhausted. Check the app's Google API access and quota.");
    throw new Error("Google Business Profile could not complete this request.");
  }
  return data;
}
export async function exchangeGoogleCode(code: string): Promise<GoogleGrant> {
  if (!googleBusinessConfigured()) throw new Error("Google Business Profile setup is incomplete.");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(12000), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_BUSINESS_CLIENT_ID!, client_secret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET!, redirect_uri: googleBusinessRedirectUri(), grant_type: "authorization_code" }) });
  const data = await response.json();
  if (!response.ok || !data.access_token || !data.refresh_token || !String(data.scope || "").split(" ").includes(GOOGLE_BUSINESS_SCOPE)) throw new Error("Google did not grant the required access. Reconnect and allow Business Profile access.");
  return { accessToken: String(data.access_token), refreshToken: String(data.refresh_token), expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
}
export async function businessAccessToken(connection: { id: string; organizationId: string; encryptedToken: string | null }) {
  if (!connection.encryptedToken) throw new Error("Reconnect Google Business Profile in Settings.");
  const grant = JSON.parse(decryptSecret(connection.encryptedToken)) as GoogleGrant;
  if (grant.accessToken && grant.expiresAt > Date.now() + 60000) return grant.accessToken;
  if (!grant.refreshToken || !googleBusinessConfigured()) throw new Error("Reconnect Google Business Profile after completing its setup.");
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(12000), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.GOOGLE_BUSINESS_CLIENT_ID!, client_secret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET!, refresh_token: grant.refreshToken, grant_type: "refresh_token" }) });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    if (data.error === "invalid_grant") await prisma.socialConnection.updateMany({ where: { id: connection.id, organizationId: connection.organizationId, encryptedToken: connection.encryptedToken }, data: { status: "needs_reconnect" } });
    throw new Error("Google access could not be refreshed. Reconnect Google Business Profile in Settings.");
  }
  const updated = { ...grant, accessToken: String(data.access_token), refreshToken: data.refresh_token || grant.refreshToken, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  const saved = await prisma.socialConnection.updateMany({ where: { id: connection.id, organizationId: connection.organizationId, status: "connected", encryptedToken: connection.encryptedToken }, data: { encryptedToken: encryptSecret(JSON.stringify(updated)) } });
  if (!saved.count) throw new Error("The Google connection changed. Refresh and try again.");
  return updated.accessToken;
}
async function pages(url: string, key: string, accessToken: string) {
  const items: any[] = [];
  for (let page = 0; page < 20; page++) {
    const result = await googleJson(url, accessToken);
    items.push(...(Array.isArray(result[key]) ? result[key] : []));
    if (!result.nextPageToken) return items;
    const next = new URL(url); next.searchParams.set("pageToken", String(result.nextPageToken)); url = next.toString();
  }
  throw new Error("This Google account has too many locations to load at once. Connect an account with direct access to the business you need.");
}
export async function listBusinessLocations(accessToken: string): Promise<BusinessLocation[]> {
  const accounts = await pages("https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20", "accounts", accessToken);
  const locations: BusinessLocation[] = [];
  for (const account of accounts) {
    if (!/^accounts\/[a-zA-Z0-9_-]+$/.test(account.name)) continue;
    const url = new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations`);
    url.search = new URLSearchParams({ readMask: "name,title,storefrontAddress", pageSize: "100" }).toString();
    for (const location of await pages(url.toString(), "locations", accessToken)) {
      if (!/^locations\/[a-zA-Z0-9_-]+$/.test(location.name)) continue;
      const name = `${account.name}/${location.name}`;
      if (locations.some(l => l.name === name)) continue;
      const address = location.storefrontAddress || {};
      locations.push({ name, title: String(location.title || "Business location"), address: [...(address.addressLines || []), address.locality, address.administrativeArea, address.postalCode].filter(Boolean).join(", ") });
    }
  }
  return locations;
}
