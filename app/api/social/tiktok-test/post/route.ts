import {NextResponse} from "next/server";
import {z} from "zod";
import {prisma} from "@/lib/prisma";
import {sandboxContext,sandboxConnection,sandboxAccessToken,sandboxCreator,sandboxAsset} from "@/lib/tiktok/sandbox";
import {TikTokOptions,validateTikTokOptions} from "@/lib/tiktok/options";
import {tikTokJson} from "@/lib/tiktok/client";
import {tikTokVideoUrl} from "@/lib/tiktok/video-url";

const type="TIKTOK_SANDBOX_POST";
const schema=z.object({requestId:z.string().uuid(),assetId:z.string().min(1),connectionId:z.string().min(1),accountId:z.string().min(1),options:TikTokOptions});
// Separate test receipts never create PublishJobs or change campaign post status.
export async function POST(req:Request){
 try{
  if(req.headers.get("origin")!==new URL(req.url).origin)return NextResponse.json({error:"Reload the test page and try again."},{status:403});
  const ctx=await sandboxContext(),parsed=schema.parse(await req.json());
  if(parsed.options.privacy!=="SELF_ONLY")throw new Error("Test uploads must use Only me visibility.");
  const connection=await sandboxConnection(ctx.organizationId);
  if(parsed.connectionId!==connection.id||parsed.accountId!==connection.externalId)throw new Error("The test account changed. Review this upload again.");
  const {asset,duration}=await sandboxAsset(ctx.organizationId,parsed.assetId);
  const token=await sandboxAccessToken(connection),creator=await sandboxCreator(token);
  validateTikTokOptions(parsed.options,creator,duration);
  const id=`tiktok_sandbox_${ctx.userId}_${parsed.requestId}`;
  const existing=await prisma.job.findFirst({where:{id,organizationId:ctx.organizationId,type}});
  if(existing)return NextResponse.json({jobId:id,status:existing.status,message:"This test upload was already started. Check its status before starting another."},{status:202});
  try{await prisma.job.create({data:{id,organizationId:ctx.organizationId,type,status:"starting",payload:{userId:ctx.userId,assetId:asset.id,connectionId:connection.id,accountId:connection.externalId,options:parsed.options}}});}
  catch{return NextResponse.json({error:"This test upload was already claimed. Check its status before retrying."},{status:409});}
  try{
   const options=parsed.options;
   const data=await tikTokJson("video/init",token,{post_info:{title:options.title,privacy_level:"SELF_ONLY",disable_comment:!options.allowComment,disable_duet:!options.allowDuet,disable_stitch:!options.allowStitch,brand_organic_toggle:options.ownBrand,brand_content_toggle:options.brandedContent,is_aigc:options.aiGenerated},source_info:{source:"PULL_FROM_URL",video_url:tikTokVideoUrl(asset.id,ctx.organizationId)}});
   if(!data?.publish_id)throw new Error("TikTok did not confirm the test upload.");
   await prisma.job.update({where:{id},data:{status:"processing",result:{publishId:String(data.publish_id)}}});
   return NextResponse.json({jobId:id,status:"processing",message:"TikTok accepted the private test upload. Check its processing status."},{status:202});
  }catch(error){
   // An ambiguous initialization is never automatically repeated.
   await prisma.job.update({where:{id},data:{status:"needs_review",error:error instanceof Error?error.message:"Test upload could not be confirmed."}});
   return NextResponse.json({jobId:id,status:"needs_review",message:error instanceof Error?error.message:"Test upload could not be confirmed."},{status:202});
  }
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not start test upload."},{status:400});}
}
export async function GET(req:Request){
 try{
  const ctx=await sandboxContext(),id=new URL(req.url).searchParams.get("jobId")||"";
  const job=await prisma.job.findFirst({where:{id,organizationId:ctx.organizationId,type}});
  const payload=job?.payload as {userId?:string;connectionId?:string;accountId?:string}|null;
  if(!job||payload?.userId!==ctx.userId)throw new Error("Test upload not found.");
  if(job.status!=="processing")return NextResponse.json({status:job.status,message:job.error||(job.status==="succeeded"?"Private test video published.":"Check TikTok before starting another upload.")},{headers:{"Cache-Control":"private, no-store"}});
  if(Date.now()-job.createdAt.getTime()>24*60*60*1000)throw new Error("Test processing is still unconfirmed after 24 hours. Check TikTok before uploading again.");
  const connection=await sandboxConnection(ctx.organizationId);
  if(payload.connectionId!==connection.id||payload.accountId!==connection.externalId)throw new Error("The connected test account changed. Check the original account in TikTok.");
  const receipt=job.result as {publishId?:string}|null;
  if(!receipt?.publishId)throw new Error("The test upload receipt is missing. Check TikTok before uploading again.");
  const data=await tikTokJson("status/fetch",await sandboxAccessToken(connection),{publish_id:receipt.publishId});
  const status=data.status==="PUBLISH_COMPLETE"?"succeeded":data.status==="FAILED"?"failed":"processing";
  const message=status==="succeeded"?"Private test video published. Check the Only me videos on this TikTok account.":status==="failed"?`TikTok rejected the test video (${String(data.fail_reason||"processing_failed").slice(0,160)}).`:"TikTok is still processing this test video.";
  if(status!=="processing")await prisma.job.update({where:{id},data:{status,progress:status==="succeeded"?100:0,error:status==="failed"?message:null}});
  return NextResponse.json({status,message},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not check test upload."},{status:409});}
}
