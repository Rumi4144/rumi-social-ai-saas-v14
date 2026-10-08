import {NextResponse} from "next/server";
import {prisma} from "@/lib/prisma";
import {hashShareToken} from "@/lib/agency/share";
import {portalBlockers} from "@/lib/agency/portal-review";
import {z} from "zod";
const S=z.object({token:z.string().min(20),decision:z.enum(["approved","changes_requested"]),comment:z.string().max(2000).optional(),reviewerName:z.string().max(100).optional()});
export async function POST(req:Request){
 let body;try{body=await req.json();}catch{return NextResponse.json({error:"Invalid approval request"},{status:400});}
 const p=S.safeParse(body);if(!p.success)return NextResponse.json({error:p.error.flatten()},{status:400});
 const share=await prisma.approvalShare.findUnique({where:{tokenHash:hashShareToken(p.data.token)}});
 if(!share||share.expiresAt<new Date())return NextResponse.json({error:"Approval link is invalid or expired"},{status:410});
 if(share.status!=="pending")return NextResponse.json({error:"This approval has already been completed"},{status:409});
 const outcome=await prisma.$transaction(async tx=>{
  const campaign=await tx.campaign.findFirst({where:{id:share.campaignId,brand:{organizationId:share.organizationId}},include:{items:true}});
  if(!campaign)return {status:404,error:"Campaign not found"};
  if(p.data.decision==='approved'&&(!campaign.items.length||portalBlockers(campaign.items).length))return {status:409,error:"Every draft and its media must be available for review before campaign approval. Ask the owner to finish media review in the workspace."};
  const claim=await tx.approvalShare.updateMany({where:{id:share.id,status:'pending',expiresAt:{gt:new Date()}},data:{status:p.data.decision}});
  if(claim.count!==1)return {status:409,error:"This approval has already been completed or expired"};
  await tx.approvalDecision.create({data:{approvalShareId:share.id,decision:p.data.decision,comment:share.allowComments?p.data.comment:undefined,reviewerName:p.data.reviewerName}});
  await tx.campaign.update({where:{id:campaign.id},data:{status:p.data.decision==='approved'?'approved':'changes_requested'}});
  return {status:200};
 });
 if(outcome.error)return NextResponse.json({error:outcome.error},{status:outcome.status});
 return NextResponse.json({status:p.data.decision});
}
