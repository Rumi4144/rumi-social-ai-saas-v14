import type { Job } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { labQuote, labSubmit, LabProviderError, type LabMedia } from "@/lib/ai-lab/providers";
import { LabPriceLimitError } from "@/lib/ai-lab/catalog";
import { labRefresh, type LabPayload } from "@/lib/ai-lab/jobs";
import { DEFAULT_PRESENTER_DIRECTION } from "@/lib/presenter/speech-text";
import { presenterChoices } from "./catalog";
import type { ExtraManifest } from "./types";
import { WeeklyError } from "@/lib/weekly/service";

// Every paid stage is claimed durably before submission. A timeout never creates
// a fresh task: retain the claim for Admin reconciliation instead of repurchasing.
async function stage(parent: Job, name: "speech" | "video", input: LabPayload, media?: LabMedia) {
  const id=`${parent.id}-${name}`;
  let job=await prisma.job.findFirst({where:{id,organizationId:parent.organizationId,type:"EXTRA_PRESENTER_STAGE"}});
  if(!job){
    // Quotes are read-only. Reject over-budget work before any paid submission.
    const price=await labQuote(input,media);
    if(price>(name==="speech"?0.1:1))throw new WeeklyError("This script exceeds the presenter allowance. No further generation was started.",409);
    await prisma.job.upsert({where:{id},update:{},create:{id,organizationId:parent.organizationId,type:"EXTRA_PRESENTER_STAGE",status:"queued",payload:{...input,estimateUsd:price,parentId:parent.id} as any}});
    job=await prisma.job.findUniqueOrThrow({where:{id}});
  }
  if(job.status==="queued"){
    const claimed=await prisma.job.updateMany({where:{id,organizationId:parent.organizationId,status:"queued"},data:{status:"starting"}});
    if(!claimed.count)return prisma.job.findUniqueOrThrow({where:{id}});
    try{
      const task=await labSubmit(job.payload as unknown as LabPayload,media);
      // Separate the provider response from persistence. If saving fails, the
      // original starting claim remains and is never submitted a second time.
      try { job=await prisma.job.update({where:{id},data:{status:"running",progress:10,payload:{...(job.payload as object),...task} as any}}); }
      catch { return prisma.job.findUniqueOrThrow({where:{id}}); }
    }catch(error){
      const definitive=error instanceof LabProviderError && error.definitive;
      job=await prisma.job.update({where:{id},data:{status:definitive?"failed":"unknown",error:definitive?"The presenter service could not accept this request.":"The service has not confirmed this request. Admin must check it before another attempt."}});
    }
  }
  return labRefresh(job);
}
async function refund(parent:Job,message:string){
  await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Subscription" WHERE "organizationId" = ${parent.organizationId} FOR UPDATE`;
    const claimed=await tx.job.updateMany({where:{id:parent.id,organizationId:parent.organizationId,type:"EXTRA_CREATION",status:{in:["queued","running","attention","processing"]}},data:{status:"failed",error:`${message} Your presenter credits were returned.`}});
    if(!claimed.count)return;
    const paid=await tx.creditLedger.findFirst({where:{organizationId:parent.organizationId,referenceId:parent.id,reason:"extra_presenter",delta:{lt:0}}});
    if(!paid)throw new Error("Presenter payment record not found");
    const sub=await tx.subscription.update({where:{organizationId:parent.organizationId},data:{credits:{increment:-paid.delta}}});
    await tx.creditLedger.create({data:{organizationId:parent.organizationId,delta:-paid.delta,balanceAfter:sub.credits,reason:"extra_presenter_refund",referenceId:parent.id}});
  });
}
export async function advancePresenter(organizationId:string,id:string){
  const parent=await prisma.job.findFirst({where:{id,organizationId,type:"EXTRA_CREATION"}});
  if(!parent)throw new WeeklyError("Creation not found in this workspace.",404);
  const p=parent.payload as unknown as ExtraManifest;
  if(p.extraKind!=="presenter" || ["failed","succeeded"].includes(parent.status))return;
  const mapping=(parent.result as {items?:Array<{contentItemId:string}>}|null)?.items?.[0];
  const item=mapping && await prisma.contentItem.findFirst({where:{id:mapping.contentItemId,campaignId:p.campaignId,campaign:{brand:{organizationId}}}});
  if(!item)throw new WeeklyError("The presenter’s draft could not be found.",409);
  await prisma.job.updateMany({where:{id,organizationId,status:"processing",updatedAt:{lt:new Date(Date.now()-180000)}},data:{status:"running"}});
  const lease=await prisma.job.updateMany({where:{id,organizationId,status:{in:["queued","running","attention"]}},data:{status:"processing"}});
  if(!lease.count)return;
  const choice=presenterChoices[p.presenter || "alex"];
  let current:Job;
  try{
    current=await stage(parent,"speech",{model:"speech",prompt:p.brief,voiceId:choice.voice,voiceSpeed:1,voiceEmotion:"neutral",estimateUsd:0.1});
    if(current.status==="succeeded"){
      const audio=await prisma.mediaAsset.findFirst({where:{id:current.id,organizationId,kind:"ai_lab_input",status:"ready"}});
      if(!audio?.url)throw new Error("Saved speech missing");
      // The host is controlled by deployment configuration, never a customer URL.
      const base=new URL(process.env.NEXT_PUBLIC_APP_URL || "https://rumisocialai.com");
      if(base.protocol!=="https:" || base.username || base.password)throw new Error("Presenter image host unavailable");
      current=await stage(parent,"video",{model:"infinitetalk",prompt:DEFAULT_PRESENTER_DIRECTION,campaignId:p.campaignId,contentItemId:item.id,estimateUsd:1},{image:new URL(choice.image,base).href,audio:audio.url});
    }
  }catch(error){
    if(error instanceof WeeklyError || error instanceof LabPriceLimitError){await refund(parent,"This script exceeds the presenter allowance.");return;}
    // Quotes, polling and saving may fail without a new paid request. Resume
    // this parent later; no child is reset or removed.
    await prisma.job.updateMany({where:{id,organizationId,status:{in:["queued","running","attention","processing"]}},data:{status:"attention",error:"Preparation is delayed. Resume this saved creation to check it again without paying twice."}});
    return;
  }
  if(current.status==="failed"){await refund(parent,"The presenter could not be completed.");return;}
  if(current.status==="unknown" || current.status==="starting" && Date.now()-current.updatedAt.getTime()>180000){
    await prisma.job.updateMany({where:{id,organizationId,status:{in:["queued","running","attention","processing"]}},data:{status:"attention",error:"The service has not confirmed this request. Your saved request and credits are reserved for Admin to check; no duplicate video will be ordered."}});return;
  }
  if(current.id===`${id}-video` && current.status==="succeeded"){
    await prisma.$transaction(async tx=>{
      const asset=await tx.mediaAsset.findFirst({where:{id:current.id,organizationId,campaignId:p.campaignId,contentItemId:item.id,kind:"campaign_video",status:"ready"}});
      if(!asset?.url || (asset.metadata as {contentType?:string}|null)?.contentType!=="video/mp4")throw new Error("Presenter output is not ready");
      const claimed=await tx.job.updateMany({where:{id,organizationId,status:{in:["queued","running","attention","processing"]}},data:{status:"succeeded",progress:100,error:null}});
      if(!claimed.count)return;
      const changed=await tx.contentItem.updateMany({where:{id:item.id,campaignId:p.campaignId,status:"draft",mediaUrl:null},data:{mediaUrl:`/api/video/media/${asset.id}`}});
      if(!changed.count)throw new Error("Presenter draft changed before completion");
    });
  }else await prisma.job.updateMany({where:{id,organizationId,status:{in:["queued","running","attention","processing"]}},data:{status:"running",progress:current.id.endsWith("-video")?60:20,error:null}});
}
