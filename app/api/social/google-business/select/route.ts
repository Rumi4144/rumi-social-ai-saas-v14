import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { googleSelection, requireGoogleWriter, sameAppRequest } from "@/lib/google-business/session";
import { GOOGLE_BUSINESS_PROVIDER, listBusinessLocations } from "@/lib/google-business/client";
export async function POST(req: Request) {
  try {
    const ctx = await tenantContext(); requireGoogleWriter(ctx.role);
    if (!sameAppRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    const form = await req.formData();
    const selectionId = String(form.get("selectionId") || "");
    const selectedName = String(form.get("location") || "");
    const { job, payload, grant } = await googleSelection(selectionId, ctx);
    // Recheck the authorized account rather than trusting an ID submitted by the browser.
    const location = (await listBusinessLocations(grant.accessToken)).find(l => l.name === selectedName);
    if (!location) return NextResponse.json({ error: "Choose a business location managed by this Google account." }, { status: 400 });
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.organizationId}))`;
      const claim = await tx.job.updateMany({ where: { id: job.id, organizationId: ctx.organizationId, status: "pending" }, data: { status: "completed", payload: {}, result: { location: location.name } } });
      if (!claim.count) throw new Error("Connection session already used.");
      const existing = await tx.socialConnection.findFirst({ where: { organizationId: ctx.organizationId, provider: GOOGLE_BUSINESS_PROVIDER } });
      const data = { accountName: location.title, externalId: location.name, status: "connected", encryptedToken: payload.encryptedGrant };
      if (existing) await tx.socialConnection.update({ where: { id: existing.id }, data });
      else await tx.socialConnection.create({ data: { ...data, organizationId: ctx.organizationId, provider: GOOGLE_BUSINESS_PROVIDER } });
    });
    return NextResponse.redirect(new URL("/settings?googleBusiness=connected", req.url), 303);
  } catch { return NextResponse.redirect(new URL("/settings/google-business?reason=selection", req.url), 303); }
}
