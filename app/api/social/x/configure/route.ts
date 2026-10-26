import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/security/crypto";
import { canConfigureX, sameXOrigin, xId, xOrigin, X_OAUTH_TYPE } from "@/lib/x/connection";

export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (!canConfigureX(ctx) || !sameXOrigin(req)) return NextResponse.json({ error: "A workspace administrator must save the X app settings." }, { status: 403 });
    const form = await req.formData();
    const clientId = String(form.get("clientId") || "").trim(), clientSecret = String(form.get("clientSecret") || "").trim();
    if (![clientId, clientSecret].every(value => value.length >= 8 && value.length <= 2048 && !/\s/.test(value))) return NextResponse.redirect(new URL("/settings/x?reason=credentials", xOrigin()), 303);
    const id = xId("app", ctx.organizationId), encryptedToken = encryptSecret(JSON.stringify({ clientId, clientSecret }));
    const saved = await prisma.$transaction(async tx => {
      const linked = await tx.socialConnection.count({ where: { organizationId: ctx.organizationId, provider: "x", status: { in: ["linked", "connected"] } } });
      if (linked) return false;
      await tx.socialConnection.upsert({ where: { id }, create: { id, organizationId: ctx.organizationId, provider: "x_app", status: "configured", encryptedToken }, update: { encryptedToken, status: "configured" } });
      await tx.job.deleteMany({ where: { organizationId: ctx.organizationId, type: X_OAUTH_TYPE } });
      return true;
    }, { isolationLevel: "Serializable" });
    if (!saved) return NextResponse.redirect(new URL("/settings/x?reason=disconnect_first", xOrigin()), 303);
    return NextResponse.redirect(new URL("/settings/x?status=saved", xOrigin()), 303);
  } catch { return NextResponse.redirect(new URL("/settings/x?reason=save", xOrigin()), 303); }
}
