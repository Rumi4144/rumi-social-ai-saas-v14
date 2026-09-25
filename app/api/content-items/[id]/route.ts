import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { z } from "zod";

const Schema = z.object({
  headline: z.string().min(1).max(200),
  caption: z.string().max(5000).optional().nullable(),
  status: z.enum(["draft", "approved", "scheduled", "published"]).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await tenantContext();
    const { id } = await params;

    const parsed = Schema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const item = await prisma.contentItem.findFirst({
      where: {
        id,
        campaign: {
          brand: {
            organizationId: ctx.organizationId,
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json(
        { error: "CONTENT_ITEM_NOT_FOUND" },
        { status: 404 },
      );
    }

    const updated = await prisma.contentItem.update({
      where: { id },
      data: {
        headline: parsed.data.headline.trim(),
        caption: parsed.data.caption?.trim() || null,
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      item: updated,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "CONTENT_ITEM_UPDATE_FAILED",
      },
      { status: 500 },
    );
  }
}
