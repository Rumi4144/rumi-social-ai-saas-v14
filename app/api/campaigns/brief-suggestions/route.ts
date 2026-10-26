import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { briefSuggestions } from "@/lib/campaign/brief-suggestions";
import { websiteBriefSuggestions } from "@/lib/campaign/website-topics";
export const maxDuration = 60;

export async function GET() {
  try {
    const ctx = await tenantContext();
    const brand = await prisma.brand.findFirst({where:{organizationId:ctx.organizationId},orderBy:{createdAt:"desc"},select:{id:true,name:true,industry:true,description:true,websiteUrl:true}});
    const current = brand || {name:ctx.organization.name};
    return NextResponse.json({organizationId:ctx.organizationId,draftScope:`${ctx.userId}:${ctx.organizationId}:${brand?.id || "brand"}`,brandName:current.name,website:brand?.websiteUrl||null,source:"brand",suggestions:briefSuggestions(current)},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {return apiError(error,"Unable to load campaign suggestions.");}
}
export async function POST(req:Request) {
  try {
    const ctx=await tenantContext();
    const body=await req.json();
    if(body.organizationId!==ctx.organizationId)return NextResponse.json({error:"Your workspace changed. Refresh this page first."},{status:409});
    const brand=await prisma.brand.findFirst({where:{organizationId:ctx.organizationId},orderBy:{createdAt:"desc"},select:{id:true,name:true,websiteUrl:true}});
    if(!brand?.websiteUrl)return NextResponse.json({error:"Add this business’s website in Brand Brain first."},{status:400});
    let suggestions;
    try {suggestions=await websiteBriefSuggestions(brand.name,brand.websiteUrl);}catch {return NextResponse.json({error:"We could not read this website. You can still use the business ideas or add your own topics."},{status:422});}
    if(!suggestions.length)return NextResponse.json({error:"No clear topics were found. Use the business ideas or add your own topics."},{status:422});
    return NextResponse.json({organizationId:ctx.organizationId,draftScope:`${ctx.userId}:${ctx.organizationId}:${brand?.id || "brand"}`,brandName:brand.name,website:brand.websiteUrl,source:"website",suggestions},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return apiError(error,"Unable to read website topics.");}
}
