import { studioPageContext } from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
import ExtraWorkspace from "@/components/extras/ExtraWorkspace";
export default async function ExtrasPage(){
  const {context,recovery}=await studioPageContext();
  if(!context)return <StudioRecovery recovery={recovery!}/>;
  return <ExtraWorkspace/>;
}
