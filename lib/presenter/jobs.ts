import type { Job } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createPresenterVideo, getVideoTask, validRunwayOutput, RunwayError } from "@/lib/video/runway";
import { failVideo, type VideoPayload } from "@/lib/video/jobs";
export type PresenterPayload=VideoPayload & {mode:"presenter";stage:"portrait"|"presenter";productImage:string;productInfo:string;portraitTaskId?:string;characterImage?:string};
export async function startPresenter(job:Job, characterImage:string){
 const p=job.payload as unknown as PresenterPayload;let taskId:string|undefined;
 try{
  const task=await createPresenterVideo({characterImage,productImage:p.productImage,productInfo:p.productInfo,concept:p.prompt,duration:p.duration});taskId=task.id;console.log("PRESENTER_TASK_CREATED",JSON.stringify({jobId:job.id,taskId}));
  return await prisma.job.update({where:{id:job.id},data:{status:"running",progress:25,error:null,payload:{...p,stage:"presenter",characterImage,taskId}}});
 }catch(error){
  if(taskId) return prisma.job.update({where:{id:job.id},data:{status:"running",payload:{...p,stage:"presenter",characterImage,taskId},error:"Task confirmed; saving its details was delayed."}});
  if(error instanceof RunwayError&&error.status<500)await failVideo(job,`${error.message} Your Rumi credits were returned.`);
  else await prisma.job.update({where:{id:job.id},data:{status:"uncertain",error:"Presenter request not confirmed. Do not generate again; contact support with this request ID."}});
  return prisma.job.findUniqueOrThrow({where:{id:job.id}});
 }
}
export async function refreshPortrait(job:Job){
 const p=job.payload as unknown as PresenterPayload;
 if(!p.portraitTaskId||job.status!=="running")return job;
 const lease=await prisma.job.updateMany({where:{id:job.id,organizationId:job.organizationId,status:"running",updatedAt:{lt:new Date(Date.now()-15000)}},data:{updatedAt:new Date()}});if(!lease.count)return job;
 try{
  const task=await getVideoTask(p.portraitTaskId);
  if(["FAILED","CANCELED"].includes(task.status))await failVideo(job,"Presenter portrait failed. Your Rumi credits were returned.");
  else if(task.status==="SUCCEEDED"){
   const image=task.output?.[0]||"";if(!validRunwayOutput(image))throw new Error("Invalid portrait output.");
   // A durable claim is made before the second paid request. An interrupted request is never submitted twice.
   const claim=await prisma.job.updateMany({where:{id:job.id,organizationId:job.organizationId,status:"running",payload:{path:["stage"],equals:"portrait"}},data:{status:"starting",progress:20}});
   if(claim.count)return startPresenter(job,image);
  }
 }catch{await prisma.job.updateMany({where:{id:job.id,status:"running"},data:{error:"Portrait status delayed. Checking again reuses the same task."}});}
 return prisma.job.findUniqueOrThrow({where:{id:job.id}});
}
