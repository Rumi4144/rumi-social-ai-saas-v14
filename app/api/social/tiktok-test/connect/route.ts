import {NextResponse} from "next/server";
import {sandboxConfig,sandboxContext} from "@/lib/tiktok/sandbox";
import {createTikTokOAuthState} from "@/lib/social/oauth-state";
export async function GET(){
 try{
  const ctx=await sandboxContext(),config=sandboxConfig();
  const state=createTikTokOAuthState({userId:ctx.userId,organizationId:ctx.organizationId,redirectUri:config.redirectUri,environment:"sandbox"});
  const params=new URLSearchParams({client_key:config.clientKey,response_type:"code",scope:"user.info.basic,video.publish",redirect_uri:config.redirectUri,state});
  const response=NextResponse.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params}`);
  response.cookies.set("tiktok_test_oauth",state,{httpOnly:true,secure:new URL(config.origin).protocol==="https:",sameSite:"lax",path:"/api/social/tiktok-test",maxAge:600});
  return response;
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not start TikTok test connection."},{status:403});}
}
