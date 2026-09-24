import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { superAdminContext } from "@/lib/admin/context";
import { z } from "zod";

const RoleSchema = z.object({
  role: z.enum(["owner", "admin", "member"]),
});

async function getMembership(organizationId: string, membershipId: string) {
  return prisma.membership.findFirst({
    where: {
      id: membershipId,
      organizationId,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          isSuperAdmin: true,
        },
      },
    },
  });
}

async function ownerCount(organizationId: string) {
  return prisma.membership.count({
    where: {
      organizationId,
      role: "owner",
    },
  });
}

export async function PATCH(
  req: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      membershipId: string;
    }>;
  },
) {
  try {
    await superAdminContext();

    const { id: organizationId, membershipId } = await params;
    const parsed = RoleSchema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const membership = await getMembership(organizationId, membershipId);

    if (!membership) {
      return NextResponse.json(
        { error: "Membership not found." },
        { status: 404 },
      );
    }

    if (membership.role === "owner" && parsed.data.role !== "owner") {
      const owners = await ownerCount(organizationId);

      if (owners <= 1) {
        return NextResponse.json(
          { error: "The last owner cannot be demoted." },
          { status: 409 },
        );
      }
    }

    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data: {
        role: parsed.data.role,
      },
    });

    return NextResponse.json({
      ok: true,
      membership: updated,
    });
  } catch (error: any) {
    const message = error?.message || "Could not update membership.";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    console.error("ADMIN_MEMBER_UPDATE_ERROR", error);

    return NextResponse.json(
      { error: "Could not update membership." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      membershipId: string;
    }>;
  },
) {
  try {
    await superAdminContext();

    const { id: organizationId, membershipId } = await params;

    const membership = await getMembership(organizationId, membershipId);

    if (!membership) {
      return NextResponse.json(
        { error: "Membership not found." },
        { status: 404 },
      );
    }

    if (membership.user.isSuperAdmin) {
      return NextResponse.json(
        { error: "Super Admin access cannot be removed here." },
        { status: 409 },
      );
    }

    if (membership.role === "owner") {
      const owners = await ownerCount(organizationId);

      if (owners <= 1) {
        return NextResponse.json(
          { error: "The last owner cannot be removed." },
          { status: 409 },
        );
      }
    }

    await prisma.membership.delete({
      where: { id: membership.id },
    });

    return NextResponse.json({
      ok: true,
    });
  } catch (error: any) {
    const message = error?.message || "Could not remove membership.";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    console.error("ADMIN_MEMBER_DELETE_ERROR", error);

    return NextResponse.json(
      { error: "Could not remove membership." },
      { status: 500 },
    );
  }
}
