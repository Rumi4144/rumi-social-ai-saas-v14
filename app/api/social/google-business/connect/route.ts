import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { googleBusinessConfigured, googleBusinessRedirectUri, GOOGLE_BUSINESS_SCOPE } from "@/lib/google-business/client";
import { requireGoogleWriter, sameAppRequest } from "@/lib/google-business/session";
export async function GET(req: Request) { return NextResponse.redirect(new URL("/settings/google-business", req.url)); }
export async function POST(req: Request) {
  try {
    const ctx = await tenantContext(); requireGoogleWriter(ctx.role);
    if (!sameAppRequest(req) || (await req.formData()).get("consent") !== "yes") return NextResponse.json({ error: "Confirm the Google Business Profile connection first." }, { status: 400 });
    if (!googleBusinessConfigured()) return NextResponse.redirect(new URL("/settings/google-business?reason=setup", req.url), 303);
    const state = randomBytes(32).toString("hex");
    await prisma.job.create({ data: { id: state, organizationId: ctx.organizationId, type: "GOOGLE_BUSINESS_OAUTH", status: "pending", payload: { userId: ctx.userId, expiresAt: Date.now() + 10 * 60 * 1000 } } });
    const params = new URLSearchParams({ client_id: process.env.GOOGLE_BUSINESS_CLIENT_ID!, redirect_uri: googleBusinessRedirectUri(), response_type: "code", access_type: "offline", prompt: "consent", scope: GOOGLE_BUSINESS_SCOPE, state });
    const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 303);
    response.cookies.set("google_business_oauth", state, { httpOnly: true, secure: new URL(req.url).protocol === "https:", sameSite: "lax", path: "/api/social/google-business", maxAge: 600 });
    return response;
  } catch { return NextResponse.json({ error: "Could not start Google Business Profile connection. Sign in with permission to manage this workspace." }, { status: 403 }); }
}
