import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
const schema=z.object({contentItemId:z.string().min(1),assetId:z.string().min(1)});
export async function GET(req:Request){try{
  const ctx=await tenantContext();
    if (!ctx.isSuperAdmin) return NextResponse.json({ error: "The creative library is available in Admin." }, { status: 403 });
    const id=new URL(req.url).searchParams.get("contentItemId");
  const item=await prisma.contentItem.findFirst({where:{id:id||"",campaign:{brand:{organizationId:ctx.organizationId}}},select:{campaign:{select:{brandId:true}}}});
  if(!item)return NextResponse.json({error:"Post not found."},{status:404});
  const campaigns=await prisma.campaign.findMany({where:{brandId:item.campaign.brandId,brand:{organizationId:ctx.organizationId}},select:{id:true,title:true}});
  const assets=await prisma.mediaAsset.findMany({where:{organizationId:ctx.organizationId,campaignId:{in:campaigns.map(c=>c.id)},kind:"campaign_video",status:"ready",provider:{not:"saved-video"}},select:{id:true,campaignId:true,contentItemId:true,prompt:true,metadata:true,createdAt:true},orderBy:{createdAt:"desc"},take:100});
  const posts=await prisma.contentItem.findMany({where:{campaignId:{in:campaigns.map(c=>c.id)}},select:{id:true,headline:true}});
  return NextResponse.json({videos:assets.filter(a=>!(a.metadata as {reusedFromAssetId?:string}|null)?.reusedFromAssetId).map(a=>({id:a.id,title:posts.find(p=>p.id===a.contentItemId)?.headline||a.prompt?.slice(0,120)||"Saved video",campaign:campaigns.find(c=>c.id===a.campaignId)?.title||"",src:`/api/video/media/${a.id}`}))},{headers:{"Cache-Control":"private, no-store"}});
}catch(e){return apiError(e,"Could not load saved videos.");}}
export async function POST(req:Request){try{
  const ctx=await tenantContext();
    if (!ctx.isSuperAdmin) return NextResponse.json({ error: "Creative controls are available in Admin. Request a change from This Week." }, { status: 403 });if(ctx.role==="viewer")return NextResponse.json({error:"Your role cannot change posts."},{status:403});
  const parsed=schema.safeParse(await req.json());if(!parsed.success)return NextResponse.json({error:"Choose a saved video and destination post."},{status:400});const p=parsed.data;
  const result=await prisma.$transaction(async tx=>{
    const item=await tx.contentItem.findFirst({where:{id:p.contentItemId,campaign:{brand:{organizationId:ctx.organizationId}}},include:{campaign:{select:{brandId:true}}}});
    if(!item)return {status:404,error:"Post not found."};
    const campaigns=await tx.campaign.findMany({where:{brandId:item.campaign.brandId,brand:{organizationId:ctx.organizationId}},select:{id:true}});
    const source=await tx.mediaAsset.findFirst({where:{id:p.assetId,organizationId:ctx.organizationId,campaignId:{in:campaigns.map(c=>c.id)},kind:"campaign_video",status:"ready"}});
    if(!source?.url)return {status:404,error:"Video not found in this business."};
    const active=await tx.publishJob.findFirst({where:{contentItemId:item.id,status:{in:["scheduled","retry","publishing","published"]}}});
    if(active||["scheduled","published"].includes(item.status))return {status:409,error:"Cancel scheduled posting before changing this video."};
    const meta=(source.metadata&&typeof source.metadata==="object"&&!Array.isArray(source.metadata)?source.metadata:{}) as Record<string,Prisma.JsonValue>;
    const asset=await tx.mediaAsset.create({data:{organizationId:ctx.organizationId,campaignId:item.campaignId,contentItemId:item.id,kind:"campaign_video",provider:"saved-video",url:source.url,prompt:source.prompt,metadata:{...meta,reusedFromAssetId:source.id}}});
    await tx.contentItem.update({where:{id:item.id},data:{mediaUrl:`/api/video/media/${asset.id}`,status:"draft"}});
    return {status:200,assetId:asset.id};
  },{isolationLevel:"Serializable"});return NextResponse.json(result,{status:result.status});
}catch(e){return apiError(e,"Could not reuse this video.");}}
