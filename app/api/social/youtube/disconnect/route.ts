import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/security/crypto";
import { deleteYouTubeData } from "@/lib/publishing/youtube-data";

export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer" || req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "You cannot disconnect this channel." }, { status: 403 });
    const form = await req.formData();
    const connectionId = String(form.get("connectionId") || "");
    if (!connectionId) return NextResponse.json({ error: "Choose a channel." }, { status: 400 });
    if (form.get("confirm") !== "yes") return NextResponse.json({ error: "Confirm disconnect and deletion first." }, { status: 400 });
    const connection = await prisma.socialConnection.findFirst({ where: { id: connectionId, organizationId: ctx.organizationId, provider: "youtube" } });
    if (!connection) return NextResponse.json({ error: "Channel not found." }, { status: 404 });
    // Google revocation can invalidate a shared grant. Keep other channels usable.
    const other = await prisma.socialConnection.findFirst({ where: { organizationId: ctx.organizationId, provider: "youtube", id: { not: connectionId }, status: "connected" } });
    let revoked = true;
    if (connection) {
      try {
        const bundle = connection.encryptedToken ? JSON.parse(decryptSecret(connection.encryptedToken)) : {};
        const token = bundle.refreshToken || bundle.accessToken;
        if (token && !other) {
          const response = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(15000), cache: "no-store" });
          revoked = response.ok || response.status === 400;
        }
      } catch { revoked = false; }
      const deleted = await deleteYouTubeData(connection);
      if (!deleted) return NextResponse.json({ error: "YouTube was reconnected while deleting. Review the current connection before trying again." }, { status: 409 });
    }
    return NextResponse.redirect(new URL(`/settings?youtube=${revoked ? "disconnected" : "revoke_manually"}`, req.url), 303);
  } catch { return NextResponse.json({ error: "Could not disconnect YouTube. Please try again." }, { status: 500 }); }
}
