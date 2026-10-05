import {tenantContext} from "@/lib/auth/context";
import {prisma} from "@/lib/prisma";
import PresenterStudio from "./PresenterStudio";
export default async function PresenterPage({searchParams}:{searchParams:Promise<{campaignId?:string;contentItemId?:string}>}){const params=await searchParams;const ctx=await tenantContext();const campaigns=await prisma.campaign.findMany({where:{brand:{organizationId:ctx.organizationId}},select:{id:true,title:true},orderBy:{createdAt:"desc"},take:100});return <PresenterStudio campaigns={campaigns} initialCampaignId={params.campaignId||""} initialContentItemId={params.contentItemId||""}/>;}
