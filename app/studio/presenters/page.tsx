import {studioPageContext} from "@/lib/studio/page-context";
import StudioRecovery from "@/components/StudioRecovery";
import {prisma} from "@/lib/prisma";
import PresenterStudio from "./PresenterStudio";
import TestLab from "@/app/ai-test-lab/TestLab";
import {labCanRun} from "@/lib/ai-lab/catalog";
import styles from "./gallery.module.css";
export default async function PresenterPage({searchParams}:{searchParams:Promise<{campaignId?:string;contentItemId?:string;provider?:string}>}){
 const params=await searchParams;const {context:ctx,recovery}=await studioPageContext();if(recovery)return <StudioRecovery recovery={recovery}/>;
 const campaigns=await prisma.campaign.findMany({where:{brand:{organizationId:ctx.organizationId}},select:{id:true,title:true,items:{where:{type:{not:"story"}},select:{id:true,headline:true,caption:true}}},orderBy:{createdAt:"desc"},take:100});
 const query=new URLSearchParams();if(params.campaignId)query.set("campaignId",params.campaignId);if(params.contentItemId)query.set("contentItemId",params.contentItemId);
 // Customers use the credit-based studio; supplier pricing and direct billing stay private.
 if(!labCanRun(ctx.role,ctx.isSuperAdmin))return <PresenterStudio campaigns={campaigns} initialCampaignId={params.campaignId||""} initialContentItemId={params.contentItemId||""}/>;
 const premium=params.provider==="runway";
 const lowerUrl=`/studio/presenters?${query.toString()}`;query.set("provider","runway");const premiumUrl=`/studio/presenters?${query.toString()}`;
 return <><section className={styles.providers} aria-label="Presenter generation options"><h2>Choose how to create your presenter ad</h2><nav className={styles.options} aria-label="Video provider"><a href={lowerUrl} aria-current={!premium?"page":undefined}><strong>WaveSpeed · lower cost</strong><span>25 included presenter photos, product-holding photo preparation, AI voices and talking videos. Review a cost estimate before each generation.</span></a><a href={premiumUrl} aria-current={premium?"page":undefined}><strong>Runway · premium</strong><span>The original studio: presenter gallery, product catalog, accent and delivery options, and product demonstration videos. Uses premium Rumi credits.</span></a></nav><p>Opening either studio or browsing presenters does not start a paid generation.</p><p><a href="/ai-test-lab/options">Explore all AI options</a></p></section>{premium?<PresenterStudio campaigns={campaigns} initialCampaignId={params.campaignId||""} initialContentItemId={params.contentItemId||""}/>:labCanRun(ctx.role,ctx.isSuperAdmin)?<TestLab key={ctx.organizationId} workspaceName={ctx.organization.name} presenterMode campaigns={campaigns} initialCampaignId={params.campaignId} initialContentItemId={params.contentItemId}/>:<section className="card"><h1>Presenter ads</h1><p>Your workspace owner or administrator can approve provider charges for the lower-cost presenter workflow.</p></section>}</>;
}
