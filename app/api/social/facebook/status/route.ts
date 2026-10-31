import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/security/crypto";
import { facebookMessage } from "@/lib/social/facebook-connection";

export async function GET(req: Request) {
  const reply = (data: object, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
  let ctx;
  try { ctx = await tenantContext(); } catch { return reply({ error: "Sign in to check Facebook." }, 401); }
  const connection = await prisma.socialConnection.findFirst({ where: { id: new URL(req.url).searchParams.get("connectionId") || "", organizationId: ctx.organizationId, provider: "facebook", status: "connected" } });
  if (!connection) return reply({ error: "Facebook account not found." }, 404);
  if (!connection.encryptedToken || !connection.externalId) return reply({ ok: false, message: facebookMessage("disconnected") });
  let accessToken;
  try {
    const saved = JSON.parse(decryptSecret(connection.encryptedToken));
    if (!saved.pageAccessToken || saved.pageId !== connection.externalId) throw new Error("INVALID_PAGE_TOKEN");
    accessToken = String(saved.pageAccessToken);
  }
  catch { return reply({ ok: false, message: "Rumi could not read the saved Facebook connection. Try reconnecting; if it persists, contact the administrator." }); }
  try {
    const response = await fetch("https://graph.facebook.com/v23.0/me?fields=id,name", {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
    const profile = await response.json();
    if (!response.ok) {
      const expired = response.status === 401 || profile.error?.code === 190;
      return reply({ ok: false, message: facebookMessage(expired ? "disconnected" : response.status === 403 ? "pages" : "temporarily_unavailable") });
    }
    if (!profile.id || String(profile.id) !== connection.externalId) return reply({ ok: false, message: facebookMessage("account_mismatch") });
    return reply({ ok: true, message: "Facebook Page access confirmed. Facebook will still check publishing permissions when you post." });
  } catch { return reply({ ok: false, message: facebookMessage("temporarily_unavailable") }); }
}
