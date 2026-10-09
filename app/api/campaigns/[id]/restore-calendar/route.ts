import {NextResponse} from "next/server";
import {tenantContext} from "@/lib/auth/context";
import {prisma} from "@/lib/prisma";
export async function POST(_req:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const ctx=await tenantContext(),{id}=await params;
  const result=await prisma.$transaction(async tx=>{
   const campaign=await tx.campaign.findFirst({where:{id,brand:{organizationId:ctx.organizationId}},include:{items:true}});
   if(!campaign)throw new Error("Campaign not found.");
   const jobs=await tx.job.findMany({where:{organizationId:ctx.organizationId,payload:{path:["campaignId"],equals:id}}});
   if(jobs.some(j=>["running","queued","starting","saving","uncertain"].includes(j.status)))throw new Error("Wait for this campaign's active jobs to finish before restoring dates.");
   const generators=jobs.filter(j=>j.type==="CREATE_EVERYTHING"&&j.status==="succeeded");
   if(generators.length!==1)throw new Error("A unique original campaign calendar could not be established.");
   const payload=generators[0].payload as any,pack=generators[0].result as any;
   if(!Array.isArray(payload?.dailyPlan)||!payload.dailyPlan.length||!Array.isArray(pack?.posts))throw new Error("This campaign has no saved planned calendar.");
   const dates=new Map<number,Date>(),seen=new Set<string>();
   for(const day of payload.dailyPlan){
    if(!Number.isInteger(day.day)||day.day<1||day.day>payload.days||dates.has(day.day)||typeof day.date!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(day.date))throw new Error("Saved calendar is invalid.");
    const date=new Date(day.date+"T12:00:00Z");
    if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==day.date||seen.has(day.date))throw new Error("Saved calendar is invalid.");
    dates.set(day.day,date);seen.add(day.date);
   }
   if(dates.size!==payload.days)throw new Error("Saved calendar is incomplete.");
   const platform=(post:any)=>{const day=payload.dailyPlan.find((d:any)=>d.day===post.day);return (day?.platforms?.length?day.platforms:Array.isArray(post.platforms)?post.platforms:[]).join(",");};
   const matches=(item:any,post:any)=>item.type===post.type&&item.headline===post.headline&&item.caption===post.caption&&item.platform===platform(post);
   const publishJobs=await tx.publishJob.findMany({where:{organizationId:ctx.organizationId,contentItemId:{in:campaign.items.map(item=>item.id)}},select:{contentItemId:true}});
   const publishingIds=new Set(publishJobs.map(job=>job.contentItemId));
   let restored=0,skipped=0;
   for(const item of campaign.items){
    if(item.status!=="draft"||item.scheduledFor||publishingIds.has(item.id)){skipped++;continue;}
    const candidates=pack.posts.filter((p:any)=>matches(item,p));
    if(candidates.length!==1||campaign.items.filter(other=>matches(other,candidates[0])).length!==1||!dates.has(candidates[0].day)){skipped++;continue;}
    const updated=await tx.contentItem.updateMany({where:{id:item.id,campaignId:id,status:"draft",scheduledFor:null,headline:item.headline,caption:item.caption,type:item.type,platform:item.platform},data:{scheduledFor:dates.get(candidates[0].day)}});
    restored+=updated.count;
   }
   return {restored,skipped};
  },{isolationLevel:"Serializable"});
  return NextResponse.json({...result,message:"Only draft calendar dates were restored. No posts were scheduled or published."});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not restore calendar."},{status:400});}
}
