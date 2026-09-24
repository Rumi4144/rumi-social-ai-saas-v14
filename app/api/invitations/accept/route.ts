import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { z } from "zod";

const S = z.object({
  token: z.string().min(20),
  name: z.string().trim().min(2),
  password: z.string().min(8),
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  try {
    const parsed = S.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const tokenHash = hashToken(parsed.data.token);

    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: "Invitation is invalid." },
        { status: 404 },
      );
    }

    if (invitation.acceptedAt) {
      return NextResponse.json(
        { error: "Invitation has already been accepted." },
        { status: 409 },
      );
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "Invitation has expired." },
        { status: 410 },
      );
    }

    const email = invitation.email.trim().toLowerCase();

    const result = await prisma.$transaction(async (tx: any) => {
      let user = await tx.user.findUnique({
        where: { email },
      });

      if (!user) {
        const passwordHash = await bcrypt.hash(parsed.data.password, 12);

        user = await tx.user.create({
          data: {
            email,
            name: parsed.data.name.trim(),
            passwordHash,
          },
        });
      } else {
        if (!user.passwordHash) {
          throw new Error("EXISTING_ACCOUNT_REQUIRES_LOGIN");
        }

        const passwordMatches = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );

        if (!passwordMatches) {
          throw new Error("INVALID_PASSWORD");
        }
      }

      await tx.membership.upsert({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: invitation.organizationId,
          },
        },
        update: {
          role: invitation.role,
        },
        create: {
          userId: user.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: {
          acceptedAt: new Date(),
        },
      });

      return user;
    });

    return NextResponse.json({
      ok: true,
      email: result.email,
      loginUrl: "/login",
    });
  } catch (error) {
    console.error("INVITATION_ACCEPT_ERROR", error);

    return NextResponse.json(
      { error: "Could not accept invitation." },
      { status: 500 },
    );
  }
}
