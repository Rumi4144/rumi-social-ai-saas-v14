import { prisma } from "@/lib/prisma";
import { decryptSecret,encryptSecret } from "@/lib/security/crypto";
import type { TikTokCreator } from "./options";
type Connection={id:string;organizationId:string;externalId:string|null;encryptedToken:string|null};
export function tikTokGrant(connection:Connection){
  if(!connection.encryptedToken)throw new Error("Reconnect TikTok in Settings to enable video posting.");
  const grant=JSON.parse(decryptSecret(connection.encryptedToken));
  if(grant.openId!==connection.externalId)throw new Error("TikTok account changed. Reconnect in Settings.");
  if(!String(grant.scope||"").split(/[ ,]+/).includes("video.publish"))throw new Error("TikTok is linked for sign-in only. Reconnect TikTok in Settings and approve video posting.");
  return grant;
}
export async function tikTokAccessToken(connection:Connection){
  const grant=tikTokGrant(connection);
  if(grant.accessToken&&Number(grant.expiresAt)>Date.now()+60000)return String(grant.accessToken);
  if(!grant.refreshToken||!process.env.TIKTOK_CLIENT_KEY||!process.env.TIKTOK_CLIENT_SECRET)throw new Error("TikTok connection expired. Reconnect it in Settings.");
  const response=await fetch("https://open.tiktokapis.com/v2/oauth/token/",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_key:process.env.TIKTOK_CLIENT_KEY,client_secret:process.env.TIKTOK_CLIENT_SECRET,grant_type:"refresh_token",refresh_token:grant.refreshToken}),cache:"no-store",signal:AbortSignal.timeout(12000)});
  const data=await response.json();
  if(!response.ok||!data.access_token||data.open_id!==connection.externalId)throw new Error("TikTok could not renew this account. Reconnect it in Settings.");
  const updated={...grant,accessToken:data.access_token,refreshToken:data.refresh_token||grant.refreshToken,scope:data.scope||grant.scope,expiresAt:Date.now()+Number(data.expires_in||86400)*1000};
  const saved=await prisma.socialConnection.updateMany({where:{id:connection.id,organizationId:connection.organizationId,encryptedToken:connection.encryptedToken,status:"connected"},data:{encryptedToken:encryptSecret(JSON.stringify(updated))}});
  if(saved.count!==1)throw new Error("TikTok connection changed. Reopen the posting screen.");
  return String(data.access_token);
}
export async function tikTokJson(path:string,token:string,body:unknown={}){
  if(!["creator_info/query","video/init","status/fetch"].includes(path))throw new Error("Unsupported TikTok operation.");
  const response=await fetch(`https://open.tiktokapis.com/v2/post/publish/${path}/`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json; charset=UTF-8"},body:JSON.stringify(body),cache:"no-store",signal:AbortSignal.timeout(12000)});
  const result=await response.json();
  if(!response.ok||result.error?.code!=="ok"){
    const code=String(result.error?.code||"request_failed");
    if(code==="scope_not_authorized")throw new Error("Reconnect TikTok and approve video posting. The TikTok developer app must have Content Posting API enabled.");
    if(code==="url_ownership_unverified")throw new Error("The app administrator must verify rumisocialai.com in TikTok's URL properties before video posting.");
    if(code.includes("unaudited")||code.includes("unauthorized_client"))throw new Error("TikTok app approval is required for this posting option. Check the developer app's Direct Post approval.");
    throw new Error(`TikTok could not complete this request (${code}).`);
  }
  return result.data;
}
export async function tikTokCreator(token:string):Promise<TikTokCreator>{
  const data=await tikTokJson("creator_info/query",token);
  if(!Array.isArray(data?.privacy_level_options)||!data.privacy_level_options.length||!Number.isFinite(data.max_video_post_duration_sec)||typeof data.creator_nickname!=="string")throw new Error("TikTok is not accepting posts for this account right now.");
  if(process.env.TIKTOK_PUBLIC_POSTING_APPROVED!=="true")data.privacy_level_options=data.privacy_level_options.filter((value:string)=>value==="SELF_ONLY");
  if(!data.privacy_level_options.length)throw new Error("TikTok public posting approval is still needed for this app.");
  return data;
}
