import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { requireGoogleWriter, sameAppRequest } from "@/lib/google-business/session";
import { GOOGLE_BUSINESS_PROVIDER, } from "@/lib/google-business/client";
export async function POST(req: Request) {
  try {
    const ctx = await tenantContext(); requireGoogleWriter(ctx.role);
    if (!sameAppRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const id = String((await req.formData()).get("connectionId") || "");
    if (!id) return NextResponse.json({ error: "Choose a business location." }, { status: 400 });
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.organizationId}))`;
      const connections = await tx.socialConnection.findMany({ where: { id, organizationId: ctx.organizationId, provider: GOOGLE_BUSINESS_PROVIDER }, select: { id: true } });
      if (!connections.length) throw new Error("NOT_FOUND");
      await tx.publishJob.updateMany({ where: { organizationId: ctx.organizationId, socialConnectionId: { in: connections.map(c => c.id) }, status: { in: ["queued", "retry"] } }, data: { status: "cancelled", lastError: "Google Business Profile was disconnected." } });
      await tx.socialConnection.updateMany({ where: { id, organizationId: ctx.organizationId, provider: GOOGLE_BUSINESS_PROVIDER }, data: { status: "disconnected", encryptedToken: null } });
      await tx.job.updateMany({ where: { organizationId: ctx.organizationId, type: { in: ["GOOGLE_BUSINESS_OAUTH", "GOOGLE_BUSINESS_SELECTION"] } }, data: { status: "cancelled", payload: {}, result: {} } });
    });
    return NextResponse.redirect(new URL("/settings?googleBusiness=disconnected", req.url), 303);
  } catch { return NextResponse.json({ error: "Could not disconnect Google Business Profile." }, { status: 403 }); }
}
