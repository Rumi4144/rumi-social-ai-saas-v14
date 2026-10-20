import {tenantContext} from "@/lib/auth/context";
import {prisma} from "@/lib/prisma";
import {decryptSecret,encryptSecret} from "@/lib/security/crypto";
import {tikTokCreator} from "./client";

export const sandboxProvider="tiktok_sandbox";
export async function sandboxContext(){
 const ctx=await tenantContext();
 if(!ctx.isSuperAdmin)throw new Error("This TikTok test area is available to the app administrator only.");
 return ctx;
}
export function sandboxConfig(){
 const clientKey=process.env.TIKTOK_SANDBOX_CLIENT_KEY,clientSecret=process.env.TIKTOK_SANDBOX_CLIENT_SECRET;
 if(!clientKey||!clientSecret)throw new Error("TikTok test credentials have not been configured yet.");
 const appUrl=process.env.NEXT_PUBLIC_APP_URL;
 if(!appUrl)throw new Error("The app address has not been configured.");
 const origin=new URL(appUrl).origin;
 return {clientKey,clientSecret,origin,redirectUri:`${origin}/api/social/tiktok-test/callback/`};
}
export async function sandboxConnection(organizationId:string){
 const connection=await prisma.socialConnection.findFirst({where:{organizationId,provider:sandboxProvider,status:"connected"}});
 if(!connection)throw new Error("Connect a TikTok test account first.");
 return connection;
}
export async function sandboxAccessToken(connection:{id:string;organizationId:string;externalId:string|null;encryptedToken:string|null}){
 const config=sandboxConfig();
 const grant=JSON.parse(decryptSecret(connection.encryptedToken||""));
 if(grant.environment!=="sandbox"||grant.clientKey!==config.clientKey||grant.openId!==connection.externalId)throw new Error("Reconnect the TikTok test account.");
 if(!String(grant.scope||"").split(/[ ,]+/).includes("video.publish"))throw new Error("The test account did not grant video posting. Check the sandbox scopes, then reconnect.");
 if(grant.accessToken&&Number(grant.expiresAt)>Date.now()+60000)return String(grant.accessToken);
 if(!grant.refreshToken)throw new Error("Reconnect the TikTok test account.");
 const response=await fetch("https://open.tiktokapis.com/v2/oauth/token/",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_key:config.clientKey,client_secret:config.clientSecret,grant_type:"refresh_token",refresh_token:grant.refreshToken}),cache:"no-store",signal:AbortSignal.timeout(12000)});
 const data=await response.json();
 if(!response.ok||!data.access_token||data.open_id!==connection.externalId||!String(data.scope||grant.scope).split(/[ ,]+/).includes("video.publish"))throw new Error("TikTok could not renew this test account. Reconnect it.");
 const updated={...grant,accessToken:data.access_token,refreshToken:data.refresh_token||grant.refreshToken,scope:data.scope||grant.scope,expiresAt:Date.now()+Number(data.expires_in||86400)*1000};
 const saved=await prisma.socialConnection.updateMany({where:{id:connection.id,organizationId:connection.organizationId,provider:sandboxProvider,status:"connected",encryptedToken:connection.encryptedToken},data:{encryptedToken:encryptSecret(JSON.stringify(updated))}});
 if(saved.count!==1)throw new Error("The test connection changed. Reopen this page.");
 return String(data.access_token);
}
export async function sandboxCreator(token:string){
 const creator=await tikTokCreator(token);
 creator.privacy_level_options=creator.privacy_level_options.filter(value=>value==="SELF_ONLY");
 if(!creator.privacy_level_options.length)throw new Error("This test requires TikTok to offer Only me visibility.");
 return creator;
}
export async function sandboxAsset(organizationId:string,assetId:string){
 const asset=await prisma.mediaAsset.findFirst({where:{id:assetId,organizationId,kind:"campaign_video",status:"ready"}});
 const metadata=asset?.metadata as {duration?:number;contentType?:string}|null;
 if(!asset||metadata?.contentType!=="video/mp4"||!Number.isFinite(metadata.duration)||Number(metadata.duration)<3||!asset.contentItemId)throw new Error("Choose a finished MP4 reel saved in this business.");
 const item=await prisma.contentItem.findFirst({where:{id:asset.contentItemId,campaign:{brand:{organizationId}}}});
 if(!item)throw new Error("This reel is not available in this business.");
 return {asset,item,duration:Number(metadata.duration)};
}
