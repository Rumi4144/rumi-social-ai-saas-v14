import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret, hashSensitive } from "@/lib/security/crypto";
import { verifyFacebookOAuthState } from "@/lib/social/oauth-state";
import { canManageFacebook, facebookConfig, FACEBOOK_OAUTH_TYPE, FACEBOOK_SELECTION_TYPE, validFacebookAttempt, saveFacebookPage, type FacebookAttempt, type FacebookPage } from "@/lib/social/facebook-connection";

export async function GET(req: Request) {
  let reason = "session";
  let attemptId: string | undefined;
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, process.env.NEXT_PUBLIC_APP_URL || req.url));
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  try {
    const url = new URL(req.url);
    const stateValue = url.searchParams.get("state") || "";
    const state = verifyFacebookOAuthState(stateValue);
    const id = `facebook_oauth_${hashSensitive(stateValue)}`;
    const attempt = await prisma.job.findFirst({ where: { id, organizationId: state.organizationId, type: FACEBOOK_OAUTH_TYPE, status: "pending" } });
    const payload = attempt?.payload as FacebookAttempt | null;
    if (!attempt || !validFacebookAttempt(payload, state.userId)) throw new Error("SESSION_EXPIRED");
    reason = "workspace";
    const [membership, user] = await Promise.all([
      prisma.membership.findFirst({ where: { userId: state.userId, organizationId: state.organizationId }, include: { organization: { select: { status: true } } } }),
      prisma.user.findUnique({ where: { id: state.userId }, select: { isSuperAdmin: true } }),
    ]);
    if (!user || (!user.isSuperAdmin && (!membership || !canManageFacebook(membership.role) || membership.organization.status === "suspended"))) throw new Error("FORBIDDEN");
    reason = "session";
    const claim = await prisma.job.updateMany({ where: { id, organizationId: state.organizationId, type: FACEBOOK_OAUTH_TYPE, status: "pending" }, data: { status: "processing" } });
    if (claim.count !== 1) throw new Error("SESSION_EXPIRED");
    attemptId = id;
    if (url.searchParams.has("error")) {
      await prisma.job.updateMany({ where: { id, status: "processing" }, data: { status: "cancelled", payload: {} } });
      return redirect("/settings?facebook=cancelled");
    }
    const code = url.searchParams.get("code");
    if (!code) throw new Error("CODE_MISSING");
    reason = "setup";
    const { appId, appSecret, redirectUri } = facebookConfig();
    if (payload!.redirectUri !== redirectUri) throw new Error("CALLBACK_CHANGED");
    reason = "token_exchange";
    const tokenUrl = new URL("https://graph.facebook.com/v23.0/oauth/access_token");
    tokenUrl.search = new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code }).toString();
    const tokenRes = await fetch(tokenUrl, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
    const token = await tokenRes.json();
    if (!tokenRes.ok || !token.access_token) throw new Error("TOKEN_EXCHANGE_FAILED");

    reason = "pages";
    const pages: FacebookPage[] = [];
    let after = "";
    // Follow only cursors on the fixed Meta endpoint; never fetch provider-supplied URLs.
    for (let batch = 0; batch < 10; batch++) {
      const pagesUrl = new URL("https://graph.facebook.com/v23.0/me/accounts");
      pagesUrl.search = new URLSearchParams({ fields: "id,name,picture{url},access_token,tasks", limit: "100", ...(after ? { after } : {}) }).toString();
      const pagesRes = await fetch(pagesUrl, { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
      const result = await pagesRes.json();
      if (!pagesRes.ok || !Array.isArray(result.data)) throw new Error("PAGES_FAILED");
      for (const page of result.data) {
        if (page.id && page.access_token && !pages.some(p => p.id === String(page.id))) pages.push({
          id: String(page.id), name: page.name || "Facebook Page", accessToken: String(page.access_token),
          pictureUrl: page.picture?.data?.url || "", tasks: Array.isArray(page.tasks) ? page.tasks : [],
        });
      }
      if (!result.paging?.next || !result.paging?.cursors?.after || result.paging.cursors.after === after) break;
      after = String(result.paging.cursors.after);
    }
    reason = "no_pages";
    if (!pages.length) throw new Error("NO_PAGES");
    reason = "account_mismatch";
    const page = payload!.accountId ? pages.find(p => p.id === payload!.accountId) : pages.length === 1 ? pages[0] : undefined;
    if (payload!.accountId && !page) throw new Error("PAGE_MISMATCH");
    reason = "encryption_key_missing";
    // Encrypt choices before saving the temporary selection. No user access token is retained.
    const encryptedPages = page ? null : encryptSecret(JSON.stringify(pages));
    reason = "session";
    const selectionId = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${state.organizationId}))`;
      if (!validFacebookAttempt(payload, state.userId)) throw new Error("SESSION_EXPIRED");
      // A disconnect while Facebook responds cancels this attempt and must win.
      const consumed = await tx.job.updateMany({ where: { id, organizationId: state.organizationId, type: FACEBOOK_OAUTH_TYPE, status: "processing" }, data: { status: "completed", payload: {} } });
      if (consumed.count !== 1) throw new Error("SESSION_CANCELLED");
      if (page) {
        await saveFacebookPage(tx, state.organizationId, payload!, page);
        return null;
      }
      const selection = await tx.job.create({ data: {
        organizationId: state.organizationId, type: FACEBOOK_SELECTION_TYPE, status: "pending",
        payload: { userId: state.userId, encryptedPages, expiresAt: Date.now() + 10 * 60 * 1000 },
      } });
      return selection.id;
    });
    return redirect(selectionId ? `/settings/facebook/select?job=${encodeURIComponent(selectionId)}` : "/settings?facebook=connected");
  } catch {
    // Provider payloads may contain tokens; return safe reason codes only.
    if (attemptId) await prisma.job.updateMany({ where: { id: attemptId, status: "processing" }, data: { status: "failed", payload: {}, error: reason } }).catch(() => {});
    return redirect(`/settings?facebook=error&reason=${reason}`);
  }
}
