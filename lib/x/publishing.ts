import { randomUUID } from "node:crypto";
import { parseTweet } from "twitter-text";
import type { SocialConnection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { xAccount, xBasic, xCanPublish, xCredentials, xId, type XGrant } from "./connection";
import { xHash, xMediaBytes, xMediaReference, type XMedia } from "./media";

export type XPost = { contentItemId: string; connectionId: string; accountId: string; text: string; mediaUrl: string | null; media: XMedia | null; fingerprint: string };
// PostgreSQL JSON objects do not preserve insertion order.
export function xPostFingerprint(post: Omit<XPost, "fingerprint">) { return xHash(JSON.stringify([post.contentItemId, post.connectionId, post.accountId, post.text, post.mediaUrl, post.media ? [post.media.assetId, post.media.kind, post.media.hash] : null])); }
export const X_RECONNECT = "Open Settings → X and select Enable X posting, then authorize this account again.";
export class XPublishError extends Error { constructor(message: string, public code?: number) { super(message); } }
export class XBusy extends Error {}

export function xCaption(text: string, hasMedia: boolean) {
  const result = parseTweet(text);
  if (!text && hasMedia) return text;
  if (!result.valid) throw new XPublishError(result.weightedLength > 280 ? `X allows 280 characters. This caption counts as ${result.weightedLength}. Shorten it and approve the post again.` : "Add valid text or a photo/video before posting to X.");
  return text;
}
export function xGrant(connection: Pick<SocialConnection, "encryptedToken" | "status">): XGrant {
  try {
    const grant = JSON.parse(decryptSecret(connection.encryptedToken || "")) as XGrant;
    if (connection.status !== "connected" || !grant.accessToken || !grant.clientId || !Number.isFinite(grant.expiresAt) || !xCanPublish(grant.scope)) throw new Error();
    return grant;
  } catch { throw new XPublishError(X_RECONNECT); }
}
export async function prepareXPost(org: string, item: { id: string; caption: string | null; headline: string | null; mediaUrl: string | null }, connection: SocialConnection): Promise<XPost> {
  if (connection.organizationId !== org || connection.provider !== "x" || !/^\d+$/.test(connection.externalId || "")) throw new XPublishError(X_RECONNECT);
  xGrant(connection);
  const text = xCaption(item.caption || item.headline || "", Boolean(item.mediaUrl));
  try {
    const ref = xMediaReference(item.mediaUrl);
    const media = ref ? { ...ref, hash: xHash((await xMediaBytes(org, item.id, ref)).bytes) } : null;
    const post = { contentItemId: item.id, connectionId: connection.id, accountId: connection.externalId!, text, mediaUrl: item.mediaUrl, media };
    return { ...post, fingerprint: xPostFingerprint(post) };
  } catch { throw new XPublishError("The selected photo or reel could not be prepared for X. Save a finished MP4 reel (under 100 MB) or a Rumi photo, then approve it again."); }
}

export function xHttpError(status: number) {
  return new XPublishError(status === 401 ? X_RECONNECT : status === 402 ? "X requires more API credits. Check the balance in your X Developer Console, then try this post again." : status === 403 ? "X refused this post. Check your X app’s posting permissions, account restrictions and media requirements before trying again." : status === 429 ? "X is limiting requests. Wait a few minutes before trying again." : status === 400 ? "X rejected the text or media. Review the caption and export the photo or reel again." : "X could not complete this request. Check publishing history before trying again.", status);
}
export async function xRequest(path: string, token: string, body?: unknown) {
  const response = await fetch(`https://api.x.com${path}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw xHttpError(response.status);
  if (response.status === 204) return {};
  return response.json();
}

export async function xAccessToken(connection: SocialConnection): Promise<string> {
  const grant = xGrant(connection);
  if (grant.expiresAt > Date.now() + 60000) return grant.accessToken;
  const credentials = await xCredentials(connection.organizationId);
  if (!grant.refreshToken || !credentials || grant.clientId !== credentials.clientId) throw new XPublishError(X_RECONNECT);
  // Refresh tokens rotate. Only one worker may use this exact stored grant.
  const id = xId("refresh", `${connection.id}:${xHash(connection.encryptedToken!)}`);
  try { await prisma.job.create({ data: { id, organizationId: connection.organizationId, type: "X_REFRESH", status: "refreshing", payload: {} } }); }
  catch (error) {
    if ((error as { code?: string }).code !== "P2002") throw error;
    const prior = await prisma.job.findFirst({ where: { id, organizationId: connection.organizationId } });
    if (prior?.status === "refreshing" && Date.now() - prior.createdAt.getTime() < 120000) throw new XBusy();
    throw new XPublishError(X_RECONNECT);
  }
  try {
    const response = await fetch("https://api.x.com/2/oauth2/token", { method: "POST", headers: { Authorization: xBasic(credentials), "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: grant.refreshToken }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new XPublishError(X_RECONNECT);
    const value = await response.json();
    if (typeof value.access_token !== "string" || !value.access_token || typeof value.refresh_token !== "string" || !value.refresh_token || !Number.isFinite(value.expires_in) || value.expires_in <= 0 || String(value.token_type).toLowerCase() !== "bearer" || !xCanPublish(value.scope || "")) throw new XPublishError(X_RECONNECT);
    const next: XGrant = { ...grant, accessToken: value.access_token, refreshToken: value.refresh_token, expiresAt: Date.now() + value.expires_in * 1000, scope: value.scope };
    const saved = await prisma.socialConnection.updateMany({ where: { id: connection.id, organizationId: connection.organizationId, status: "connected", encryptedToken: connection.encryptedToken }, data: { encryptedToken: encryptSecret(JSON.stringify(next)) } });
    if (!saved.count) throw new XPublishError(X_RECONNECT);
    await prisma.job.deleteMany({ where: { id, organizationId: connection.organizationId } });
    return next.accessToken;
  } catch {
    await prisma.job.updateMany({ where: { id }, data: { status: "uncertain" } });
    // Preserve a concurrent reconnection. Do not retry a possibly consumed refresh token.
    await prisma.socialConnection.updateMany({ where: { id: connection.id, organizationId: connection.organizationId, encryptedToken: connection.encryptedToken }, data: { status: "linked" } });
    throw new XPublishError(X_RECONNECT);
  }
}
export { randomUUID, xAccount };
