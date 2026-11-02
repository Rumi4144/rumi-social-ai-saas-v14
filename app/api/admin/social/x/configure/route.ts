import { NextResponse } from "next/server";
import { superAdminContext } from "@/lib/admin/context";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { decodeXCredentials, sameXOrigin, xId, xOrigin, X_OAUTH_TYPE, X_PLATFORM_APP_ID, X_PLATFORM_ORG } from "@/lib/x/connection";

function back(query: string) {
  const response = NextResponse.redirect(new URL(`/admin/social-apps?${query}`, xOrigin()), 303);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(req: Request) {
  let admin;
  try { admin = await superAdminContext(); }
  catch { return NextResponse.json({ error: "Master Admin access is required." }, { status: 403 }); }
  if (!sameXOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const form = await req.formData();
    const sourceOrganizationId = String(form.get("sourceOrganizationId") || "").trim();
    const outcome = await prisma.$transaction(async tx => {
      let credentials;
      if (sourceOrganizationId) {
        const source = await tx.socialConnection.findFirst({ where: { id: xId("app", sourceOrganizationId), organizationId: sourceOrganizationId, provider: "x_app", status: "configured" } });
        if (!source?.encryptedToken) return "source";
        // Copy developer settings only. Never copy the business's account tokens.
        credentials = decodeXCredentials(source.encryptedToken);
      } else {
        credentials = { clientId: String(form.get("clientId") || "").trim(), clientSecret: String(form.get("clientSecret") || "").trim() };
      }
      if (!Object.values(credentials).every(value => value.length >= 8 && value.length <= 2048 && !/\s/.test(value))) return "credentials";

      // Protect connections established with environment credentials before the
      // shared record existed. A different app cannot refresh their tokens.
      const accounts = await tx.socialConnection.findMany({ where: { provider: "x", status: { in: ["linked", "connected"] } }, select: { organizationId: true, encryptedToken: true } });
      const legacy = await tx.socialConnection.findMany({ where: { provider: "x_app", status: "configured" }, select: { id: true, organizationId: true, encryptedToken: true } });
      const legacyOrgs = new Set(legacy.filter(row => row.id === xId("app", row.organizationId) && row.encryptedToken).map(row => row.organizationId));
      for (const account of accounts) {
        if (legacyOrgs.has(account.organizationId)) continue;
        if (!account.encryptedToken) return "in_use";
        try {
          if (JSON.parse(decryptSecret(account.encryptedToken)).clientId !== credentials.clientId) return "in_use";
        } catch { return "in_use"; }
      }

      const encryptedToken = encryptSecret(JSON.stringify(credentials));
      await tx.socialConnection.upsert({
        where: { id: X_PLATFORM_APP_ID },
        create: { id: X_PLATFORM_APP_ID, organizationId: X_PLATFORM_ORG, provider: "x_platform_app", status: "configured", encryptedToken },
        update: { encryptedToken, status: "configured" },
      });
      await tx.job.deleteMany({ where: { type: X_OAUTH_TYPE } });
      await tx.auditLog.create({ data: { userId: admin.id, action: "x.platform_app.configure", resource: "SocialConnection", resourceId: X_PLATFORM_APP_ID, metadata: { sourceOrganizationId: sourceOrganizationId || null } } });
      return "saved";
    }, { isolationLevel: "Serializable" });
    return back(outcome === "saved" ? "status=saved" : `reason=${outcome}`);
  } catch { return back("reason=save"); }
}
