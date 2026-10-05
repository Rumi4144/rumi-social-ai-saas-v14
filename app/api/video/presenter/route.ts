import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { runwayConfigured, validImage, createPresenterPortrait, RunwayError } from "@/lib/video/runway";
import { presenterCost, presenterConcept, PRESENTER_LOOKS } from "@/lib/presenter/plan";
import { startPresenter, type PresenterPayload } from "@/lib/presenter/jobs";
import { failVideo, refreshVideo, videoSummary } from "@/lib/video/jobs";
export const maxDuration=60;
const S=z.object({requestId:z.string().uuid(),campaignId:z.string().min(1),contentItemId:z.string().min(1),productId:z.string().optional(),productImage:z.string().max(2_000_000).optional(),productName:z.string().trim().min(1).max(180),productDetails:z.string().max(1800).default(""),characterImage:z.string().max(2_000_000).optional(),look:z.enum(["woman","man","neutral"]).default("neutral"),script:z.string().trim().min(10).max(500),duration:z.union([z.literal(5),z.literal(10),z.literal(15)]).default(10),consent:z.literal(true)});
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{"Cache-Control":"no-store"}});
const summary=(job:Parameters<typeof videoSummary>[0])=>({...videoSummary(job),campaignId:(job.payload as unknown as PresenterPayload).campaignId,contentItemId:(job.payload as unknown as PresenterPayload).contentItemId});
const isPresenter=(payload:unknown)=>(payload as {mode?:string})?.mode==="presenter";
export async function POST(req:Request){try{
 const ctx=await tenantContext();if(ctx.role==="viewer")return reply({error:"Your workspace role cannot generate videos."},403);
 if(Number(req.headers.get("content-length"))>4_100_000)return reply({error:"Use reference photos under 1 MB each."},413);
 const parsed=S.safeParse(await req.json());if(!parsed.success)return reply({error:"Choose a campaign post and product photo, add a script and confirm the cost."},400);const p=parsed.data;
 const existing=await prisma.job.findFirst({where:{id:p.requestId,organizationId:ctx.organizationId,type:"RUNWAY_VIDEO"}});
 if(existing)return isPresenter(existing.payload)?reply({job:summary(existing)}):reply({error:"This request ID belongs to another video."},409);
 if(!runwayConfigured())return reply({error:"Connect Runway and private video storage before generating. No credits were charged."},503);
 const campaign=await prisma.campaign.findFirst({where:{id:p.campaignId,brand:{organizationId:ctx.organizationId}},select:{id:true,brandId:true}});
 const item=campaign&&await prisma.contentItem.findFirst({where:{id:p.contentItemId,campaignId:campaign.id}});
 if(!campaign||!item)return reply({error:"Campaign post not found in this workspace."},404);
 let productImage=p.productImage||"";
 if(p.productId){const product=await prisma.product.findFirst({where:{id:p.productId,brandId:campaign.brandId},select:{imageUrl:true}});if(!product)return reply({error:"Product not found in this campaign's brand."},404);if(!productImage)productImage=product.imageUrl||"";}
 if(!validImage(productImage)||(p.characterImage&&!validImage(p.characterImage)))return reply({error:"Choose a clear product photo and valid presenter photo. Use HTTPS, PNG, JPEG or WebP."},400);
 const cost=presenterCost(p.duration,!p.characterImage);
 const payload:PresenterPayload={mode:"presenter",stage:p.characterImage?"presenter":"portrait",prompt:presenterConcept(p.script),duration:p.duration,ratio:"720:1280",model:"product_ugc",cost,campaignId:campaign.id,contentItemId:item.id,productImage,productInfo:`${p.productName}\n${p.productDetails}`,...(p.characterImage?{characterImage:p.characterImage}:{})};
 const job=await prisma.$transaction(async tx=>{const created=await tx.job.create({data:{id:p.requestId,organizationId:ctx.organizationId,type:"RUNWAY_VIDEO",status:"starting",payload}});const spent=await tx.subscription.updateMany({where:{organizationId:ctx.organizationId,credits:{gte:cost}},data:{credits:{decrement:cost}}});if(!spent.count)throw new Error("INSUFFICIENT_CREDITS");const sub=await tx.subscription.findUniqueOrThrow({where:{organizationId:ctx.organizationId}});await tx.creditLedger.create({data:{organizationId:ctx.organizationId,delta:-cost,balanceAfter:sub.credits,reason:"presenter_video",referenceId:created.id}});return created;});
 if(p.characterImage)return reply({job:summary(await startPresenter(job,p.characterImage))},202);
 let taskId:string|undefined;
 try{const task=await createPresenterPortrait(PRESENTER_LOOKS[p.look]);taskId=task.id;console.log("PRESENTER_PORTRAIT_CREATED",JSON.stringify({jobId:job.id,taskId}));const running=await prisma.job.update({where:{id:job.id},data:{status:"running",progress:1,payload:{...payload,portraitTaskId:taskId}}});return reply({job:summary(running)},202);}catch(error){if(taskId)await prisma.job.update({where:{id:job.id},data:{status:"running",payload:{...payload,portraitTaskId:taskId},error:"Portrait confirmed; saving its details was delayed."}});else if(error instanceof RunwayError&&error.status<500)await failVideo(job,`${error.message} Your Rumi credits were returned.`);else await prisma.job.update({where:{id:job.id},data:{status:"uncertain",error:"Request not confirmed. Do not generate again; contact support with this request ID."}});return reply({job:summary(await prisma.job.findUniqueOrThrow({where:{id:job.id}}))});}
 }catch(error){if(error instanceof Error&&error.message==="INSUFFICIENT_CREDITS")return reply({error:"Not enough Rumi credits. Add credits in Billing."},402);if((error as {code?:string})?.code==="P2002")return reply({error:"This request is already starting. Check its status instead of generating again."},409);return apiError(error,"Could not start presenter generation.");}}
export async function GET(req:Request){try{const ctx=await tenantContext();const params=new URL(req.url).searchParams;const jobId=params.get("jobId");if(jobId){const job=await prisma.job.findFirst({where:{id:jobId,organizationId:ctx.organizationId,type:"RUNWAY_VIDEO"}});if(!job||!isPresenter(job.payload))return reply({error:"Presenter video not found."},404);return reply({job:summary(await refreshVideo(job))});}
 const campaignId=params.get("campaignId");const sub=await prisma.subscription.findUnique({where:{organizationId:ctx.organizationId},select:{credits:true}});const jobs=await prisma.job.findMany({where:{organizationId:ctx.organizationId,type:"RUNWAY_VIDEO",payload:{path:["mode"],equals:"presenter"}},orderBy:{createdAt:"desc"},take:12});
 if(!campaignId)return reply({configured:runwayConfigured(),credits:sub?.credits||0,jobs:jobs.map(summary)});
 const campaign=await prisma.campaign.findFirst({where:{id:campaignId,brand:{organizationId:ctx.organizationId}},select:{id:true,brandId:true,items:{where:{type:{not:"story"}},select:{id:true,headline:true,caption:true}}}});if(!campaign)return reply({error:"Campaign not found."},404);
 const products=await prisma.product.findMany({where:{brandId:campaign.brandId},select:{id:true,name:true,description:true,imageUrl:true},take:100});return reply({configured:runwayConfigured(),credits:sub?.credits||0,jobs:jobs.map(summary),products,posts:campaign.items});
 }catch(error){return apiError(error,"Could not load presenter studio.");}}
