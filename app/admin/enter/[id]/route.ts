import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { superAdminContext } from "@/lib/admin/context";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await superAdminContext();

    const { id } = await params;

    const organization = await prisma.organization.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!organization) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }

    const campaignId = new URL(request.url).searchParams.get("campaignId");
    const campaign = campaignId ? await prisma.campaign.findFirst({ where: { id: campaignId, brand: { organizationId: organization.id } }, select: { id: true } }) : null;
    const response = NextResponse.redirect(
      new URL(campaign ? `/campaigns/${encodeURIComponent(campaign.id)}` : "/dashboard", request.url)
    );

    response.cookies.set("adminWorkspace", organization.id, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }
}
