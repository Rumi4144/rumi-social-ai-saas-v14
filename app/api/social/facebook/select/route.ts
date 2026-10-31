import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/security/crypto";
import { tenantContext } from "@/lib/auth/context";
import { canManageFacebook, FACEBOOK_SELECTION_TYPE, validFacebookAttempt, saveFacebookPage, type FacebookAttempt, type FacebookPage } from "@/lib/social/facebook-connection";

export async function POST(req: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.url;
  let reason = "workspace";
  try {
    const ctx = await tenantContext();
    if (!canManageFacebook(ctx.role) || req.headers.get("origin") !== new URL(appUrl).origin) {
      return NextResponse.json({ error: "You cannot change this Facebook connection." }, { status: 403 });
    }
    reason = "session";
    const form = await req.formData();
    const jobId = String(form.get("jobId") || "");
    const pageId = String(form.get("pageId") || "");
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${ctx.organizationId}))`;
      const job = await tx.job.findFirst({ where: { id: jobId, organizationId: ctx.organizationId, type: FACEBOOK_SELECTION_TYPE, status: "pending" } });
      const payload = job?.payload as FacebookAttempt | null;
      if (!job || !validFacebookAttempt(payload, ctx.userId) || !payload?.encryptedPages) throw new Error("SESSION_EXPIRED");
      const pages = JSON.parse(decryptSecret(payload.encryptedPages)) as FacebookPage[];
      const page = pages.find(p => p.id === pageId && p.accessToken);
      if (!page) throw new Error("PAGE_NOT_AVAILABLE");
      const consumed = await tx.job.updateMany({ where: { id: job.id, organizationId: ctx.organizationId, type: FACEBOOK_SELECTION_TYPE, status: "pending" }, data: { status: "completed", progress: 100, payload: {} } });
      if (consumed.count !== 1) throw new Error("SESSION_CANCELLED");
      await saveFacebookPage(tx, ctx.organizationId, payload, page);
    });
    return NextResponse.redirect(new URL("/settings?facebook=connected", appUrl), 303);
  } catch {
    return NextResponse.redirect(new URL(`/settings?facebook=error&reason=${reason}`, appUrl), 303);
  }
}
