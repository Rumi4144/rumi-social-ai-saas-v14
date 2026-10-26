import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/security/crypto";
import { X_COOKIE, X_COOKIE_PATH, X_OAUTH_TYPE, XConnectionError, consumeXSession, exchangeXCode, requireXWriter, revokeXGrant, xAccount, xConfigVersion, xCredentials, xId, xOrigin, type XGrant, type XCredentials } from "@/lib/x/connection";

export const maxDuration = 60;
export async function GET(req: Request) {
  const finish = (query: string) => {
    const response = NextResponse.redirect(new URL(`/settings/x?${query}`, xOrigin()));
    response.cookies.set(X_COOKIE, "", { path: X_COOKIE_PATH, maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  let grant: XGrant | undefined, credentials: XCredentials | null = null, sessionId: string | undefined;
  try {
    const url = new URL(req.url);
    if (url.origin !== xOrigin()) return finish("reason=session");
    const ctx = await tenantContext(); requireXWriter(ctx.role);
    const session = await consumeXSession(url.searchParams.get("state") || "", (await cookies()).get(X_COOKIE)?.value, ctx);
    sessionId = session.id;
    if (url.searchParams.has("error")) return finish("reason=cancelled");
    const code = url.searchParams.get("code");
    if (!code || code.length > 4096) return finish("reason=session");
    credentials = await xCredentials(ctx.organizationId);
    if (!credentials || xConfigVersion(credentials) !== session.configVersion) return finish("reason=setup");
    grant = await exchangeXCode(code, session.verifier, credentials);
    const account = await xAccount(grant.accessToken);
    const id = xId("account", `${ctx.organizationId}:${account.id}`);
    const data = { accountName: account.username, externalId: account.id, status: "linked", encryptedToken: encryptSecret(JSON.stringify(grant)) };
    // "linked" deliberately excludes X from publication until a publisher is available.
    await prisma.$transaction(async tx => {
      const claim = await tx.job.deleteMany({ where: { id: session.id, organizationId: ctx.organizationId, type: X_OAUTH_TYPE, status: "exchanging" } });
      if (!claim.count) throw new Error("X_SESSION");
      await tx.socialConnection.upsert({ where: { id }, create: { id, organizationId: ctx.organizationId, provider: "x", ...data }, update: data });
    }, { isolationLevel: "Serializable" });
    return finish("status=linked");
  } catch (error) {
    if (grant && credentials) await revokeXGrant(grant, credentials);
    const reason = error instanceof XConnectionError ? error.reason : error instanceof Error && error.message === "X_SESSION" ? "session" : "connection";
    return finish(`reason=${reason}`);
  } finally {
    if (sessionId) await prisma.job.deleteMany({ where: { id: sessionId, type: X_OAUTH_TYPE } }).catch(() => {});
  }
}
