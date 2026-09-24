import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { superAdminContext } from "@/lib/admin/context";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";

const S = z.object({
  email: z.string().trim().email(),
  role: z.enum(["owner", "admin", "member"]),
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await superAdminContext();

    const { id: organizationId } = await params;
    const parsed = S.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const email = parsed.data.email.toLowerCase();
    const role = parsed.data.role;

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
      },
    });

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingUser) {
      const existingMembership = await prisma.membership.findUnique({
        where: {
          userId_organizationId: {
            userId: existingUser.id,
            organizationId,
          },
        },
      });

      if (existingMembership) {
        return NextResponse.json(
          { error: "This user already belongs to this organization." },
          { status: 409 },
        );
      }
    }

    // Invalidate previous unused invitations for this email/org.
    await prisma.invitation.deleteMany({
      where: {
        organizationId,
        email,
        acceptedAt: null,
      },
    });

    const token = randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);

    const invitation = await prisma.invitation.create({
      data: {
        organizationId,
        email,
        role,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const inviteUrl = `${baseUrl}/invite/${token}`;

    return NextResponse.json({
      ok: true,
      invitationId: invitation.id,
      organization: organization.name,
      email,
      role,
      inviteUrl,
      expiresAt: invitation.expiresAt,
    });
  } catch (error: any) {
    const message = error?.message || "Could not create invitation";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    console.error("ADMIN_INVITATION_ERROR", error);

    return NextResponse.json(
      { error: "Could not create invitation" },
      { status: 500 },
    );
  }
}
