import { accessRecordId, readAccess, creationPackageSpec } from "@/lib/billing/admin-access";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { brandSources, savedPackCards, WeeklyError } from "@/lib/weekly/service";
import { manifestOf, photoGroups } from "@/lib/weekly/plan";
import { newYorkToday } from "@/lib/campaign/content-plan";
import { nextWeeklyLayout } from "@/lib/weekly/layout-rotation";
import { extraOptions } from "./catalog";
import type { ExtraManifest, ExtraRequest, ExtrasResponse, ExtraSummary } from "./types";
import { labConfigured } from "@/lib/ai-lab/catalog";
import type { WeeklySlot } from "@/lib/weekly/types";

type Context = { organizationId: string; role: string; userId: string };
export function extraId(org: string, requestId: string) { return `extra-${createHash("sha256").update(JSON.stringify([org, requestId])).digest("hex").slice(0,40)}`; }
export function extraFingerprint(input: ExtraRequest) { return createHash("sha256").update(JSON.stringify([input.brandId,input.kind,input.brief.trim(),input.productId || "",input.kind === "presenter" ? input.presenter || "alex" : ""])).digest("hex"); }
export function extrasConfigured() {
  const images = Boolean(process.env.OPENAI_API_KEY && process.env.BLOB_READ_WRITE_TOKEN && process.env.WORKER_SECRET);
  return {ad: images, reel: images, presenter: labConfigured("infinitetalk")};
}
export async function extraSummary(ctx: Context, id: string): Promise<ExtraSummary> {
  const record = await prisma.job.findFirst({where:{id, organizationId:ctx.organizationId,type:"EXTRA_CREATION"}});
  if (!record) throw new WeeklyError("Creation not found in this workspace.",404);
  const p = record.payload as unknown as ExtraManifest;
  const {output, preparationJobs} = await savedPackCards(ctx,record,{id:p.brandId},p.weekStart);
  const pending = preparationJobs.filter(j=>["queued","running"].includes(j.status));
  const failure = preparationJobs.some(j=>j.status === "failed" || (j.result as {needsReview?:boolean}|null)?.needsReview);
  const item = output[0] || null;
  return {id:record.id,kind:p.extraKind,title:p.extraKind === "presenter" ? "Talking presenter" : p.brief,createdAt:record.createdAt.toISOString(),status:item?.isReady ? "ready" : record.status,error:record.error || (failure ? "This creation needs Admin attention. Its saved work is preserved." : null),nextJobId:pending.find(j=>j.status === "queued")?.id || null,pendingJobs:pending.length,item};
}
export async function extrasView(ctx: Context): Promise<ExtrasResponse> {
  const [brands,sub,records] = await Promise.all([
    prisma.brand.findMany({where:{organizationId:ctx.organizationId},include:{products:true},orderBy:{createdAt:"asc"}}),
    prisma.subscription.findUnique({where:{organizationId:ctx.organizationId}}),
    prisma.job.findMany({where:{organizationId:ctx.organizationId,type:"EXTRA_CREATION"},orderBy:{createdAt:"desc"},take:30,select:{id:true}}),
  ]);
  const access=readAccess((await prisma.job.findFirst({where:{id:accessRecordId(ctx.organizationId),organizationId:ctx.organizationId,type:"ADMIN_CREATION_ACCESS"}}))?.payload);
  const spec=creationPackageSpec(sub,access);
  const reason=ctx.role === "viewer" ? "Your access is read-only." : !spec.canGenerate ? spec.blockReason : !brands.length ? "Finish setting up your business first." : null;
  return {organizationId:ctx.organizationId,canManage:ctx.role!=="viewer",availableCredits:sub?.credits || 0,canCreate:!reason,reason,configured:extrasConfigured(),brands:await Promise.all(brands.map(async b=>{const groups=photoGroups(await brandSources(ctx.organizationId,b));return{id:b.id,name:b.name,products:b.products.map(p=>({id:p.id,name:p.name,reelAvailable:!!p.imageUrl&&!!p.sourceUrl&&groups.some(g=>g[0].sourceUrl===p.sourceUrl && g.length>=3)}))};})),extras:await Promise.all(records.map(r=>extraSummary(ctx,r.id)))};
}
export async function prepareExtra(ctx: Context,input: ExtraRequest) {
  if(ctx.role==="viewer")throw new WeeklyError("Your access is read-only.",403);
  const id=extraId(ctx.organizationId,input.requestId), fingerprint=extraFingerprint(input), option=extraOptions[input.kind];
  const previous=await prisma.job.findFirst({where:{id,organizationId:ctx.organizationId,type:"EXTRA_CREATION"}});
  if(previous){if((previous.payload as unknown as ExtraManifest).fingerprint!==fingerprint)throw new WeeklyError("This request already belongs to another creation. Start a new creation instead.",409);return{id,reused:true};}
  if(input.expectedCredits!==option.credits)throw new WeeklyError("The cost changed. Review the current credit total.",409);
  if(!extrasConfigured()[input.kind])throw new WeeklyError("This option is not available yet. No credits were charged.",503);
  const brand=await prisma.brand.findFirst({where:{id:input.brandId,organizationId:ctx.organizationId},include:{products:true}});
  if(!brand)throw new WeeklyError("Business not found in this workspace.",404);
  const product=input.productId ? brand.products.find(p=>p.id===input.productId && (input.kind==="ad" || (p.imageUrl && p.sourceUrl))) : undefined;
  if(input.productId && !product)throw new WeeklyError(input.kind==="ad"?"Choose a saved product from this business.":"Choose a saved product with photos from this business.",400);
  const photos=product && input.kind!=="ad" ? (await brandSources(ctx.organizationId,brand)).filter(p=>p.sourceUrl===product.sourceUrl && p.productName===product.name) : [];
  if(input.kind==="reel" && product && !photoGroups(photos).some(g=>g.length>=3))throw new WeeklyError("This product needs three saved photos for a reel. Choose a business scene or ask Admin to import its gallery.",409);
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Subscription" WHERE "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    const existing=await tx.job.findFirst({where:{id,organizationId:ctx.organizationId,type:"EXTRA_CREATION"}});
    if(existing){if((existing.payload as unknown as ExtraManifest).fingerprint!==fingerprint)throw new WeeklyError("This request already belongs to another creation.",409);return{id,reused:true};}
    const sub=await tx.subscription.findUnique({where:{organizationId:ctx.organizationId}});
    const access=readAccess((await tx.job.findFirst({where:{id:accessRecordId(ctx.organizationId),organizationId:ctx.organizationId,type:"ADMIN_CREATION_ACCESS"}}))?.payload);
    const spec=creationPackageSpec(sub,access);
    if(!spec.canGenerate)throw new WeeklyError(spec.blockReason || "An active plan or trial is needed to create extras.",402);
    // Require the complete advertised cost, including the later reel export.
    if(!sub || sub.credits<option.credits)throw new WeeklyError(`You need ${option.credits} available Rumi credits for this creation.`,402);
    const history=await tx.job.findMany({where:{organizationId:ctx.organizationId,type:{in:["WEEKLY_PACK","EXTRA_CREATION"]}},orderBy:{createdAt:"asc"},select:{payload:true}});
    const layouts=history.flatMap(row=>{const p=manifestOf(row.payload);return p?.brandId===brand.id ? p.slots.map(s=>s.layout):[];});
    const today=newYorkToday(), generationJobId=`${id}-generate`;
    const campaign=await tx.campaign.create({data:{brandId:brand.id,title:`Extra ${option.label} · ${today}`,goal:"awareness",status:input.kind==="presenter"?"ready":"generating"}});
    const slot:WeeklySlot={key:`${id}-slot`,day:1,date:today,kind:input.kind==="ad"?"image":input.kind==="reel"?"motion_reel":"ai_video",topic:input.brief.trim(),layout:input.kind==="ad"?"classic":nextWeeklyLayout(id,layouts,[],[]),...(input.kind==="ad"?{photoSource:"ai" as const}:{}),...(input.kind==="reel"?{reelPhotoSource:product?"website" as const:"ai" as const}:{}),...(product?{...(product.sourceUrl?{sourceUrl:product.sourceUrl}:{}),...(input.kind!=="ad"&&product.imageUrl?{sourceImageUrl:product.imageUrl}:{}),productName:product.name}:{})};
    const prep=input.kind==="presenter"?option.credits:extraOptions.ad.credits;
    const manifest:ExtraManifest={version:1,extraKind:input.kind,fingerprint,brief:input.brief.trim(),...(input.productId?{productId:input.productId}:{}),...(input.kind==="presenter"?{presenter:input.presenter || "alex",providerBudgetUsd:1.1}:{}),brandId:brand.id,campaignId:campaign.id,generationJobId,weekStart:today,weekEnd:today,weekNumber:1,cycle:1,requestId:input.requestId,mix:{images:input.kind==="ad"?1:0,motionReels:input.kind==="reel"?1:0,aiVideos:0},slots:[slot],oneTime:false,preparationCredits:prep,completionCredits:option.credits-prep,packCredits:option.credits};
    const connections=await tx.socialConnection.findMany({where:{organizationId:ctx.organizationId,status:"connected"},select:{provider:true}}),platforms=[...new Set(connections.map(c=>c.provider))];
    const parent=await tx.job.create({data:{id,organizationId:ctx.organizationId,type:"EXTRA_CREATION",status:"queued",payload:manifest as any}});
    if(input.kind==="presenter"){
      const item=await tx.contentItem.create({data:{campaignId:campaign.id,type:"presenter_post",platform:platforms.join(","),headline:input.brief.trim().split(/\s+/).slice(0,7).join(" "),caption:input.brief.trim(),status:"draft"}});
      await tx.job.update({where:{id:parent.id},data:{result:{items:[{slotKey:slot.key,contentItemId:item.id}]}}});
    }else{
      const artDirection=input.kind==="ad"?`Art-direct this as a complete, original social campaign: derive the visual concept, atmosphere, composition and palette from this business's own voice, positioning, audience, visual rules and saved brand colors. Avoid generic stock-photo staging, generic text panels or a boxed caption treatment. Create an intentional, edge-to-edge scene with a distinct subject and calm negative space for the app to place the headline. Do not render text or logos into the image; those are added cleanly by the app. Generate an illustrative brand-relevant scene even when no product photo exists. If featuring the selected product, use only its supplied name and description as context; do not pretend to reproduce its exact physical appearance or add unsupported features.`:"";
      const brief=`Create exactly ONE ${input.kind==="ad"?"branded image ad":"15-second photo-motion reel draft"} for ${brand.name}. Follow the assigned planKey and topic. Customer direction: ${input.brief.trim()}. ${product?`Selected product: ${product.name}. Known description: ${product.description || "No additional product details supplied."}.`:""} ${artDirection} Keep the headline at most 8 words and the caption concise. Use verified business facts only; never invent prices, offers or testimonials. ${product && input.kind!=="ad"?`Use only the actual saved photos of ${product.name}; preserve its appearance.`:input.kind==="ad"?"Create an original illustrative scene guided by the brand, not a purportedly exact product photograph.":"Use illustrative scenes about the business, without naming an exact physical product model or inventing its appearance."}`;
      await tx.job.create({data:{id:generationJobId,organizationId:ctx.organizationId,type:"CREATE_EVERYTHING",payload:{campaignId:campaign.id,extraCreationId:id,weeklySlots:[slot],weeklySources:photos,brief,goal:"awareness",days:1,contentPlan:[{planKey:slot.key,day:1,date:today,type:input.kind==="ad"?"post":"reel_post",platforms,extra:false,occasion:null,topics:product?[product.name]:[]}],dailyPlan:[{day:1,date:today,platforms}],photoSource:input.kind==="ad"?"ai":product?"website":"ai",imageUrls:photos.map(p=>p.imageUrl),websitePhotoEvidence:photos.map(p=>({imageUrl:p.imageUrl,sourceUrl:p.sourceUrl,title:p.productName})),brandContext:{name:brand.name,voice:brand.voice,positioning:brand.positioning,visualRules:brand.visualRules,primaryColor:brand.primaryColor,secondaryColor:brand.secondaryColor,accentColor:brand.accentColor,designStyle:brand.designStyle,industry:brand.industry,description:brand.description,targetAudience:brand.targetAudience,website:brand.websiteUrl,approvalRequired:true}} as any}});
    }
    const charged=await tx.subscription.updateMany({where:{organizationId:ctx.organizationId,credits:{gte:option.credits},status:{in:["active","trialing"]}},data:{credits:{decrement:prep}}});
    if(charged.count!==1)throw new WeeklyError("Not enough available credits. Nothing was created.",402);
    const after=await tx.subscription.findUniqueOrThrow({where:{organizationId:ctx.organizationId}});
    await tx.creditLedger.create({data:{organizationId:ctx.organizationId,delta:-prep,balanceAfter:after.credits,reason:`extra_${input.kind}`,referenceId:id}});
    return{id,reused:false};
  },{timeout:15000});
}
