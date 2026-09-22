import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";
import { z } from "zod";

const Schema = z.object({
  name: z.string().min(1),
  voice: z.string().optional(),
  positioning: z.string().optional(),
  preferredWords: z.string().optional(),
  bannedWords: z.string().optional(),
  visualRules: z.string().optional(),
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  accentColor: z.string().optional(),
  headingFont: z.string().optional(),
  bodyFont: z.string().optional(),
  designStyle: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    const parsed = Schema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const existing = await prisma.brand.findFirst({
      where: { organizationId: ctx.organizationId },
    });

    const brand = existing
      ? await prisma.brand.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.brand.create({
          data: {
            ...data,
            organizationId: ctx.organizationId,
          },
        });

    return NextResponse.json({
      ok: true,
      brand,
    });
  } catch (error: any) {
    console.error("BRAND_BRAIN_SAVE_ERROR", error);

    return NextResponse.json(
      { error: error?.message || "Could not save Brand Brain" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const ctx = await tenantContext();

    const brand = await prisma.brand.findFirst({
      where: {
        organizationId: ctx.organizationId,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!brand) {
      return NextResponse.json(
        { error: "BRAND_NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      brand,
    });
  } catch (error: any) {
    console.error("BRAND_BRAIN_LOAD_ERROR", error);

    return NextResponse.json(
      {
        error:
          error?.message || "Could not load Brand Brain",
      },
      { status: 500 }
    );
  }
}
