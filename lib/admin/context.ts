import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function superAdminContext() {
  const session = await auth();
  const userId = (session?.user as any)?.id;

  if (!userId) {
    throw new Error("UNAUTHENTICATED");
  }

  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: {
      id: true,
      email: true,
      name: true,
      isSuperAdmin: true,
    },
  });

  if (!user) {
    throw new Error("UNAUTHENTICATED");
  }

  if (!user.isSuperAdmin) {
    throw new Error("FORBIDDEN");
  }

  return user;
}
