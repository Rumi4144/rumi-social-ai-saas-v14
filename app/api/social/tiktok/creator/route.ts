import {NextResponse} from "next/server";
import {tenantContext} from "@/lib/auth/context";
import {prisma} from "@/lib/prisma";
import {tikTokAccessToken,tikTokCreator} from "@/lib/tiktok/client";
import {campaignVideoId} from "@/lib/publishing/facebook-video";
export async function GET(req:Request){
 try{
  const ctx=await tenantContext();if(ctx.role==="viewer")return NextResponse.json({error:"Ask a workspace administrator to set up TikTok posting."},{status:403});
  const query=new URL(req.url).searchParams;
  const connection=await prisma.socialConnection.findFirst({where:{id:query.get("connectionId")||"",organizationId:ctx.organizationId,provider:"tiktok",status:"connected"}});
  if(!connection)return NextResponse.json({error:"TikTok account not found."},{status:404});
  let post;
  if(query.get("contentItemId")){
   const item=await prisma.contentItem.findFirst({where:{id:query.get("contentItemId")!,campaign:{brand:{organizationId:ctx.organizationId}}}});
   if(!item)return NextResponse.json({error:"Post not found."},{status:404});
   const assetId=query.get("assetId")||campaignVideoId(item.mediaUrl);
   const asset=assetId?await prisma.mediaAsset.findFirst({where:{id:assetId,organizationId:ctx.organizationId,contentItemId:item.id,kind:"campaign_video",status:"ready"}}):null;
   if(!asset)return NextResponse.json({error:"Select and save the finished MP4 reel before preparing TikTok."},{status:409});
   const meta=asset.metadata as {duration?:number;contentType?:string}|null;
   if(meta?.contentType!=="video/mp4"||!meta.duration)return NextResponse.json({error:"Export and save a finished MP4 reel with its duration before posting to TikTok."},{status:409});
   post={title:item.caption||item.headline||"",duration:meta.duration,videoUrl:`/api/video/media/${asset.id}`};
  }
  const creator=await tikTokCreator(await tikTokAccessToken(connection));
  return NextResponse.json({creator,post,publicPostingApproved:process.env.TIKTOK_PUBLIC_POSTING_APPROVED==="true"},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not check TikTok posting."},{status:409});}
}
