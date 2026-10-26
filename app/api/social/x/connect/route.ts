import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { X_COOKIE, X_COOKIE_PATH, requireXWriter, sameXOrigin, startXSession, xCredentials, xOrigin } from "@/lib/x/connection";

export async function GET() { return NextResponse.redirect(new URL("/settings/x", xOrigin())); }
export async function POST(req: Request) {
  try {
    const ctx = await tenantContext(); requireXWriter(ctx.role);
    if (!sameXOrigin(req) || (await req.formData()).get("consent") !== "yes") return NextResponse.json({ error: "Confirm the X connection on the Rumi settings page." }, { status: 403 });
    const credentials = await xCredentials(ctx.organizationId);
    if (!credentials) return NextResponse.redirect(new URL("/settings/x?reason=setup", xOrigin()), 303);
    const session = await startXSession(ctx, credentials);
    const response = NextResponse.redirect(session.url, 303);
    response.cookies.set(X_COOKIE, session.state, { httpOnly: true, secure: xOrigin().startsWith("https:"), sameSite: "lax", path: X_COOKIE_PATH, maxAge: 600 });
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch { return NextResponse.redirect(new URL("/settings/x?reason=connection", xOrigin()), 303); }
}
