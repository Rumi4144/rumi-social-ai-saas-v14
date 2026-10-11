import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/security/crypto";
import { exchangeGoogleCode } from "@/lib/google-business/client";
import { GOOGLE_SELECTION_TYPE, requireGoogleWriter } from "@/lib/google-business/session";
export async function GET(req: Request) {
  const finish = (query: string) => { const response = NextResponse.redirect(new URL(`/settings/google-business?${query}`, process.env.NEXT_PUBLIC_APP_URL || req.url)); response.cookies.set("google_business_oauth", "", { path: "/api/social/google-business", maxAge: 0 }); return response; };
  try {
    const ctx = await tenantContext(); requireGoogleWriter(ctx.role);
    const params = new URL(req.url).searchParams;
    if (params.has("error")) return finish("reason=cancelled");
    const state = params.get("state"), code = params.get("code");
    if (!state || !code || !/^[a-f0-9]{64}$/.test(state) || (await cookies()).get("google_business_oauth")?.value !== state) return finish("reason=session");
    const oauth = await prisma.job.findFirst({ where: { id: state, organizationId: ctx.organizationId, type: "GOOGLE_BUSINESS_OAUTH", status: "pending" } });
    const payload = oauth?.payload as { userId?: string; expiresAt?: number } | undefined;
    if (!oauth || payload?.userId !== ctx.userId || !payload.expiresAt || payload.expiresAt < Date.now()) return finish("reason=session");
    const claim = await prisma.job.updateMany({ where: { id: oauth.id, status: "pending" }, data: { status: "used", payload: {} } });
    if (!claim.count) return finish("reason=session");
    const grant = await exchangeGoogleCode(code);
    const selection = await prisma.job.create({ data: { organizationId: ctx.organizationId, type: GOOGLE_SELECTION_TYPE, status: "pending", payload: { userId: ctx.userId, expiresAt: Date.now() + 30 * 60 * 1000, encryptedGrant: encryptSecret(JSON.stringify(grant)) } } });
    return finish(`selection=${encodeURIComponent(selection.id)}`);
  } catch { return finish("reason=connection"); }
}
