import {NextResponse} from "next/server";
import {sandboxContext,sandboxConnection,sandboxAccessToken,sandboxCreator,sandboxAsset} from "@/lib/tiktok/sandbox";
export async function GET(req:Request){
 try{
  const ctx=await sandboxContext(),query=new URL(req.url).searchParams;
  const connection=await sandboxConnection(ctx.organizationId);
  if(query.get("connectionId")!==connection.id||query.get("accountId")!==connection.externalId)throw new Error("Choose the connected test account again.");
  const {asset,item,duration}=await sandboxAsset(ctx.organizationId,query.get("assetId")||"");
  if(query.get("contentItemId")!==item.id)throw new Error("Choose this business's saved reel again.");
  const creator=await sandboxCreator(await sandboxAccessToken(connection));
  return NextResponse.json({creator,publicPostingApproved:false,post:{title:item.caption||item.headline||"",duration,videoUrl:`/api/video/media/${asset.id}`}},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Could not load test options."},{status:409});}
}
