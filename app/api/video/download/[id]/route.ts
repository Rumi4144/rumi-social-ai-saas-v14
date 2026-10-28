import {prisma} from "@/lib/prisma";
import {videoBytes} from "@/lib/video/media";
import {validInstagramVideoUrl} from "@/lib/publishing/instagram-video-url";
export const maxDuration=60;
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params, query=new URL(req.url).searchParams, organizationId=query.get("organizationId")||"";
  if(!validInstagramVideoUrl(id,organizationId,query.get("expires")||"",query.get("signature")||""))return new Response(null,{status:404});
  const asset=await prisma.mediaAsset.findFirst({where:{id,organizationId,kind:{in:["ai_video","campaign_video"]},status:"ready"}});
  if(!asset)return new Response(null,{status:404});
  try { const clip=await videoBytes(asset);return new Response(new Uint8Array(clip.bytes),{headers:{"Content-Type":clip.contentType,"Content-Length":String(clip.bytes.length),"Content-Disposition":`attachment; filename="rumi-video-${id}.${clip.contentType==='video/mp4'?'mp4':'webm'}"`,"Cache-Control":"private, no-store","X-Robots-Tag":"noindex","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}}); }catch{return new Response(null,{status:404});}
}
