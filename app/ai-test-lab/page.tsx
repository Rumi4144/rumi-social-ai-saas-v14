import { studioPageContext } from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
import { labCanRun } from "@/lib/ai-lab/catalog";
import TestLab from "./TestLab";
import {prisma} from "@/lib/prisma";
export default async function AITestLabPage({searchParams}:{searchParams:Promise<{model?:string;veoMode?:string}>}) {
  const { context, recovery } = await studioPageContext();
  if (recovery) return <StudioRecovery recovery={recovery} />;
  if (!labCanRun(context.role, context.isSuperAdmin)) return <section className="card"><h1>AI Test Lab</h1><p>This page is available only to the Rumi platform administrator. Use Creative Studio for credit-based creation.</p></section>;
  const params=await searchParams, requested=params.model;
  const initialModel=requested === "veo" || requested === "kling" || requested === "infinitetalk" || requested === "flux" || requested === "flare-medium" || requested === "flare-high" ? requested : undefined;
  const campaigns=await prisma.campaign.findMany({where:{brand:{organizationId:context.organizationId}},select:{id:true,title:true,items:{where:{type:{not:"story"}},select:{id:true,headline:true,caption:true}}},orderBy:{createdAt:"desc"},take:100});
  return <TestLab campaigns={campaigns} initialModel={initialModel} initialVeoMode={params.veoMode === "scene" ? "scene" : "presenter"} key={context.organizationId} workspaceName={context.organization.name} />;
}
