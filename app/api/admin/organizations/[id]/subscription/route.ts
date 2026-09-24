import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { superAdminContext } from "@/lib/admin/context";
import { z } from "zod";

const S = z.object({
  plan: z.enum(["starter", "pro", "business", "enterprise"]),
  status: z.enum(["trialing", "active", "past_due", "canceled"]),
  credits: z.number().int().min(0).max(1000000),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await superAdminContext();

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

    const subscription = await prisma.subscription.upsert({
      where: { organizationId },
      update: {
        plan: parsed.data.plan,
        status: parsed.data.status,
        credits: parsed.data.credits,
      },
      create: {
        organizationId,
        plan: parsed.data.plan,
        status: parsed.data.status,
        credits: parsed.data.credits,
      },
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
