import { savedProductSubject, reelProductSubject, reelPhotoMatchesProduct } from "@/lib/reels/product-identity";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { websitePhotos } from "@/lib/website/photos";
export const maxDuration=60;
export async function GET(req:Request){try{
 const ctx=await tenantContext(),campaignId=new URL(req.url).searchParams.get("campaignId")||"";
 const campaign=await prisma.campaign.findFirst({where:{id:campaignId,brand:{organizationId:ctx.organizationId}},select:{brand:{select:{name:true,websiteUrl:true,industry:true}}}});
 if(!campaign)return NextResponse.json({error:"Campaign not found."},{status:404});
 if(!campaign.brand.websiteUrl)return NextResponse.json({error:"Add this business’s website in Brand Brain first."},{status:400});
 const query=new URL(req.url).searchParams,postId=query.get("contentItemId");
 let productSubject:string|undefined;
 if(postId){
  const post=await prisma.contentItem.findFirst({where:{id:postId,campaignId,campaign:{brand:{organizationId:ctx.organizationId}}}});
  if(!post)return NextResponse.json({error:"Post not found in this campaign."},{status:404});
  const job=await prisma.job.findFirst({where:{organizationId:ctx.organizationId,type:"CREATE_EVERYTHING",status:"succeeded",payload:{path:["campaignId"],equals:campaignId}},orderBy:{createdAt:"desc"},select:{payload:true,result:true}});
  productSubject=savedProductSubject(post,campaign.brand,job);
 }
 const matchingOnly=!!productSubject && query.get("scope")!=="all";
 const photos=await websitePhotos(campaign.brand.websiteUrl,campaign.brand.name,undefined,matchingOnly?productSubject:undefined);
 return NextResponse.json({photos,productSubject,matchingOnly},{headers:{"Cache-Control":"private, no-store"}});
}catch(e){return apiError(e,"Could not read this business’s website photos. Check its website address in Brand Brain.");}}
const schema=z.object({campaignId:z.string().min(1),contentItemId:z.string().min(1),photoId:z.string().min(1),pageUrl:z.string().url(),allowDifferentProduct:z.boolean().default(false)});
export async function POST(req:Request){try{
 const ctx=await tenantContext();if(ctx.role==="viewer")return NextResponse.json({error:"Your role cannot change posts."},{status:403});
 const p=schema.safeParse(await req.json());if(!p.success)return NextResponse.json({error:"Choose a website photo."},{status:400});
 const item=await prisma.contentItem.findFirst({where:{id:p.data.contentItemId,campaignId:p.data.campaignId,campaign:{brand:{organizationId:ctx.organizationId}}},include:{campaign:{include:{brand:true}}}});
 if(!item?.campaign.brand.websiteUrl)return NextResponse.json({error:"Post or business website not found."},{status:404});
 const photos=await websitePhotos(item.campaign.brand.websiteUrl,item.campaign.brand.name,p.data.pageUrl),photo=photos.find(photo=>photo.id===p.data.photoId);
 if(!photo)return NextResponse.json({error:"This photo is no longer on the selected business website. Refresh the choices."},{status:409});
 const subject=reelProductSubject(item,item.campaign.brand);
 if(!p.data.allowDifferentProduct && !reelPhotoMatchesProduct(subject,{metadata:{sourceEvidence:{title:photo.productName||photo.name,sourceUrl:photo.sourceUrl,imageUrl:photo.imageUrl}}}))return NextResponse.json({error:"This photo is from a different product. Choose a matching photo, or explicitly browse all business photos."},{status:400});
 const result=await prisma.$transaction(async tx=>{
  const current=await tx.contentItem.findFirst({where:{id:item.id,campaignId:item.campaignId,campaign:{brand:{organizationId:ctx.organizationId}}}});
  const active=await tx.publishJob.findFirst({where:{contentItemId:item.id,status:{in:["scheduled","retry","publishing","published"]}}});
  if(!current||active||["scheduled","published"].includes(current.status))return {status:409,error:"Cancel scheduled posting before changing this photo."};
  await tx.mediaAsset.updateMany({where:{organizationId:ctx.organizationId,campaignId:item.campaignId,contentItemId:item.id,status:"ready",kind:{in:["ai_image","product_photo","social_creative"]}},data:{status:"superseded"}});
  await tx.mediaAsset.create({data:{organizationId:ctx.organizationId,campaignId:item.campaignId,contentItemId:item.id,kind:"product_photo",provider:"website",url:photo.imageUrl,prompt:photo.name,metadata:{label:photo.name,productName:photo.productName||photo.name,sourceEvidence:{title:photo.productName||photo.name,sourceUrl:photo.sourceUrl,imageUrl:photo.imageUrl},sourceUrl:photo.sourceUrl,userSelected:true}}});
  await tx.contentItem.update({where:{id:item.id},data:{mediaUrl:photo.imageUrl,status:"draft"}});
  return {status:200};
 },{isolationLevel:"Serializable"});return NextResponse.json(result,{status:result.status});
}catch(e){return apiError(e,"Could not use this website photo. Try another photo or page.");}}
