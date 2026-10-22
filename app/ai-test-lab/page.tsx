import { studioPageContext } from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
import { labCanRun } from "@/lib/ai-lab/catalog";
import TestLab from "./TestLab";
export default async function AITestLabPage() {
  const { context, recovery } = await studioPageContext();
  if (recovery) return <StudioRecovery recovery={recovery} />;
  if (!labCanRun(context.role)) return <section className="card"><h1>AI Test Lab</h1><p>Ask your workspace owner or administrator to run provider tests.</p></section>;
  return <TestLab key={context.organizationId} workspaceName={context.organization.name} />;
}
