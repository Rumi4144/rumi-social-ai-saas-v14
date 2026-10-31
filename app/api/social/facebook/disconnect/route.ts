import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { canManageFacebook, FACEBOOK_OAUTH_TYPE, FACEBOOK_SELECTION_TYPE } from "@/lib/social/facebook-connection";

export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (!canManageFacebook(ctx.role) || req.headers.get("origin") !== new URL(process.env.NEXT_PUBLIC_APP_URL || req.url).origin) {
      return NextResponse.json({ error: "You cannot disconnect this account." }, { status: 403 });
    }
    const connectionId = String((await req.formData()).get("connectionId") || "");
    const found = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.organizationId}))`;
      const connection = await tx.socialConnection.findFirst({ where: { id: connectionId, organizationId: ctx.organizationId, provider: "facebook" } });
      if (!connection) return false;
      await tx.publishJob.updateMany({ where: { organizationId: ctx.organizationId, socialConnectionId: connection.id, status: { in: ["scheduled", "retry"] } }, data: { status: "failed", lastError: "Facebook was disconnected. Reconnect and review this post before scheduling again." } });
      // Keep identity and publishing history so reconnect reuses the same account.
      await tx.socialConnection.update({ where: { id: connection.id }, data: { status: "disconnected", encryptedToken: null } });
      await tx.job.updateMany({ where: { organizationId: ctx.organizationId, type: { in: [FACEBOOK_OAUTH_TYPE, FACEBOOK_SELECTION_TYPE] }, status: { in: ["pending", "processing"] } }, data: { status: "cancelled", payload: {} } });
      return true;
    });
    if (!found) return NextResponse.json({ error: "Facebook account not found." }, { status: 404 });
    return NextResponse.redirect(new URL("/settings?facebook=disconnected", process.env.NEXT_PUBLIC_APP_URL || req.url), 303);
  } catch {
    return NextResponse.json({ error: "Could not disconnect Facebook. Refresh Settings and try again." }, { status: 403 });
  }
}
