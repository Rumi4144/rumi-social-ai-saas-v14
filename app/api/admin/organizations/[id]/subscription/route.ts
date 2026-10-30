import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { superAdminContext } from "@/lib/admin/context";
import { z } from "zod";
import { canonicalPlan } from "@/lib/billing/packages";

const S = z.object({
  plan: z.enum(["starter", "creator", "business", "agency", "pro", "enterprise"]),
  status: z.enum(["trialing", "active", "past_due", "canceled"]),
  credits: z.number().int().min(0).max(1000000),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await superAdminContext();

    const { id: organizationId } = await params;
    const parsed = S.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const subscription = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Subscription" WHERE "organizationId" = ${organizationId} FOR UPDATE`;
      const before = await tx.subscription.findUnique({ where: { organizationId } });
      const data = { ...parsed.data, plan: canonicalPlan(parsed.data.plan) };
      const updated = await tx.subscription.upsert({ where: { organizationId }, update: data, create: { organizationId, ...data } });
      const delta = updated.credits - (before?.credits || 0);
      if (delta) await tx.creditLedger.create({ data: { organizationId, delta, balanceAfter: updated.credits, reason: "admin_balance_adjustment", referenceId: updated.id } });
      await tx.auditLog.create({ data: { organizationId, userId: admin.id, action: "subscription_updated", resource: "subscription", resourceId: updated.id, metadata: { before: before ? { plan: before.plan, status: before.status, credits: before.credits } : null, after: data } } });
      return updated;
    });

    return NextResponse.json({
      ok: true,
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        credits: subscription.credits,
      },
    });
  } catch (error: any) {
    const message = error?.message || "Could not update subscription";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    console.error("ADMIN_SUBSCRIPTION_UPDATE_ERROR", error);

    return NextResponse.json(
      { error: "Could not update subscription" },
      { status: 500 },
    );
  }
}
