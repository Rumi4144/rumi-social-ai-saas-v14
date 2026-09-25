import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { superAdminContext } from "@/lib/admin/context";
import { z } from "zod";

const S = z.object({
  status: z.enum(["active", "suspended"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await superAdminContext();

    const { id } = await params;
    const parsed = S.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const organization = await prisma.organization.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!organization) {
      return NextResponse.json(
        { error: "Organization not found." },
        { status: 404 },
      );
    }

    const updated = await prisma.organization.update({
      where: { id },
      data: { status: parsed.data.status },
      select: {
        id: true,
        name: true,
        status: true,
      },
    });

    return NextResponse.json({
      ok: true,
      organization: updated,
    });
  } catch (error: any) {
    const message = error?.message || "Could not update organization.";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: message }, { status: 401 });
    }

    if (message === "FORBIDDEN") {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    console.error("ADMIN_ORGANIZATION_STATUS_ERROR", error);

    return NextResponse.json(
      { error: "Could not update organization." },
      { status: 500 },
    );
  }
}
