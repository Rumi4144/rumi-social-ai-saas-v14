import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { hashSensitive } from "@/lib/security/crypto";
import { createInstagramOAuthState } from "@/lib/social/oauth-state";
import { canManageInstagram, instagramConfig, INSTAGRAM_OAUTH_TYPE } from "@/lib/social/instagram-connection";

export async function GET(req: Request) {
  let reason = "workspace";
  try {
    const ctx = await tenantContext();
    if (!canManageInstagram(ctx.role)) throw new Error("FORBIDDEN");
    reason = "setup";
    const { appId, redirectUri } = instagramConfig();
    reason = "session";
    const connectionId = new URL(req.url).searchParams.get("connectionId");
    const state = createInstagramOAuthState({ userId: ctx.userId, organizationId: ctx.organizationId });
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.organizationId}))`;
      const connection = connectionId ? await tx.socialConnection.findFirst({ where: { id: connectionId, organizationId: ctx.organizationId, provider: "instagram", status: "connected" } }) : null;
      if (connectionId && !connection) throw new Error("CONNECTION_NOT_FOUND");
      await tx.job.create({ data: {
        id: `instagram_oauth_${hashSensitive(state)}`, organizationId: ctx.organizationId,
        type: INSTAGRAM_OAUTH_TYPE, status: "pending",
        payload: { userId: ctx.userId, connectionId, accountId: connection?.externalId || null, redirectUri, expiresAt: Date.now() + 10 * 60 * 1000 },
      } });
    });
    const params = new URLSearchParams({
      client_id: appId, redirect_uri: redirectUri, response_type: "code",
      scope: "instagram_business_basic,instagram_business_content_publish", state,
    });
    const response = NextResponse.redirect(`https://www.instagram.com/oauth/authorize?${params}`);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch {
    return NextResponse.redirect(new URL(`/settings?instagram=error&reason=${reason}`, process.env.NEXT_PUBLIC_APP_URL || req.url));
  }
}
