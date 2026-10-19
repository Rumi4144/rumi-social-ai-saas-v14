import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
export async function GET(req: Request) {
  try {
    const ctx = await tenantContext();
    const id = new URL(req.url).searchParams.get("contentItemId");
    if (!id) return NextResponse.json({error:"Choose a post."},{status:400});
    const item = await prisma.contentItem.findFirst({where:{id,campaign:{brand:{organizationId:ctx.organizationId}}},select:{id:true}});
    if (!item) return NextResponse.json({error:"Post not found."},{status:404});
    const jobs = await prisma.publishJob.findMany({where:{contentItemId:id,organizationId:ctx.organizationId},orderBy:{createdAt:"desc"},take:50,select:{id:true,platform:true,status:true,scheduledFor:true,publishedAt:true,lastError:true,socialConnectionId:true}});
    const connections=await prisma.socialConnection.findMany({where:{organizationId:ctx.organizationId,id:{in:jobs.map(job=>job.socialConnectionId)}},select:{id:true,accountName:true}});
    return NextResponse.json({jobs:jobs.map(job=>({...job,socialConnection:{accountName:connections.find(connection=>connection.id===job.socialConnectionId)?.accountName||null}}))},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {return apiError(error,"Could not check posting status.");}
}
