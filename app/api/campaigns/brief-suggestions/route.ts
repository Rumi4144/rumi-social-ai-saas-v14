import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { apiError } from "@/lib/http/errors";
import { briefSuggestions } from "@/lib/campaign/brief-suggestions";

export async function GET() {
  try {
    const ctx = await tenantContext();
    const brand = await prisma.brand.findFirst({where:{organizationId:ctx.organizationId},orderBy:{createdAt:"desc"},select:{name:true,industry:true,description:true}});
    const current = brand || {name:ctx.organization.name};
    return NextResponse.json({organizationId:ctx.organizationId,brandName:current.name,suggestions:briefSuggestions(current)},{headers:{"Cache-Control":"no-store"}});
  } catch(error) {return apiError(error,"Unable to load campaign suggestions.");}
}
