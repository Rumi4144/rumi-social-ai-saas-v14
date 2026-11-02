import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/security/crypto";
export type TikTokConnection = { id: string; organizationId: string; externalId: string | null; encryptedToken: string | null };
type Grant = Record<string, any>;
export function tokenExpiry(seconds: unknown, fallbackSeconds = 7200, now = Date.now()) {
  const duration = Number(seconds);
  return now + (Number.isFinite(duration) && duration > 0 ? duration : fallbackSeconds) * 1000;
}
export function refreshExpiry(seconds: unknown, now = Date.now()) {
  const duration = Number(seconds);
  return Number.isFinite(duration) && duration > 0 ? now + duration * 1000 : null;
}
export async function renewTikTokToken(connection: TikTokConnection, provider: string, credentials: { clientKey: string; clientSecret: string }, validate: (connection: TikTokConnection) => Grant) {
  // Serialize refreshes across app instances. Rotation invalidates the old token,
  // so the row must be read again after acquiring the lock, before any API call.
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "SocialConnection" WHERE id = ${connection.id} AND "organizationId" = ${connection.organizationId} FOR UPDATE`;
    const current = await tx.socialConnection.findFirst({ where: { id: connection.id, organizationId: connection.organizationId, provider, status: "connected" } });
    if (!current || current.externalId !== connection.externalId) throw new Error("TikTok connection changed. Reconnect it in Settings.");
    const grant = validate(current);
    if (grant.accessToken && Number(grant.expiresAt) > Date.now() + 60000) return String(grant.accessToken);
    if (!grant.refreshToken || grant.refreshExpiresAt && Number(grant.refreshExpiresAt) <= Date.now()) throw new Error("TikTok connection expired. Reconnect it in Settings.");
    const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_key: credentials.clientKey, client_secret: credentials.clientSecret, grant_type: "refresh_token", refresh_token: grant.refreshToken }), cache: "no-store", signal: AbortSignal.timeout(12000) });
    const data = await response.json();
    if (!response.ok || !data.access_token || data.open_id !== current.externalId || !String(data.scope || grant.scope).split(/[ ,]+/).includes("video.publish")) throw new Error("TikTok could not renew this account. Reconnect it in Settings.");
    const updated = { ...grant, accessToken: data.access_token, refreshToken: data.refresh_token || grant.refreshToken, scope: data.scope || grant.scope, expiresAt: tokenExpiry(data.expires_in), refreshExpiresAt: refreshExpiry(data.refresh_expires_in) || grant.refreshExpiresAt || null };
    const saved = await tx.socialConnection.updateMany({ where: { id: current.id, organizationId: current.organizationId, provider, encryptedToken: current.encryptedToken, status: "connected" }, data: { encryptedToken: encryptSecret(JSON.stringify(updated)) } });
    if (saved.count !== 1) throw new Error("TikTok connection changed. Reopen the posting screen.");
    return String(data.access_token);
  }, { timeout: 20000, maxWait: 15000 });
}
