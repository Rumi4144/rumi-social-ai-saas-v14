import { studioPageContext } from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
import { labCanRun } from "@/lib/ai-lab/catalog";
import TestLab from "./TestLab";
export default async function AITestLabPage({searchParams}:{searchParams:Promise<{model?:string}>}) {
  const { context, recovery } = await studioPageContext();
  if (recovery) return <StudioRecovery recovery={recovery} />;
  if (!labCanRun(context.role, context.isSuperAdmin)) return <section className="card"><h1>AI Test Lab</h1><p>This page is available only to the Rumi platform administrator. Use Creative Studio for credit-based creation.</p></section>;
  const requested=(await searchParams).model;
  const initialModel=requested === "kling" || requested === "infinitetalk" || requested === "flux" ? requested : undefined;
  return <TestLab initialModel={initialModel} key={context.organizationId} workspaceName={context.organization.name} />;
}
