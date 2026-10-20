import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {prisma} from "@/lib/prisma";
import {encryptSecret} from "@/lib/security/crypto";
import {verifyTikTokOAuthState} from "@/lib/social/oauth-state";
import {sandboxConfig,sandboxContext,sandboxProvider} from "@/lib/tiktok/sandbox";
export async function GET(req:Request){
 const destination=new URL("/settings/tiktok-test",process.env.NEXT_PUBLIC_APP_URL||"https://rumisocialai.com");
 try{
  const ctx=await sandboxContext(),config=sandboxConfig(),url=new URL(req.url);
  if(url.searchParams.get("error")){destination.searchParams.set("result","cancelled");return NextResponse.redirect(destination);}
  const code=url.searchParams.get("code"),stateValue=url.searchParams.get("state");
  if(!code||!stateValue)throw new Error("Invalid test authorization response.");
  const state=verifyTikTokOAuthState(stateValue);
  if(state.environment!=="sandbox"||state.redirectUri!==config.redirectUri||state.userId!==ctx.userId||state.organizationId!==ctx.organizationId||url.origin!==config.origin||(await cookies()).get("tiktok_test_oauth")?.value!==stateValue)throw new Error("The test authorization does not match this signed-in business.");
  const tokenResponse=await fetch("https://open.tiktokapis.com/v2/oauth/token/",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_key:config.clientKey,client_secret:config.clientSecret,grant_type:"authorization_code",code,redirect_uri:config.redirectUri}),cache:"no-store",signal:AbortSignal.timeout(12000)});
  const token=await tokenResponse.json();
  if(!tokenResponse.ok||!token.access_token||!token.open_id)throw new Error("TikTok did not finish test authorization.");
  if(!String(token.scope||"").split(/[ ,]+/).includes("video.publish"))throw new Error("Video posting permission was not granted to the test account.");
  const profileResponse=await fetch("https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name",{headers:{Authorization:`Bearer ${token.access_token}`},cache:"no-store",signal:AbortSignal.timeout(12000)});
  const profile=await profileResponse.json(),user=profile?.data?.user;
  if(!profileResponse.ok||user?.open_id!==token.open_id)throw new Error("TikTok could not verify the test account.");
  const encryptedToken=encryptSecret(JSON.stringify({environment:"sandbox",clientKey:config.clientKey,openId:token.open_id,accessToken:token.access_token,refreshToken:token.refresh_token,scope:token.scope,expiresAt:Date.now()+Number(token.expires_in||86400)*1000}));
  const existing=await prisma.socialConnection.findFirst({where:{organizationId:ctx.organizationId,provider:sandboxProvider}});
  const data={accountName:String(user.display_name||"TikTok test account"),externalId:String(token.open_id),status:"connected",encryptedToken};
  if(existing)await prisma.socialConnection.update({where:{id:existing.id},data});
  else await prisma.socialConnection.create({data:{organizationId:ctx.organizationId,provider:sandboxProvider,...data}});
  destination.searchParams.set("result","connected");
  const response=NextResponse.redirect(destination);response.cookies.set("tiktok_test_oauth","",{path:"/api/social/tiktok-test",maxAge:0});return response;
 }catch(error){
  // No provider response or token is included in browser URLs or logs.
  destination.searchParams.set("result","error");
  destination.searchParams.set("message",error instanceof Error?error.message:"Test connection failed.");
  return NextResponse.redirect(destination);
 }
}
