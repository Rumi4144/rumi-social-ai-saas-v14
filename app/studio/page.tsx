import { studioPageContext } from "@/lib/studio/page-context";
import { studioBrand } from "@/lib/studio/creative-context";
import StudioRecovery from "@/components/StudioRecovery";
import CreativeStudio from "./CreativeStudio";

export default async function Studio() {
  const { context, recovery } = await studioPageContext();
  if (recovery) return <StudioRecovery recovery={recovery} />;
  const brand = await studioBrand(context.organizationId, context.organization.name);
  return <CreativeStudio key={context.organizationId} brand={brand} />;
}
