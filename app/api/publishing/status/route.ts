import { facebookVideoStatus } from "@/lib/publishing/facebook-video-status";
import { decryptSecret } from "@/lib/security/crypto";
import { campaignVideoId } from "@/lib/publishing/facebook-video";
import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
export async function GET(req: Request) {
  try {
    const ctx = await tenantContext();
    const id = new URL(req.url).searchParams.get("contentItemId");
    if (!id) return NextResponse.json({error:"Choose a post."},{status:400});
    const item = await prisma.contentItem.findFirst({where:{id,campaign:{brand:{organizationId:ctx.organizationId}}},select:{id:true,mediaUrl:true}});
    if (!item) return NextResponse.json({error:"Post not found."},{status:404});
    const jobs = await prisma.publishJob.findMany({where:{contentItemId:id,organizationId:ctx.organizationId},orderBy:{createdAt:"desc"},take:50,select:{id:true,platform:true,status:true,scheduledFor:true,publishedAt:true,lastError:true,socialConnectionId:true,externalPostId:true}});
    const connections=await prisma.socialConnection.findMany({where:{organizationId:ctx.organizationId,id:{in:jobs.map(job=>job.socialConnectionId)}},select:{id:true,accountName:true,encryptedToken:true}});
    const deliveries=await Promise.all(jobs.map(async job=>{
      const connection=connections.find(value=>value.id===job.socialConnectionId);
      const delivery={...job,socialConnection:{accountName:connection?.accountName||null}};
      if(job.platform.toLowerCase()!=="facebook" || !job.externalPostId || !campaignVideoId(item.mediaUrl) || !["published","retry"].includes(job.status))return delivery;
      try {
        const credentials=JSON.parse(decryptSecret(connection?.encryptedToken||""));
        if(typeof credentials.pageAccessToken!=="string")throw new Error("Missing Page token");
        const result=await facebookVideoStatus(job.externalPostId,credentials.pageAccessToken);
        if(result.ok)return {...delivery,status:"published",lastError:null};
        return {...delivery,status:result.pending?"processing":"failed",lastError:result.error||null};
      }catch{return {...delivery,status:"verification_pending",lastError:"Could not verify Facebook playback. Check the existing post before retrying."};}
    }));
    return NextResponse.json({jobs:deliveries},{headers:{"Cache-Control":"private, no-store"}});
  } catch(error) {return apiError(error,"Could not check posting status.");}
}
