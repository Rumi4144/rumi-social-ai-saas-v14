import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";

export const X_COOKIE = "rumi_x_oauth";
export const X_COOKIE_PATH = "/api/social/x";
export const X_OAUTH_TYPE = "X_OAUTH";
// Account linking only. Request publishing permissions when publishing is implemented.
export const X_SCOPES = "tweet.read users.read offline.access";
export type XCredentials = { clientId: string; clientSecret: string };
export type XGrant = { accessToken: string; refreshToken: string | null; expiresAt: number; scope: string; clientId: string };
export type XSession = { userId: string; expiresAt: number; verifier: string; configVersion: string };

export function xOrigin() {
  const url = new URL(process.env.NEXT_PUBLIC_APP_URL || "https://rumisocialai.com");
  if (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && url.hostname === "localhost")) throw new Error("X_APP_URL");
  return url.origin;
}
export function xCallbackUrl() { return `${xOrigin()}/api/social/x/callback`; }
export function sameXOrigin(req: Request) { return req.headers.get("origin") === xOrigin() && new URL(req.url).origin === xOrigin(); }
export function requireXWriter(role: string) {
  if (!["owner", "admin", "member", "superadmin"].includes(role)) throw new Error("FORBIDDEN");
}
export function canConfigureX(ctx: { role: string; isSuperAdmin?: boolean }) {
  return Boolean(ctx.isSuperAdmin || ["owner", "admin", "superadmin"].includes(ctx.role));
}
export function xId(kind: string, value: string) { return `x_${kind}_${createHash("sha256").update(value).digest("hex")}`; }
export function xConfigVersion(credentials: XCredentials) { return xId("config", JSON.stringify(credentials)); }
export function xPkce() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}
export async function xCredentials(organizationId: string): Promise<XCredentials | null> {
  const record = await prisma.socialConnection.findFirst({ where: { id: xId("app", organizationId), organizationId, provider: "x_app", status: "configured" } });
  if (record?.encryptedToken) {
    const value = JSON.parse(decryptSecret(record.encryptedToken));
    if (typeof value.clientId !== "string" || typeof value.clientSecret !== "string" || !value.clientId || !value.clientSecret) throw new Error("X_CONFIG_INVALID");
    return value;
  }
  const clientId = process.env.X_CLIENT_ID, clientSecret = process.env.X_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}
export function xBasic(credentials: XCredentials) {
  const encode = (value: string) => new URLSearchParams({ v: value }).toString().slice(2);
  return `Basic ${Buffer.from(`${encode(credentials.clientId)}:${encode(credentials.clientSecret)}`).toString("base64")}`;
}
export class XConnectionError extends Error {
  constructor(public reason: "credentials" | "credits" | "permissions" | "rate" | "connection") { super(reason); }
}
function requireXResponse(response: Response) {
  if (response.ok) return;
  throw new XConnectionError(response.status === 402 ? "credits" : response.status === 429 ? "rate" : response.status === 403 ? "permissions" : "connection");
}
export async function exchangeXCode(code: string, verifier: string, credentials: XCredentials): Promise<XGrant> {
  const response = await fetch("https://api.x.com/2/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: xBasic(credentials) },
    body: new URLSearchParams({ code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: xCallbackUrl() }),
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
  });
  if (response.status === 401) throw new XConnectionError("credentials");
  requireXResponse(response);
  const value = await response.json();
  if (typeof value.access_token !== "string" || !value.access_token || !Number.isFinite(value.expires_in) || value.expires_in <= 0 || String(value.token_type).toLowerCase() !== "bearer") throw new XConnectionError("connection");
  const scope = typeof value.scope === "string" ? value.scope : "";
  if (!["users.read", "tweet.read"].every(s => scope.split(" ").includes(s))) throw new XConnectionError("permissions");
  return { accessToken: value.access_token, refreshToken: typeof value.refresh_token === "string" ? value.refresh_token : null, expiresAt: Date.now() + value.expires_in * 1000, scope, clientId: credentials.clientId };
}
export async function xAccount(accessToken: string): Promise<{ id: string; username: string }> {
  const response = await fetch("https://api.x.com/2/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
  });
  requireXResponse(response);
  const value = (await response.json()).data;
  if (!value || typeof value.id !== "string" || !/^\d+$/.test(value.id) || typeof value.username !== "string" || !/^[A-Za-z0-9_]{1,15}$/.test(value.username)) throw new XConnectionError("connection");
  return { id: value.id, username: value.username };
}
export async function revokeXGrant(grant: XGrant, credentials: XCredentials) {
  // Revoke both: do not assume that revoking a refresh token also invalidates access.
  const results = await Promise.all([grant.refreshToken, grant.accessToken].filter((token): token is string => Boolean(token)).map(async token => {
    try {
      const response = await fetch("https://api.x.com/2/oauth2/revoke", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: xBasic(credentials) },
        body: new URLSearchParams({ token }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
      });
      return response.ok;
    } catch { return false; }
  }));
  return results.length > 0 && results.every(Boolean);
}
export async function startXSession(ctx: { userId: string; organizationId: string }, credentials: XCredentials) {
  const state = randomBytes(32).toString("hex"), pkce = xPkce();
  const session: XSession = { userId: ctx.userId, expiresAt: Date.now() + 600000, verifier: pkce.verifier, configVersion: xConfigVersion(credentials) };
  await prisma.job.deleteMany({ where: { organizationId: ctx.organizationId, type: X_OAUTH_TYPE, createdAt: { lt: new Date(Date.now() - 600000) } } });
  await prisma.job.create({ data: { id: xId("oauth", state), organizationId: ctx.organizationId, type: X_OAUTH_TYPE, status: "pending", payload: { encryptedSession: encryptSecret(JSON.stringify(session)) } } });
  const params = new URLSearchParams({ response_type: "code", client_id: credentials.clientId, redirect_uri: xCallbackUrl(), scope: X_SCOPES, state, code_challenge: pkce.challenge, code_challenge_method: "S256" });
  return { state, url: `https://x.com/i/oauth2/authorize?${params}` };
}
export async function consumeXSession(state: string, cookie: string | undefined, ctx: { userId: string; organizationId: string }) {
  if (!/^[a-f0-9]{64}$/.test(state) || cookie !== state) throw new Error("X_SESSION");
  const where = { id: xId("oauth", state), organizationId: ctx.organizationId, type: X_OAUTH_TYPE, status: "pending" };
  const job = await prisma.job.findFirst({ where });
  const payload = job?.payload as { encryptedSession?: string } | undefined;
  if (!payload?.encryptedSession) throw new Error("X_SESSION");
  const session = JSON.parse(decryptSecret(payload.encryptedSession)) as XSession;
  if (session.userId !== ctx.userId || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now() || !session.verifier) throw new Error("X_SESSION");
  // Claim once, then erase the verifier. Keeping a marker lets disconnect cancel an in-flight exchange.
  if (!(await prisma.job.updateMany({ where, data: { status: "exchanging", payload: {} } })).count) throw new Error("X_SESSION");
  return { ...session, id: where.id };
}
