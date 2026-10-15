import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
export async function GET() {
  try {
    const ctx = await tenantContext();
    const brand = await prisma.brand.findFirst({ where: { organizationId: ctx.organizationId }, select: { name: true, industry: true }, orderBy: { id: "asc" } });
    return NextResponse.json({ brand }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error, "Could not load your business profile."); }
}
