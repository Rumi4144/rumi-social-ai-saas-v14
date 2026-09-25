import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { superAdminContext } from "@/lib/admin/context";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";

const S = z.object({
  name: z.string().trim().min(2).max(100),
  ownerEmail: z.string().trim().email(),
  plan: z.string().trim().min(2).max(50).default("starter"),
  credits: z.number().int().min(0).max(100000).default(100),
});

function makeSlug(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") +
    "-" +
    Date.now().toString(36)
  );
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(req: Request) {
  try {
    await superAdminContext();

    const parsed = S.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const email = parsed.data.ownerEmail.toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    const token = existingUser ? null : randomBytes(32).toString("hex");

    const organization = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: parsed.data.name,
          slug: makeSlug(parsed.data.name),
          status: "active",
        },
      });

      await tx.subscription.create({
        data: {
          organizationId: org.id,
          plan: parsed.data.plan,
          status: "trialing",
          credits: parsed.data.credits,
        },
      });

      if (existingUser) {
        await tx.membership.create({
          data: {
            userId: existingUser.id,
            organizationId: org.id,
            role: "owner",
          },
        });
      } else if (token) {
        await tx.invitation.create({
          data: {
            organizationId: org.id,
            email,
            role: "owner",
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
      }

      return org;
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    return NextResponse.json(
      {
        ok: true,
        organization,
        ownerAttached: Boolean(existingUser),
        ownerEmail: email,
        inviteUrl: token ? `${baseUrl}/invite/${token}` : null,
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("ADMIN_CREATE_ORGANIZATION_ERROR", error);

    const message = error?.message || "Could not create organization.";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json(
      { error: "Could not create organization." },
      { status: 500 },
    );
  }
}
