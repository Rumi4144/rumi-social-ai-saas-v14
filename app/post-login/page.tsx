import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function PostLogin() {
  const session = await auth();
  const userId = (session?.user as any)?.id;

  if (!userId) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: String(userId) },
    select: {
      isSuperAdmin: true,
      memberships: {
        select: {
          organizationId: true,
        },
        take: 1,
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  if (user.isSuperAdmin) {
    redirect("/api/admin/reset-workspace");
  }

  if (!user.memberships.length) {
    redirect("/onboarding");
  }

  redirect("/dashboard");
}
