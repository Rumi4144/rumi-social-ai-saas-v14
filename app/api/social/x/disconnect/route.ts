import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/security/crypto";
import { requireXWriter, revokeXGrant, sameXOrigin, xCredentials, xOrigin, X_OAUTH_TYPE } from "@/lib/x/connection";

export async function POST(req: Request) {
  try {
    const ctx = await tenantContext(); requireXWriter(ctx.role);
    if (!sameXOrigin(req)) return NextResponse.json({ error: "Disconnect from the Rumi settings page." }, { status: 403 });
    const id = String((await req.formData()).get("connectionId") || "");
    const connection = await prisma.socialConnection.findFirst({ where: { id, organizationId: ctx.organizationId, provider: "x", status: { in: ["linked", "connected"] } } });
    if (!connection) return NextResponse.redirect(new URL("/settings/x?reason=session", xOrigin()), 303);
    // Remove only the exact grant shown, leaving a concurrent reconnection untouched.
    const removed = await prisma.$transaction(async tx => {
      await tx.job.deleteMany({ where: { organizationId: ctx.organizationId, type: X_OAUTH_TYPE } });
      const removed = await tx.socialConnection.deleteMany({ where: { id: connection.id, organizationId: ctx.organizationId, provider: "x", encryptedToken: connection.encryptedToken } });
      if (removed.count) await tx.publishJob.updateMany({ where: { organizationId: ctx.organizationId, socialConnectionId: connection.id, platform: "x", status: { in: ["scheduled", "retry", "publishing"] } }, data: { status: "failed", lastError: "Cancelled when X was disconnected. Review and approve the post again to send it." } });
      return removed;
    });
    if (!removed.count) return NextResponse.redirect(new URL("/settings/x?reason=session", xOrigin()), 303);
    let revoked = false;
    try {
      const credentials = await xCredentials(ctx.organizationId);
      const grant = connection.encryptedToken ? JSON.parse(decryptSecret(connection.encryptedToken)) : null;
      if (credentials && grant?.clientId === credentials.clientId) revoked = await revokeXGrant(grant, credentials);
    } catch { /* Local disconnect still succeeds if upstream revocation is unavailable. */ }
    return NextResponse.redirect(new URL(`/settings/x?status=${revoked ? "disconnected" : "revoke_manually"}`, xOrigin()), 303);
  } catch { return NextResponse.redirect(new URL("/settings/x?reason=connection", xOrigin()), 303); }
}
