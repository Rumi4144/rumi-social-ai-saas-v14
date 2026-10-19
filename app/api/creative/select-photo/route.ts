import {NextResponse} from 'next/server';
import {z} from 'zod';
import sharp from 'sharp';
import {tenantContext} from '@/lib/auth/context';
import {prisma} from '@/lib/prisma';
import {apiError} from '@/lib/http/errors';
const selection=z.object({campaignId:z.string().min(1),contentItemId:z.string().min(1),assetId:z.string().min(1)});
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({error:'Request origin is not allowed.'},{status:403});
 const ctx=await tenantContext();if(ctx.role==='viewer')return NextResponse.json({error:'Your role cannot change posts.'},{status:403});
 let input:{campaignId:string;contentItemId:string;assetId?:string},uploaded:{url:string;label:string;stockSource:string|null}|null=null;
 if(req.headers.get('content-type')?.includes('multipart/form-data')){
  if(Number(req.headers.get('content-length')||0)>4_000_000)return NextResponse.json({error:'Upload a photo smaller than 3 MB.'},{status:413});
  const chunks:Buffer[]=[];let size=0;const reader=req.body?.getReader();
  if(!reader)return NextResponse.json({error:'Choose a photo file.'},{status:400});
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>4_000_000){await reader.cancel();return NextResponse.json({error:'Upload a photo smaller than 3 MB.'},{status:413});}chunks.push(Buffer.from(part.value));}
  const form=await new Response(new Uint8Array(Buffer.concat(chunks)),{headers:req.headers}).formData();input=z.object({campaignId:z.string().min(1),contentItemId:z.string().min(1)}).parse({campaignId:form.get('campaignId'),contentItemId:form.get('contentItemId')});
  const file=form.get('photo');if(!(file instanceof Blob)||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>3_000_000||file.size===0)return NextResponse.json({error:'Choose a JPEG, PNG or WebP photo up to 3 MB.'},{status:400});
  if(form.get('rightsConfirmed')!=='true')return NextResponse.json({error:'Confirm you have permission to use this photo.'},{status:400});
  const stockSource=String(form.get('stockSource')||'').trim();if(stockSource&&!z.string().url().max(2000).refine(v=>new URL(v).protocol==='https:').safeParse(stockSource).success)return NextResponse.json({error:'Use an HTTPS stock-photo page address.'},{status:400});
  let bytes:Buffer;try{bytes=await sharp(Buffer.from(await file.arrayBuffer()),{limitInputPixels:30_000_000}).rotate().resize(2048,2048,{fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer();}catch{return NextResponse.json({error:'This file is not a supported photo. Choose a JPEG, PNG or WebP image.'},{status:400});}
  uploaded={url:`data:image/jpeg;base64,${bytes.toString('base64')}`,label:String(form.get('label')||'Uploaded photo').trim().slice(0,200)||'Uploaded photo',stockSource:stockSource||null};
 }else input=selection.parse(await req.json());
 const result=await prisma.$transaction(async tx=>{
  const item=await tx.contentItem.findFirst({where:{id:input.contentItemId,campaignId:input.campaignId,campaign:{brand:{organizationId:ctx.organizationId}}},include:{campaign:{select:{brandId:true}}}});
  if(!item)return {status:404,error:'Post not found.'};
  const active=await tx.publishJob.findFirst({where:{contentItemId:item.id,status:{in:['scheduled','retry','publishing','published']}}});
  if(active||['scheduled','published'].includes(item.status))return {status:409,error:'Cancel scheduled posting before changing this photo.'};
  const brandCampaigns=input.assetId?await tx.campaign.findMany({where:{brandId:item.campaign.brandId,brand:{organizationId:ctx.organizationId}},select:{id:true}}):[];
  const source=input.assetId?await tx.mediaAsset.findFirst({where:{id:input.assetId,organizationId:ctx.organizationId,campaignId:{in:brandCampaigns.map(c=>c.id)},status:{in:['ready','superseded']},kind:{in:['ai_image','product_photo','reel_scene_image']},url:{not:null}}}):null;
  if(!uploaded&&!source?.url)return {status:404,error:'Saved photo not found for this business.'};
  const previous=source?.metadata as {stockSource?:string;rightsConfirmed?:boolean;label?:string;sourceEvidence?:{imageUrl:string;sourceUrl:string;title:string};sourceUrl?:string;productName?:string}|null;
  const url=uploaded?.url||source!.url!,isAi=source?.kind==='ai_image'||source?.provider==='openai';
  await tx.mediaAsset.updateMany({where:{organizationId:ctx.organizationId,campaignId:item.campaignId,contentItemId:item.id,status:'ready',kind:{in:['ai_image','product_photo','social_creative']}},data:{status:'superseded'}});
  await tx.mediaAsset.create({data:{organizationId:ctx.organizationId,campaignId:item.campaignId,contentItemId:item.id,kind:isAi?'ai_image':'product_photo',provider:uploaded?'upload':'reuse',status:'ready',url,prompt:uploaded?.label||source?.prompt||'Reused saved photo',metadata:{sourceEvidence:previous?.sourceEvidence||null,sourceUrl:previous?.sourceUrl||null,productName:previous?.productName||null,label:uploaded?.label||previous?.label||'Reused saved photo',sourceAssetId:source?.id||null,sourceProvider:source?.provider||null,stockSource:uploaded?.stockSource||previous?.stockSource||null,rightsConfirmed:Boolean(uploaded)||previous?.rightsConfirmed===true,userSelected:true}}});
  await tx.contentItem.update({where:{id:item.id},data:{mediaUrl:url,status:'draft'}});
  return {status:200};
 },{isolationLevel:'Serializable'});
 return NextResponse.json(result,{status:result.status});
}catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:'Choose a photo and a campaign post.'},{status:400});return apiError(error,'Could not use this photo. Check its file and try again.');}}
