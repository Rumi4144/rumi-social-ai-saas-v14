import { redirect } from "next/navigation";
import { studioPageContext } from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
import WeeklyWorkspace from "@/components/weekly/WeeklyWorkspace";
import { prisma } from "@/lib/prisma";

export default async function Dashboard() {
  const { context, recovery } = await studioPageContext();
  if (!context) return <StudioRecovery recovery={recovery!} />;
  if (!context.isSuperAdmin) {
    const [onboarding, establishedBrand] = await Promise.all([
      prisma.onboardingState.findUnique({ where: { organizationId: context.organizationId } }),
      prisma.brand.findFirst({ where: { organizationId: context.organizationId, onboardingCompleted: true }, select: { id: true } }),
    ]);
    if (!onboarding?.completed && !establishedBrand) redirect("/onboarding");
  }
  return <WeeklyWorkspace isAdmin={context.isSuperAdmin} />;
}
