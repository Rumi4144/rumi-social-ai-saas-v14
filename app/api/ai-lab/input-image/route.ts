import {tenantContext} from '@/lib/auth/context';
import {prisma} from '@/lib/prisma';
import {labCanRun} from '@/lib/ai-lab/catalog';
import {fetchPublicBytes} from '@/lib/reels/public-fetch';
import {apiError} from '@/lib/http/errors';
export async function GET(req:Request){
 try{
  const ctx=await tenantContext();if(!labCanRun(ctx.role, ctx.isSuperAdmin))throw new Error('FORBIDDEN');
  const id=new URL(req.url).searchParams.get('assetId')||'';
  const asset=await prisma.mediaAsset.findFirst({where:{id,organizationId:ctx.organizationId,kind:'ai_lab_input',status:'ready',createdAt:{gt:new Date(Date.now()-6*86400000)}}});
  if(!asset?.url||(asset.metadata as {kind?:string})?.kind!=='image')return new Response('Photo unavailable. Upload the original again.',{status:404});
  const {bytes,contentType}=await fetchPublicBytes(asset.url,20000000);
  if(!/^image\/(png|jpeg|webp)(?:;|$)/.test(contentType))return new Response('Image unavailable',{status:422});
  return new Response(new Uint8Array(bytes),{headers:{'Content-Type':contentType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(error){return apiError(error,'Could not load the product photo. Upload the original again.');}
}
