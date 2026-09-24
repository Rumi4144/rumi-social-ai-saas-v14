import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { superAdminContext } from "@/lib/admin/context";

export async function DELETE(
  _req: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
      invitationId: string;
    }>;
  },
) {
  try {
    await superAdminContext();

    const { id: organizationId, invitationId } = await params;

    const invitation = await prisma.invitation.findFirst({
      where: {
        id: invitationId,
        organizationId,
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation not found." },
        { status: 404 },
      );
    }

    if (invitation.acceptedAt) {
      return NextResponse.json(
        { error: "Accepted invitations cannot be canceled." },
        { status: 409 },
      );
    }

    await prisma.invitation.delete({
      where: {
        id: invitation.id,
      },
    });

    return NextResponse.json({
      ok: true,
    });
  } catch (error: any) {
    const message = error?.message || "Could not cancel invitation.";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    console.error("ADMIN_INVITATION_DELETE_ERROR", error);

    return NextResponse.json(
      { error: "Could not cancel invitation." },
      { status: 500 },
    );
  }
}
