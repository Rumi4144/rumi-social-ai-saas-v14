import { NextResponse } from "next/server";
import { z } from "zod";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { videoBytes } from "@/lib/video/media";
export const maxDuration=60;
const S=z.object({requestId:z.string().uuid(),contentItemId:z.string().min(1),assetId:z.string().min(1)});
export async function POST(req:Request){try{
 const ctx=await tenantContext();if(ctx.role==="viewer")return NextResponse.json({error:"Your role cannot create posts."},{status:403});
 const parsed=S.safeParse(await req.json());if(!parsed.success)return NextResponse.json({error:"Choose a post and video."},{status:400});const p=parsed.data;
 const item=await prisma.contentItem.findFirst({where:{id:p.contentItemId,campaign:{brand:{organizationId:ctx.organizationId}}}});
 const asset=item&&await prisma.mediaAsset.findFirst({where:{id:p.assetId,organizationId:ctx.organizationId,campaignId:item.campaignId,contentItemId:item.id,kind:"campaign_video",status:"ready"}});
 if(!item||!asset?.url)return NextResponse.json({error:"Post or video not found."},{status:404});
 const id=`video_draft_${ctx.organizationId}_${asset.id}_${p.requestId}`;
 const existing=await prisma.mediaAsset.findUnique({where:{id}});
 if(existing){const meta=existing.metadata as {sourceAssetId?:string}|null;if(existing.organizationId!==ctx.organizationId||meta?.sourceAssetId!==asset.id)return NextResponse.json({error:"Draft request unavailable."},{status:409});return NextResponse.json({campaignId:item.campaignId,contentItemId:existing.contentItemId});}
 const clip=await videoBytes(asset);if(clip.contentType!=="video/mp4")return NextResponse.json({error:"Use an MP4 clip for Facebook publishing."},{status:400});
 const pathname=`reels/${ctx.organizationId}/${id}/${p.requestId}.mp4`;
 await put(pathname,clip.bytes,{access:"private",addRandomSuffix:false,allowOverwrite:true,contentType:"video/mp4"});
 await prisma.$transaction(async tx=>{
  await tx.contentItem.upsert({where:{id},update:{},create:{id,campaignId:item.campaignId,type:"post",platform:"facebook",headline:item.headline,caption:item.caption,status:"draft",mediaUrl:`/api/video/media/${id}`}});
  await tx.mediaAsset.upsert({where:{id},update:{},create:{id,organizationId:ctx.organizationId,campaignId:item.campaignId,contentItemId:id,kind:"campaign_video",provider:"reuse",status:"ready",url:`/api/video/media/${id}`,metadata:{pathname,contentType:"video/mp4",sourceAssetId:asset.id}}});
 });
 return NextResponse.json({campaignId:item.campaignId,contentItemId:id});
 }catch(error){return apiError(error,"Could not create the video draft. Retry uses the same request.");}}
