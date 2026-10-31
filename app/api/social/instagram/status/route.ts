import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/security/crypto";
import { instagramMessage } from "@/lib/social/instagram-connection";

export async function GET(req: Request) {
  const reply = (data: object, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
  let ctx;
  try { ctx = await tenantContext(); } catch { return reply({ error: "Sign in to check Instagram." }, 401); }
  const connection = await prisma.socialConnection.findFirst({ where: { id: new URL(req.url).searchParams.get("connectionId") || "", organizationId: ctx.organizationId, provider: "instagram", status: "connected" } });
  if (!connection) return reply({ error: "Instagram account not found." }, 404);
  if (!connection.encryptedToken || !connection.externalId) return reply({ ok: false, message: instagramMessage("disconnected") });
  let accessToken;
  try { accessToken = decryptSecret(connection.encryptedToken); }
  catch { return reply({ ok: false, message: "Rumi could not read the saved Instagram connection. Try reconnecting; if it persists, contact the administrator." }); }
  try {
    const response = await fetch("https://graph.instagram.com/v23.0/me?fields=id,username", {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
    const profile = await response.json();
    if (!response.ok) {
      const expired = response.status === 401 || profile.error?.code === 190;
      return reply({ ok: false, message: instagramMessage(expired ? "disconnected" : response.status === 403 ? "profile" : "temporarily_unavailable") });
    }
    if (!profile.id || String(profile.id) !== connection.externalId) return reply({ ok: false, message: instagramMessage("account_mismatch") });
    return reply({ ok: true, message: "Instagram account access confirmed. Each post still needs a finished image or reel and Instagram publishing permission." });
  } catch { return reply({ ok: false, message: instagramMessage("temporarily_unavailable") }); }
}
