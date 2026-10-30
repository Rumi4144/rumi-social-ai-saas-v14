import { NextResponse } from "next/server";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";
import { apiError } from "@/lib/http/errors";
export async function GET() {
  try {
    const ctx = await tenantContext();
    const brand = await prisma.brand.findFirst({ where: { organizationId: ctx.organizationId }, select: { name: true, industry: true, websiteUrl: true, description: true, targetAudience: true, onboardingCompleted: true }, orderBy: { createdAt: "desc" } });
    return NextResponse.json({ brand, canManage: ctx.isSuperAdmin || ["owner", "admin"].includes(ctx.role) }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error, "Could not load your business profile."); }
}
