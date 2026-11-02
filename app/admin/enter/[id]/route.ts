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
  } catch (error) {
    const code = error && typeof error === "object" && "message" in error ? String(error.message) : "";
    if (code === "UNAUTHENTICATED") return NextResponse.redirect(new URL("/login", request.url));
    if (code === "FORBIDDEN") return NextResponse.json({ error: "Administrator access is required." }, { status: 403 });
    console.error("ADMIN_WORKSPACE_ENTRY_FAILED");
    return NextResponse.json({ error: "The workspace could not be opened. Return to Admin and try again." }, { status: 503 });
  }
}
