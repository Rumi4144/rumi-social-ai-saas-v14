import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret, hashSensitive } from "@/lib/security/crypto";
import { verifyInstagramOAuthState } from "@/lib/social/oauth-state";
import { canManageInstagram, instagramConfig, INSTAGRAM_OAUTH_TYPE } from "@/lib/social/instagram-connection";

export async function GET(req: Request) {
  let reason = "session";
  let attemptId: string | undefined;
  const redirect = (query: string) => {
    const response = NextResponse.redirect(new URL(`/settings?${query}`, process.env.NEXT_PUBLIC_APP_URL || req.url));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  try {
    const url = new URL(req.url);
    const stateValue = url.searchParams.get("state") || "";
    const state = verifyInstagramOAuthState(stateValue);
    const id = `instagram_oauth_${hashSensitive(stateValue)}`;
    const attempt = await prisma.job.findFirst({ where: { id, organizationId: state.organizationId, type: INSTAGRAM_OAUTH_TYPE, status: "pending" } });
    const payload = attempt?.payload as { userId?: string; connectionId?: string; accountId?: string; redirectUri?: string; expiresAt?: number } | undefined;
    if (!attempt || payload?.userId !== state.userId || !payload.expiresAt || payload.expiresAt < Date.now()) throw new Error("SESSION_EXPIRED");
    reason = "workspace";
    const [membership, user] = await Promise.all([
      prisma.membership.findFirst({ where: { userId: state.userId, organizationId: state.organizationId }, include: { organization: { select: { status: true } } } }),
      prisma.user.findUnique({ where: { id: state.userId }, select: { isSuperAdmin: true } }),
    ]);
    if (!user || (!user.isSuperAdmin && (!membership || !canManageInstagram(membership.role) || membership.organization.status === "suspended"))) throw new Error("FORBIDDEN");
    reason = "session";
    const claim = await prisma.job.updateMany({ where: { id, organizationId: state.organizationId, type: INSTAGRAM_OAUTH_TYPE, status: "pending" }, data: { status: "processing" } });
    if (claim.count !== 1) throw new Error("SESSION_EXPIRED");
    attemptId = id;
    if (url.searchParams.has("error")) {
      await prisma.job.updateMany({ where: { id, status: "processing" }, data: { status: "cancelled", payload: {} } });
      return redirect("instagram=cancelled");
    }
    const code = url.searchParams.get("code");
    if (!code) throw new Error("CODE_MISSING");
    reason = "setup";
    const { appId, appSecret, redirectUri } = instagramConfig();
    if (payload.redirectUri !== redirectUri) throw new Error("CALLBACK_CHANGED");

    reason = "token_exchange";
    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: appId, client_secret: appSecret, grant_type: "authorization_code", redirect_uri: redirectUri, code }),
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token) throw new Error("TOKEN_EXCHANGE_FAILED");
    reason = "long_token";
    const longUrl = new URL("https://graph.instagram.com/access_token");
    longUrl.search = new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: appSecret, access_token: String(token.access_token) }).toString();
    const longRes = await fetch(longUrl, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    const grant = await longRes.json();
    if (!longRes.ok || !grant.access_token) throw new Error("LONG_TOKEN_FAILED");
    reason = "profile";
    const profileRes = await fetch("https://graph.instagram.com/v23.0/me?fields=id,username,account_type", {
      headers: { Authorization: `Bearer ${grant.access_token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
    });
    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.id) throw new Error("PROFILE_FAILED");
    reason = "account_mismatch";
    if (payload.accountId && String(profile.id) !== payload.accountId) throw new Error("ACCOUNT_MISMATCH");
    reason = "encryption_key_missing";
    const encryptedToken = encryptSecret(String(grant.access_token));
    reason = "session";
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${state.organizationId}))`;
      // A disconnect while the provider was responding must win over this callback.
      const consumed = await tx.job.updateMany({ where: { id, organizationId: state.organizationId, type: INSTAGRAM_OAUTH_TYPE, status: "processing" }, data: { status: "completed", payload: {} } });
      if (consumed.count !== 1) throw new Error("SESSION_CANCELLED");
      const existing = await tx.socialConnection.findFirst({ where: { organizationId: state.organizationId, provider: "instagram", externalId: String(profile.id) } });
      if (payload.connectionId && existing?.id !== payload.connectionId) throw new Error("CONNECTION_CHANGED");
      const data = { accountName: profile.username || "Instagram", status: "connected", encryptedToken };
      if (existing) await tx.socialConnection.update({ where: { id: existing.id }, data });
      else await tx.socialConnection.create({ data: { organizationId: state.organizationId, provider: "instagram", externalId: String(profile.id), ...data } });
    });
    return redirect("instagram=connected");
  } catch {
    // Provider payloads can contain credentials; expose only our safe reason codes.
    if (attemptId) await prisma.job.updateMany({ where: { id: attemptId, status: "processing" }, data: { status: "failed", payload: {}, error: reason } }).catch(() => {});
    return redirect(`instagram=error&reason=${reason}`);
  }
}
