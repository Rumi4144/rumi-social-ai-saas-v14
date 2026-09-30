import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";

const S = z.object({
  personName: z.string().min(2),
  role: z.string().min(1),
  brand: z.string().min(2),
  website: z.string().optional(),
  businessType: z.string().min(1),
  industry: z.string().optional(),
  description: z.string().optional(),
  targetAudience: z.string().optional(),
  voice: z.string().min(1),
  goal: z.string().min(1),
  postingFrequency: z.string().optional(),
  approvalRequired: z.boolean().default(true),
});

export async function POST(req: Request) {
  try {
    const p = S.safeParse(await req.json());

    if (!p.success) {
      return NextResponse.json(
        { error: p.error.flatten() },
        { status: 400 }
      );
    }

    const ctx = await tenantContext();

    await prisma.user.update({
      where: { id: ctx.userId },
      data: { name: p.data.personName },
    });

    await prisma.membership.updateMany({
      where: {
        userId: ctx.userId,
        organizationId: ctx.organizationId,
      },
      data: { role: p.data.role },
    });

    let brand = await prisma.brand.findFirst({
      where: {
        organizationId: ctx.organizationId,
      },
    });

    const brandData = {
      name: p.data.brand,
      voice: p.data.voice,
      positioning: `Primary goal: ${p.data.goal}`,
      industry: p.data.industry || null,
      websiteUrl: p.data.website || null,
      description: p.data.description || null,
      targetAudience: p.data.targetAudience || null,
      contentGoals: p.data.goal,
      postingFrequency: p.data.postingFrequency || null,
      approvalRequired: p.data.approvalRequired,
      onboardingCompleted: true,
    };

    if (brand) {
      brand = await prisma.brand.update({
        where: { id: brand.id },
        data: brandData,
      });
    } else {
      brand = await prisma.brand.create({
        data: {
          organizationId: ctx.organizationId,
          ...brandData,
        },
      });
    }

    await prisma.onboardingState.upsert({
      where: {
        organizationId: ctx.organizationId,
      },
      update: {
        step: 7,
        completed: true,
        businessType: p.data.businessType,
        website: p.data.website,
        goal: p.data.goal,
        completedAt: new Date(),
      },
      create: {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        step: 7,
        completed: true,
        businessType: p.data.businessType,
        website: p.data.website,
        goal: p.data.goal,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({
      brandId: brand.id,
      organizationId: ctx.organizationId,
      completed: true,
    });
  } catch (error: any) {
    console.error("ONBOARDING_COMPLETE_ERROR", error);

    const message =
      error instanceof Error
        ? error.message
        : "Could not complete onboarding";

    if (message === "UNAUTHENTICATED") {
      return NextResponse.json(
        {
          error: "Your session has expired. Please sign in again.",
          code: "UNAUTHENTICATED",
        },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: "Could not complete onboarding. Please try again.",
      },
      { status: 500 }
    );
  }
}
