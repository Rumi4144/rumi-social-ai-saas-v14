import {prisma} from "@/lib/prisma";
import {hashShareToken} from "@/lib/agency/share";
import {notFound} from "next/navigation";
import CampaignApprovalReview from "@/components/CampaignApprovalReview";
export default async function Portal({params}:{params:Promise<{token:string}>}){
 const {token}=await params;
 const share=await prisma.approvalShare.findUnique({where:{tokenHash:hashShareToken(token)}});
 if(!share||share.expiresAt<new Date())notFound();
 const campaign=await prisma.campaign.findFirst({where:{id:share.campaignId,brand:{organizationId:share.organizationId}},include:{items:{orderBy:{createdAt:'asc'}},brand:true}});
 if(!campaign)notFound();
 return <main className="portal"><div className="portalbrand">CAMPAIGN APPROVAL</div><h1>{campaign.title}</h1><p>Prepared for <b>{campaign.brand.name}</b></p><CampaignApprovalReview token={token} items={campaign.items.map(({id,headline,caption,platform,type,mediaUrl})=>({id,headline,caption,platform,type,mediaUrl}))} allowComments={share.allowComments} status={share.status}/></main>;
}
