import {notFound} from "next/navigation";
import {prisma} from "@/lib/prisma";
import {sandboxContext,sandboxConfig,sandboxProvider} from "@/lib/tiktok/sandbox";
import TikTokTest from "./TikTokTest";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<{result?:string;message?:string}>}){
 const ctx=await sandboxContext().catch(()=>null);if(!ctx)notFound();
 let configured=true;try{sandboxConfig();}catch{configured=false;}
 const connection=await prisma.socialConnection.findFirst({where:{organizationId:ctx.organizationId,provider:sandboxProvider,status:"connected"},select:{id:true,accountName:true,externalId:true}});
 const assets=await prisma.mediaAsset.findMany({where:{organizationId:ctx.organizationId,kind:"campaign_video",status:"ready",contentItemId:{not:null}},orderBy:{createdAt:"desc"},take:60});
 const videos=assets.filter(asset=>{const meta=asset.metadata as {contentType?:string;duration?:number}|null;return meta?.contentType==="video/mp4"&&Number(meta.duration)>=3;}).map(asset=>({id:asset.id,contentItemId:asset.contentItemId!,label:asset.createdAt.toLocaleString("en-US",{timeZone:"America/New_York"}),duration:Number((asset.metadata as {duration:number}).duration)}));
 const query=await searchParams;
 return <><div className="eyebrow">TIKTOK PRIVATE TEST</div><h1>Test video posting.</h1><p>Business: <strong>{ctx.organization.name}</strong></p><p>This administrator test area uses a separate TikTok account connection. Test uploads do not mark campaign posts as published.</p>{query.result==="error"&&<p role="alert">{query.message||"TikTok test connection failed."}</p>}{query.result==="connected"&&<p role="status">TikTok test account connected.</p>}{query.result==="cancelled"&&<p>Test authorization was cancelled.</p>}{!configured?<p role="status">The TikTok sandbox credentials are still being configured.</p>:<><p>{connection?`Test account: ${connection.accountName||"TikTok"}`:"No test account connected yet."}</p><a className="button" href="/api/social/tiktok-test/connect">{connection?"Change test account":"Connect TikTok test account"}</a>{connection&&<TikTokTest accountId={connection.externalId||""} connectionId={connection.id} videos={videos}/>}</>}<p><a href="/settings">Back to normal connections</a></p></>;
}
