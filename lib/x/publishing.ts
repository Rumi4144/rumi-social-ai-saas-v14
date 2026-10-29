import { randomUUID } from "node:crypto";
import twitterText from "twitter-text";
import type { SocialConnection } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { xAccount, xBasic, xCanPublish, xCredentials, xId, type XGrant } from "./connection";
import { xHash, xMediaBytes, xMediaReference, type XMedia } from "./media";
import type { XCaptionReview } from "./caption";

export type XPost = { contentItemId: string; connectionId: string; accountId: string; text: string; sourceText?: string; mediaUrl: string | null; media: XMedia | null; fingerprint: string };
// PostgreSQL JSON objects do not preserve insertion order.
export function xPostFingerprint(post: Omit<XPost, "fingerprint">) { return xHash(JSON.stringify([post.contentItemId, post.connectionId, post.accountId, post.text, post.mediaUrl, post.media ? [post.media.assetId, post.media.kind, post.media.hash] : null, ...(post.sourceText !== undefined ? [post.sourceText] : [])])); }
export const X_RECONNECT = "Open Settings → X and select Enable X posting, then authorize this account again.";
type XRequestStage = "initialize" | "append" | "finalize" | "status" | "post";
export class XPublishError extends Error { constructor(message: string, public code?: number, public stage?: XRequestStage) { super(message); } }
export class XBusy extends Error {}

export function xCaption(text: string, hasMedia: boolean) {
  const result = twitterText.parseTweet(text);
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
export async function prepareXPost(org: string, item: { id: string; caption: string | null; headline: string | null; mediaUrl: string | null }, connection: SocialConnection, review?: XCaptionReview): Promise<XPost> {
  if (connection.organizationId !== org || connection.provider !== "x" || !/^\d+$/.test(connection.externalId || "")) throw new XPublishError(X_RECONNECT);
  xGrant(connection);
  const sourceText = item.caption || item.headline || "";
  if (review && (review.approved !== true || review.sourceText !== sourceText)) throw new XPublishError("The original caption changed. Review the updated X caption before posting.");
  const text = xCaption(review ? review.text : sourceText, Boolean(item.mediaUrl));
  try {
    const ref = xMediaReference(item.mediaUrl);
    const media = ref ? { ...ref, hash: xHash((await xMediaBytes(org, item.id, ref)).bytes) } : null;
    const post = { contentItemId: item.id, connectionId: connection.id, accountId: connection.externalId!, text, ...(review ? { sourceText } : {}), mediaUrl: item.mediaUrl, media };
    return { ...post, fingerprint: xPostFingerprint(post) };
  } catch { throw new XPublishError("The selected photo or reel could not be prepared for X. Save a finished MP4 reel (under 100 MB) or a Rumi photo, then approve it again."); }
}

function xRequestStage(path: string): XRequestStage | undefined {
  if (path === "/2/tweets") return "post";
  if (path === "/2/media/upload/initialize") return "initialize";
  if (/^\/2\/media\/upload\/\d+\/append$/.test(path)) return "append";
  if (/^\/2\/media\/upload\/\d+\/finalize$/.test(path)) return "finalize";
  if (path.startsWith("/2/media/upload?")) return "status";
}
// Only translate known provider reasons. Never echo raw response text, request
// values, credentials, captions or media data into the UI or saved job history.
function xRejectionReason(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const value = payload as Record<string, unknown>;
  const problems = [value, ...(Array.isArray(value.errors) ? value.errors.filter(item => item && typeof item === "object").slice(0, 10) : [])];
  const detail = problems.flatMap(item => [item.detail, item.message, item.title]).filter(text => typeof text === "string").join(" ").slice(0, 4000).toLowerCase();
  if (problems.some(item => item.code === 187) || /duplicate (?:content|post|tweet)/.test(detail)) return "X reports duplicate content. Check your X profile for the existing post.";
  if (/media(?:_id| id)?.{0,40}(?:invalid|expired)|(?:invalid|expired).{0,40}media(?:_id| id)/.test(detail)) return "X reports that the uploaded media is invalid or expired.";
  if (/unsupported.{0,40}(?:format|codec)|(?:format|codec).{0,40}(?:unsupported|not supported)/.test(detail)) return "X does not support this file’s encoding. Export the reel as MP4 with H.264 video and AAC audio.";
  if (/segments?.{0,80}(?:size|bytes|match)|(?:size|bytes).{0,80}(?:mismatch|does not match)/.test(detail)) return "X reports an incomplete media upload.";
  const fields = problems.flatMap(item => [item.parameter, ...Object.keys(item.parameters && typeof item.parameters === "object" ? item.parameters : {})]);
  if (fields.some(field => ["media", "media_data", "segment_index", "total_bytes", "media_type", "media_category"].includes(field))) return "X reports a problem with the media upload fields.";
  if (fields.some(field => ["media_id", "media.media_ids", "media_ids"].includes(field))) return "X reports a problem with the uploaded media reference.";
  if (fields.includes("text")) return "X reports a problem with the caption.";
  return "";
}
export function xHttpError(status: number, path = "", payload?: unknown) {
  const stage = xRequestStage(path);
  const actions = { initialize: "starting the media upload", append: "receiving the photo or reel", finalize: "finishing the media upload", status: "checking media processing", post: "creating the post" };
  const rejection = `X rejected the request${stage ? ` while ${actions[stage]}` : ""} (${status}). ${xRejectionReason(payload) || "Rumi could not complete this step. Your saved post is still available."}`;
  return new XPublishError(status === 401 ? X_RECONNECT : status === 402 ? "X requires more API credits. Check the balance in your X Developer Console, then try this post again." : status === 403 ? "X refused this post. Check your X app’s posting permissions, account restrictions and media requirements before trying again." : status === 429 ? "X is limiting requests. Wait a few minutes before trying again." : [400, 404, 413, 422].includes(status) ? rejection : "X could not complete this request. Check publishing history before trying again.", status, stage);
}
export async function xRequest(path: string, token: string, body?: unknown) {
  const multipart = body instanceof FormData;
  const hasBody = body !== undefined && body !== null;
  const response = await fetch(`https://api.x.com${path}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, ...(hasBody && !multipart ? { "Content-Type": "application/json" } : {}) }, ...(hasBody ? { body: multipart ? body : JSON.stringify(body) } : {}), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    let payload: unknown;
    try { payload = await response.json(); } catch { /* An HTML/empty rejection has no safe provider details. */ }
    throw xHttpError(response.status, path, payload);
  }
  if (response.status === 204) return {};
  const text = await response.text();
  if (!text.trim() && xRequestStage(path) === "append") return {};
  const result = JSON.parse(text);
  if (xRequestStage(path) === "append" && result.errors?.length) throw xHttpError(400, path, result);
  return result;
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
