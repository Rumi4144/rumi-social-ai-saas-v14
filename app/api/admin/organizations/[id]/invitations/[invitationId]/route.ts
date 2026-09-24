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

export async function POST(
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
        acceptedAt: null,
      },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Pending invitation not found." },
        { status: 404 },
      );
    }

    const { randomBytes, createHash } = await import("crypto");

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const replacement = await prisma.$transaction(async (tx) => {
      await tx.invitation.delete({
        where: { id: invitation.id },
      });

      return tx.invitation.create({
        data: {
          organizationId,
          email: invitation.email,
          role: invitation.role,
          tokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    return NextResponse.json({
      ok: true,
      invitationId: replacement.id,
      email: replacement.email,
      role: replacement.role,
      inviteUrl: `${baseUrl}/invite/${token}`,
      expiresAt: replacement.expiresAt,
    });
  } catch (error: any) {
    const message = error?.message || "Could not regenerate invitation.";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    console.error("ADMIN_INVITATION_REGENERATE_ERROR", error);

    return NextResponse.json(
      { error: "Could not regenerate invitation." },
      { status: 500 },
    );
  }
}
