import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { superAdminContext } from "@/lib/admin/context";
import { z } from "zod";

const S = z.object({
  confirmationName: z.string().trim().min(1),
});

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await superAdminContext();

    const { id } = await params;
    const parsed = S.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Organization name confirmation is required." },
        { status: 400 },
      );
    }

    const organization = await prisma.organization.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        brands: {
          select: {
            id: true,
            campaigns: {
              select: { id: true },
            },
          },
        },
      },
    });

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found." },
        { status: 404 },
      );
    }

    if (parsed.data.confirmationName !== organization.name) {
      return NextResponse.json(
        { error: "Organization name does not match." },
        { status: 400 },
      );
    }

    const brandIds = organization.brands.map((brand) => brand.id);
    const campaignIds = organization.brands.flatMap((brand) =>
      brand.campaigns.map((campaign) => campaign.id),
    );

    await prisma.$transaction(async (tx) => {
      if (campaignIds.length) {
        await tx.contentItem.deleteMany({
          where: { campaignId: { in: campaignIds } },
        });

        await tx.campaign.deleteMany({
          where: { id: { in: campaignIds } },
        });
      }

      if (brandIds.length) {
        await tx.product.deleteMany({
          where: { brandId: { in: brandIds } },
        });

        await tx.brand.deleteMany({
          where: { id: { in: brandIds } },
        });
      }

      await tx.usageEvent.deleteMany({ where: { organizationId: id } });
      await tx.socialConnection.deleteMany({ where: { organizationId: id } });
      await tx.job.deleteMany({ where: { organizationId: id } });
      await tx.creditLedger.deleteMany({ where: { organizationId: id } });
      await tx.mediaAsset.deleteMany({ where: { organizationId: id } });
      await tx.publishJob.deleteMany({ where: { organizationId: id } });
      await tx.auditLog.deleteMany({ where: { organizationId: id } });
      await tx.approvalShare.deleteMany({ where: { organizationId: id } });
      await tx.creditGrant.deleteMany({ where: { organizationId: id } });
      await tx.billingEvent.deleteMany({ where: { organizationId: id } });
      await tx.onboardingState.deleteMany({ where: { organizationId: id } });

      await tx.invitation.deleteMany({ where: { organizationId: id } });
      await tx.membership.deleteMany({ where: { organizationId: id } });
      await tx.subscription.deleteMany({ where: { organizationId: id } });

      await tx.organization.delete({
        where: { id },
      });
    });

    return NextResponse.json({
      ok: true,
      deletedOrganization: organization.name,
    });
  } catch (error: any) {
    const message = error?.message || "Could not delete organization.";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    console.error("ADMIN_DELETE_ORGANIZATION_ERROR", error);

    return NextResponse.json(
      { error: "Could not delete organization." },
      { status: 500 },
    );
  }
}
