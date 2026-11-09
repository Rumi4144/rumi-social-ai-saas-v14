import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (ctx.role === "viewer" || req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({ error: "You cannot disconnect this account." }, { status: 403 });
    const id = String((await req.formData()).get("connectionId") || "");
    if (!id) return NextResponse.json({ error: "Choose an account." }, { status: 400 });
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.organizationId}))`;
      const connection = await tx.socialConnection.findFirst({ where: { id, organizationId: ctx.organizationId, provider: "tiktok" } });
      if (!connection) throw new Error("NOT_FOUND");
      await tx.socialConnection.update({ where: { id: connection.id }, data: { status: "disconnected", encryptedToken: null } });
      await tx.publishJob.updateMany({ where: { organizationId: ctx.organizationId, socialConnectionId: connection.id, status: { in: ["scheduled", "queued", "retry"] } }, data: { status: "failed", lastError: "TikTok account disconnected. Reconnect and review before posting again." } });
    });
    return NextResponse.redirect(new URL("/settings?tiktok=disconnected", req.url), 303);
  } catch { return NextResponse.json({ error: "Could not disconnect this TikTok account." }, { status: 400 }); }
}
