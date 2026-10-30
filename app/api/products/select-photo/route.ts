import { NextResponse } from "next/server";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
import { GET as catalog } from "@/app/api/video/presenter/products/route";
const schema = z.object({ campaignId: z.string().min(1), contentItemId: z.string().min(1), productId: z.string().min(1) });
export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (!ctx.isSuperAdmin) return NextResponse.json({ error: "Creative controls are available in Admin. Request a change from This Week." }, { status: 403 });
    if (ctx.role === "viewer") return NextResponse.json({error:"Your role cannot change posts."},{status:403});
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({error:"Choose a campaign post and website product."},{status:400});
    const p = parsed.data;
    const response = await catalog(new Request(new URL(`/api/video/presenter/products?campaignId=${encodeURIComponent(p.campaignId)}`,req.url),{headers:req.headers}));
    const data = await response.json();
    if (!response.ok) return NextResponse.json(data,{status:response.status});
    const product = data.products?.find((item: {id:string})=>item.id===p.productId) as {id:string;name:string;imageUrl?:string;sourceUrl?:string;description?:string}|undefined;
    if (!product?.imageUrl || !product.sourceUrl) return NextResponse.json({error:"Choose a product with an actual website photo."},{status:400});
    const result = await prisma.$transaction(async tx => {
      const item = await tx.contentItem.findFirst({where:{id:p.contentItemId,campaignId:p.campaignId,campaign:{brand:{organizationId:ctx.organizationId}}}});
      if (!item) return {status:404,error:"Post not found."};
      const active = await tx.publishJob.findFirst({where:{contentItemId:item.id,status:{in:["scheduled","retry","publishing","published"]}}});
      if(active||["scheduled","published"].includes(item.status))return {status:409,error:"Cancel scheduled posting before changing this product."};
      await tx.mediaAsset.updateMany({where:{organizationId:ctx.organizationId,campaignId:p.campaignId,contentItemId:item.id,status:"ready",kind:{in:["ai_image","product_photo","social_creative"]}},data:{status:"superseded"}});
      await tx.mediaAsset.create({data:{organizationId:ctx.organizationId,campaignId:p.campaignId,contentItemId:item.id,kind:"product_photo",provider:"website",url:product.imageUrl,prompt:product.name,metadata:{label:product.name,sourceUrl:product.sourceUrl,productId:product.id,userSelected:true}}});
      await tx.contentItem.update({where:{id:item.id},data:{headline:product.name.slice(0,200),caption:[product.description?.slice(0,4500),product.sourceUrl].filter(Boolean).join("\n\n"),mediaUrl:product.imageUrl,status:"draft"}});
      return {status:200};
    },{isolationLevel:"Serializable"});
    return NextResponse.json(result,{status:result.status});
  } catch(error){return apiError(error,"Could not select this product photo. Try again.");}
}
