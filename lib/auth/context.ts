import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { cookies } from "next/headers";

export async function currentUserId() {
  const session = await auth();
  const id = (session?.user as any)?.id;

  if (!id) {
    throw new Error("UNAUTHENTICATED");
  }

  return String(id);
}

export async function tenantContext(requestedOrg?: string) {
  const userId = await currentUserId();

  if (!requestedOrg) {
    const cookieStore = await cookies();
    requestedOrg = cookieStore.get("adminWorkspace")?.value;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      isSuperAdmin: true,
    },
  });

  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }

  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: {
      organization: true,
    },
  });

  // SUPER ADMIN:
  // May explicitly enter any organization.
  if (user.isSuperAdmin && requestedOrg) {
    const organization = await prisma.organization.findUnique({
      where: { id: requestedOrg },
    });

    if (!organization) {
      throw new Error("NO_WORKSPACE");
    }

    return {
      userId,
      organizationId: organization.id,
      role: "superadmin",
      organization,
      memberships,
      isSuperAdmin: true,
    };
  }

  // Normal tenant behavior remains membership-based.
  if (!memberships.length) {
    throw new Error("NO_WORKSPACE");
  }

  const membership = requestedOrg
    ? memberships.find((item) => item.organizationId === requestedOrg)
    : memberships[0];

  if (!membership) {
    throw new Error("FORBIDDEN");
  }

  if (!user.isSuperAdmin && membership.organization.status === "suspended") {
    throw new Error("WORKSPACE_SUSPENDED");
  }

  return {
    userId,
    organizationId: membership.organizationId,
    role: membership.role,
    organization: membership.organization,
    memberships,
    isSuperAdmin: user.isSuperAdmin,
  };
}
