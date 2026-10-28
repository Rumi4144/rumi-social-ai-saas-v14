import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { instagramVideoUrl } from "@/lib/publishing/instagram-video-url";
export async function GET(req: Request) {
  try {
    const ctx = await tenantContext();
    const ids = [...new Set((new URL(req.url).searchParams.get("ids") || "").split(","))];
    if (!ids.length || ids.length > 6 || ids.some(id => !/^[a-zA-Z0-9-]{10,80}$/.test(id))) return Response.json({error:"Choose up to six saved videos."},{status:400});
    const assets = await prisma.mediaAsset.findMany({where:{id:{in:ids},organizationId:ctx.organizationId,status:"ready",kind:{in:["ai_video","campaign_video"]}},select:{id:true}});
    if (assets.length !== ids.length) return Response.json({error:"Video unavailable in this workspace."},{status:404});
    return Response.json({expiresInSeconds:3600, videos:ids.map(id => ({id,url:instagramVideoUrl(id,ctx.organizationId).replace('/api/video/instagram/','/api/video/download/')}))},{headers:{"Cache-Control":"private, no-store"}});
  } catch { return Response.json({error:"Could not prepare downloads."},{status:403}); }
}
