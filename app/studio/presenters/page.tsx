import {studioPageContext} from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
import {prisma} from "@/lib/prisma";
import PresenterStudio from "./PresenterStudio";
import TestLab from "@/app/ai-test-lab/TestLab";
import {labCanRun} from "@/lib/ai-lab/catalog";
export default async function PresenterPage({searchParams}:{searchParams:Promise<{campaignId?:string;contentItemId?:string;provider?:string}>}){
 const params=await searchParams;const {context:ctx,recovery}=await studioPageContext();if(recovery)return <StudioRecovery recovery={recovery}/>;
 const campaigns=await prisma.campaign.findMany({where:{brand:{organizationId:ctx.organizationId}},select:{id:true,title:true,items:{where:{type:{not:"story"}},select:{id:true,headline:true,caption:true}}},orderBy:{createdAt:"desc"},take:100});
 const query=new URLSearchParams();if(params.campaignId)query.set("campaignId",params.campaignId);if(params.contentItemId)query.set("contentItemId",params.contentItemId);
 const premium=params.provider==="runway";if(!premium)query.set("provider","runway");
 return <><p><a href={`/studio/presenters?${query.toString()}`}>{premium?"Use lower-cost WaveSpeed presenter ads":"Optional: Runway product demonstration · premium pricing"}</a></p>{premium?<PresenterStudio campaigns={campaigns} initialCampaignId={params.campaignId||""} initialContentItemId={params.contentItemId||""}/>:labCanRun(ctx.role)?<TestLab key={ctx.organizationId} workspaceName={ctx.organization.name} presenterMode campaigns={campaigns} initialCampaignId={params.campaignId} initialContentItemId={params.contentItemId}/>:<section className="card"><h1>Presenter ads</h1><p>Your workspace owner or administrator can approve provider charges for the lower-cost presenter workflow.</p></section>}</>;
}
