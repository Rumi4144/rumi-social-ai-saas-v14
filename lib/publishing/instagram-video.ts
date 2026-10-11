import {prisma} from "@/lib/prisma";
import {videoBytes} from "@/lib/video/media";
import {instagramVideoUrl} from "./instagram-video-url";
import type {PublishResult} from "./providers";
export async function publishInstagramVideo(input:{accessToken:string;accountId:string;caption:string;assetId:string;organizationId?:string;contentItemId?:string;publishJobId?:string}):Promise<PublishResult>{
 const stopped=(error:string):PublishResult=>({ok:false,retryable:false,error});
 if(!input.organizationId||!input.contentItemId||!input.publishJobId)return stopped("Video publishing context is missing.");
 if(input.caption.length>2200)return stopped("Instagram captions must be at most 2,200 characters.");
 const stateId=`instagram_video_${input.publishJobId}`;
 const api=async(path:string,params:Record<string,string>,method="GET")=>{const query=new URLSearchParams(params);const response=await fetch(`https://graph.instagram.com/v23.0/${path}${method==="GET"?`?${query}`:""}`,{method,headers:{Authorization:`Bearer ${input.accessToken}`,...(method==="POST"?{"Content-Type":"application/x-www-form-urlencoded"}:{})},...(method==="POST"?{body:query}:{}),cache:"no-store",signal:AbortSignal.timeout(10000)});const data=await response.json();if(!response.ok)throw new Error(data.error?.message||"Instagram request failed.");return data;};
 let publishing=false;
 try{
 const identity=await api("me",{fields:"id,username"});if(String(identity.id)!==input.accountId)return stopped("Instagram account does not match the connected account.");
 const asset=await prisma.mediaAsset.findFirst({where:{id:input.assetId,organizationId:input.organizationId,contentItemId:input.contentItemId,kind:"campaign_video",status:"ready"}});if(!asset)return stopped("Campaign video not found.");
 let state=await prisma.job.findFirst({where:{id:stateId,organizationId:input.organizationId,type:"INSTAGRAM_VIDEO_PUBLISH"}});
 const receipt=state?.result as {mediaId?:string;containerId?:string}|null;
 if(state?.status==="succeeded"&&receipt?.mediaId)return {ok:true,externalId:receipt.mediaId};
 if(state&&state.status!=="processing")return stopped("Instagram upload needs review before retrying. Check your account to avoid posting twice.");
 let containerId=receipt?.containerId;
 if(!state){const clip=await videoBytes(asset);if(clip.contentType!=="video/mp4")return stopped("Instagram Reels requires an MP4 video.");const videoUrl=instagramVideoUrl(asset.id,input.organizationId);
 try{state=await prisma.job.create({data:{id:stateId,organizationId:input.organizationId,type:"INSTAGRAM_VIDEO_PUBLISH",status:"starting",payload:{assetId:asset.id,publishJobId:input.publishJobId}}});}catch{return stopped("Instagram upload is already starting. Check publishing history.");}
 const container=await api(`${input.accountId}/media`,{media_type:"REELS",video_url:videoUrl,caption:input.caption,share_to_feed:"true"},"POST");if(!container.id)return stopped("Instagram did not confirm the Reel container.");containerId=String(container.id);await prisma.job.update({where:{id:stateId},data:{status:"processing",result:{containerId}}});}
 if(!containerId)return stopped("Instagram container is missing. Review publishing history.");
 const status=await api(containerId,{fields:"status_code,status"});
 if(["ERROR","EXPIRED"].includes(status.status_code)){await prisma.job.update({where:{id:stateId},data:{status:"failed",error:status.status||"Reel processing failed."}});return stopped(status.status||"Instagram could not process this video.");}
 if(status.status_code!=="FINISHED")return {ok:false,retryable:true,error:"Instagram is processing this Reel. Its existing upload will be checked again."};
 const claim=await prisma.job.updateMany({where:{id:stateId,status:"processing"},data:{status:"publishing"}});if(!claim.count)return stopped("Instagram publish is already claimed. Check your account before retrying.");publishing=true;
 const published=await api(`${input.accountId}/media_publish`,{creation_id:containerId},"POST");if(!published.id)return stopped("Instagram did not confirm publishing. Check your account before retrying.");const mediaId=String(published.id);await prisma.job.update({where:{id:stateId},data:{status:"succeeded",progress:100,result:{containerId,mediaId}}}).catch(()=>null);return {ok:true,externalId:mediaId};
 }catch{return stopped(publishing?"Instagram publishing was interrupted. Check your account before retrying to avoid posting twice.":"Instagram video upload could not be confirmed. Check publishing history before retrying.");}
}
