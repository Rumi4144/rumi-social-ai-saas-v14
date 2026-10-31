import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { hashSensitive } from "@/lib/security/crypto";
import { createFacebookOAuthState } from "@/lib/social/oauth-state";
import { canManageFacebook, facebookConfig, FACEBOOK_OAUTH_TYPE } from "@/lib/social/facebook-connection";

export async function GET(req: Request) {
  let reason = "workspace";
  try {
    const ctx = await tenantContext();
    if (!canManageFacebook(ctx.role)) throw new Error("FORBIDDEN");
    reason = "setup";
    const { appId, redirectUri } = facebookConfig();
    reason = "session";
    const connectionId = new URL(req.url).searchParams.get("connectionId");
    const state = createFacebookOAuthState({ userId: ctx.userId, organizationId: ctx.organizationId });
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.organizationId}))`;
      const connection = connectionId ? await tx.socialConnection.findFirst({ where: { id: connectionId, organizationId: ctx.organizationId, provider: "facebook", status: "connected" } }) : null;
      if (connectionId && !connection) throw new Error("CONNECTION_NOT_FOUND");
      await tx.job.create({ data: {
        id: `facebook_oauth_${hashSensitive(state)}`, organizationId: ctx.organizationId,
        type: FACEBOOK_OAUTH_TYPE, status: "pending",
        payload: { userId: ctx.userId, connectionId, accountId: connection?.externalId || null, redirectUri, expiresAt: Date.now() + 10 * 60 * 1000 },
      } });
    });
    const params = new URLSearchParams({
      client_id: appId, redirect_uri: redirectUri, response_type: "code",
      scope: "pages_show_list,pages_read_engagement,pages_manage_posts,business_management", state,
      auth_type: "rerequest",
    });
    const response = NextResponse.redirect(`https://www.facebook.com/dialog/oauth?${params}`);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return NextResponse.redirect(new URL(`/settings?facebook=error&reason=${reason}`, process.env.NEXT_PUBLIC_APP_URL || req.url));
  }
}
