import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { weekDates } from "@/lib/reels/week";
const S=z.object({requestId:z.string().uuid(),campaignId:z.string().min(1),startDate:z.string(),days:z.array(z.object({headline:z.string().min(1).max(120),caption:z.string().max(2000)})).length(7)});
export async function POST(req:Request){
 try{
  const ctx=await tenantContext();if(ctx.role==="viewer")throw new Error("FORBIDDEN");
  const parsed=S.safeParse(await req.json());if(!parsed.success)return NextResponse.json({error:"Choose a start date and seven complete daily drafts."},{status:400});
  const p=parsed.data;let dates;try{dates=weekDates(p.startDate);}catch{return NextResponse.json({error:"Choose a valid start date."},{status:400});}
  const campaign=await prisma.campaign.findFirst({where:{id:p.campaignId,brand:{organizationId:ctx.organizationId}}});
  if(!campaign)return NextResponse.json({error:"Campaign not found."},{status:404});
  const result=await prisma.$transaction(async tx=>{
   const previous=await tx.job.findFirst({where:{id:p.requestId,organizationId:ctx.organizationId,type:"REEL_WEEK"}});
   if(previous){const payload=previous.payload as {campaignId:string};if(payload.campaignId!==p.campaignId)throw new Error("FORBIDDEN");return previous.result;}
   await tx.job.create({data:{id:p.requestId,organizationId:ctx.organizationId,type:"REEL_WEEK",status:"starting",payload:{campaignId:p.campaignId,startDate:p.startDate}}});
   const days=[];
   for(let i=0;i<7;i++){const item=await tx.contentItem.create({data:{campaignId:campaign.id,type:"post",platform:"facebook",status:"draft",headline:p.days[i].headline,caption:p.days[i].caption}});days.push({...dates[i],contentItemId:item.id});}
   const result={days};await tx.job.update({where:{id:p.requestId},data:{status:"succeeded",progress:100,result}});return result;
  });
  return NextResponse.json(result);
 }catch(error){if((error as {code?:string}).code==="P2002")return NextResponse.json({error:"This week is already being created. Retry the same request."},{status:409});return apiError(error,"Could not create the seven drafts. Try again.");}
}
