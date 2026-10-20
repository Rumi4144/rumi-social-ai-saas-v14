import {prisma} from "@/lib/prisma";
import {tikTokAccessToken,tikTokCreator,tikTokJson} from "@/lib/tiktok/client";
import {TikTokOptions,validateTikTokOptions} from "@/lib/tiktok/options";
import {tikTokVideoUrl} from "@/lib/tiktok/video-url";
import type {PublishResult} from "./providers";
export async function publishTikTokVideo(input:{assetId:string;externalAccountId:string;organizationId?:string;contentItemId?:string;publishJobId?:string}):Promise<PublishResult>{
 const fail=(error:string):PublishResult=>({ok:false,retryable:false,error});
 if(!input.organizationId||!input.contentItemId||!input.publishJobId)return fail("TikTok publishing context is missing.");
 const stateId=`tiktok_video_${input.publishJobId}`;
 let receiptId:string|undefined,receiptCreatedAt:number|undefined;
 try{
  const job=await prisma.publishJob.findFirst({where:{id:input.publishJobId,organizationId:input.organizationId,contentItemId:input.contentItemId,platform:"tiktok"}});
  if(!job)return fail("TikTok publishing job not found.");
  const connection=await prisma.socialConnection.findFirst({where:{id:job.socialConnectionId,organizationId:input.organizationId,provider:"tiktok",externalId:input.externalAccountId,status:"connected"}});
  if(!connection)return fail("Reconnect the selected TikTok account.");
  const token=await tikTokAccessToken(connection);
  const state=await prisma.job.findFirst({where:{id:stateId,organizationId:input.organizationId,type:"TIKTOK_VIDEO_PUBLISH"}});
  const prior=state?.result as {publishId?:string;postId?:string}|null;
  if(state?.status==="succeeded"&&prior?.postId)return {ok:true,externalId:prior.postId};
  if(state&&state.status!=="processing")return fail("TikTok upload needs review. Check TikTok before retrying to avoid a duplicate.");
  receiptId=prior?.publishId;receiptCreatedAt=state?.createdAt?new Date(state.createdAt).getTime():undefined;
  if(!state){
   const settings=await prisma.job.findFirst({where:{id:`tiktok_settings_${job.id}`,organizationId:input.organizationId,type:"TIKTOK_POST_SETTINGS"}});
   const payload=settings?.payload as {options?:unknown;assetId?:string;accountId?:string}|null;
   const options=TikTokOptions.parse(payload?.options);
   if(payload?.assetId!==input.assetId||payload.accountId!==connection.externalId)return fail("The TikTok video or account changed. Review posting settings again.");
   const asset=await prisma.mediaAsset.findFirst({where:{id:input.assetId,organizationId:input.organizationId,contentItemId:input.contentItemId,kind:"campaign_video",status:"ready"}});
   const meta=asset?.metadata as {duration?:number;contentType?:string}|null;
   if(!asset||meta?.contentType!=="video/mp4")return fail("Choose a finished MP4 reel for TikTok.");
   const creator=await tikTokCreator(token);validateTikTokOptions(options,creator,meta.duration||0);
   try{await prisma.job.create({data:{id:stateId,organizationId:input.organizationId,type:"TIKTOK_VIDEO_PUBLISH",status:"starting",payload:{assetId:asset.id,publishJobId:job.id}}});}catch{return fail("TikTok upload is already claimed. Check posting status.");}
   const data=await tikTokJson("video/init",token,{post_info:{title:options.title,privacy_level:options.privacy,disable_comment:!options.allowComment,disable_duet:!options.allowDuet,disable_stitch:!options.allowStitch,brand_organic_toggle:options.ownBrand,brand_content_toggle:options.brandedContent,is_aigc:options.aiGenerated},source_info:{source:"PULL_FROM_URL",video_url:tikTokVideoUrl(asset.id,input.organizationId)}});
   if(!data?.publish_id)return fail("TikTok did not confirm the upload. Check TikTok before retrying.");
   receiptId=String(data.publish_id);receiptCreatedAt=Date.now();
   await prisma.job.update({where:{id:stateId},data:{status:"processing",result:{publishId:receiptId}}});
  }
  if(!receiptId)return fail("TikTok upload reference is missing. Check posting history before retrying.");
  const result=await tikTokJson("status/fetch",token,{publish_id:receiptId});
  if(result.status==="FAILED"){
   const error=`TikTok could not publish this video (${String(result.fail_reason||"processing_failed").slice(0,160)}).`;
   await prisma.job.update({where:{id:stateId},data:{status:"failed",error}});return fail(error);
  }
  if(result.status==="PUBLISH_COMPLETE"){
   const postId=String(result.publicaly_available_post_id?.[0]||receiptId);
   await prisma.job.update({where:{id:stateId},data:{status:"succeeded",progress:100,result:{publishId:receiptId,postId}}});return {ok:true,externalId:postId};
  }
  if(state?.createdAt&&Date.now()-new Date(state.createdAt).getTime()>24*60*60*1000)return fail("TikTok delivery is still unconfirmed after 24 hours. Check TikTok before retrying.");
  return {ok:false,pending:true,externalId:receiptId,error:"TikTok is processing this video. Its existing upload will be checked again."};
 }catch(error){
  const message=error instanceof Error?error.message:"TikTok publishing could not be confirmed.";
  if(receiptId&&receiptCreatedAt&&Date.now()-receiptCreatedAt>24*60*60*1000)return fail("TikTok delivery is still unconfirmed after 24 hours. Check TikTok before retrying.");
  if(receiptId)return {ok:false,pending:true,externalId:receiptId,error:"TikTok processing status is unavailable. Its existing upload will be checked again."};
  return fail(message);
 }
}
