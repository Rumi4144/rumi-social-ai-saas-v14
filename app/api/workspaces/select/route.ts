import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "Reload this page and try again." }, { status: 403 });
    const parsed = z.object({ organizationId: z.string().min(1).max(200) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a workspace." }, { status: 400 });
    const ctx = await tenantContext(parsed.data.organizationId);
    const response = NextResponse.json({ ok: true });
    const options = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 };
    if (ctx.isSuperAdmin) response.cookies.set("adminWorkspace", ctx.organizationId, options);
    else response.cookies.set("workspaceSelection", JSON.stringify({ userId: ctx.userId, organizationId: ctx.organizationId }), options);
    return response;
  } catch (error) { return apiError(error, "Could not open this workspace."); }
}
