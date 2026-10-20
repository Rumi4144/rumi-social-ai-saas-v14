import {prisma} from "@/lib/prisma";
import {videoBytes} from "@/lib/video/media";
import {resolveVideoAsset} from "@/lib/video/reuse";
import {privateVideoResponse} from "@/lib/video/private-response";
import {privateReelPath} from "@/lib/reels/storage";
import {validTikTokVideoUrl} from "@/lib/tiktok/video-url";
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const query=new URL(req.url).searchParams;const organizationId=query.get("organizationId")||"";
 if(!validTikTokVideoUrl(id,organizationId,query.get("expires")||"",query.get("signature")||""))return new Response(null,{status:404});
 const owned=await prisma.mediaAsset.findFirst({where:{id,organizationId,kind:"campaign_video",status:"ready"}});
 if(!owned)return new Response(null,{status:404});
 try{
  const asset=await resolveVideoAsset(owned);
  const meta=asset.metadata as {pathname?:string;contentType?:string}|null;
  if(meta?.contentType==="video/mp4"&&meta.pathname&&(meta.pathname===`runway/${organizationId}/${asset.id}.mp4`||(asset.contentItemId&&privateReelPath(meta.pathname,organizationId,asset.contentItemId))))return privateVideoResponse(req,meta.pathname,"video/mp4","tiktok-video.mp4");
  const clip=await videoBytes(owned);if(clip.contentType!=="video/mp4")return new Response(null,{status:415});
  return new Response(new Uint8Array(clip.bytes),{headers:{"Content-Type":"video/mp4","Content-Length":String(clip.bytes.length),"Cache-Control":"private, no-store","X-Robots-Tag":"noindex"}});
 }catch{return new Response(null,{status:404});}
}
export async function HEAD(req:Request,context:{params:Promise<{id:string}>}){const response=await GET(req,context);await response.body?.cancel();return new Response(null,{status:response.status,headers:response.headers});}
