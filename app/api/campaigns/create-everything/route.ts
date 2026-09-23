import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { spendCredits } from "@/lib/services/credits";
import { tenantContext } from "@/lib/auth/context";
import { z } from "zod";

const S = z.object({
  organizationId: z.string().optional(),
  brandId: z.string().optional(),
  brief: z.string().min(10),
  goal: z.string().default("launch"),
  days: z.number().int().min(1).max(30).default(14),
  photoSource: z.enum(["website", "ai"]).default("ai"),
  imageUrl: z.string().url().optional(),
  imageUrls: z.array(z.string().url()).max(20).optional(),
});

export async function POST(req: Request) {
  const p = S.safeParse(await req.json());

  if (!p.success) {
    return NextResponse.json(
      { error: p.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const ctx = await tenantContext();

    let brand;

    if (p.data.brandId) {
      brand = await prisma.brand.findFirst({
        where: {
          id: p.data.brandId,
          organizationId: ctx.organizationId,
        },
      });
    } else {
      brand = await prisma.brand.findFirst({
        where: {
          organizationId: ctx.organizationId,
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }

    if (!brand) {
      return NextResponse.json(
        { error: "No Brand Brain found for this workspace" },
        { status: 404 }
      );
    }

    const campaign = await prisma.campaign.create({
      data: {
        brandId: brand.id,
        title: p.data.brief.slice(0, 70),
        goal: p.data.goal,
        status: "generating",
      },
    });

    await spendCredits(
      ctx.organizationId,
      p.data.photoSource === "website" ? 1 : 3,
      p.data.photoSource === "website"
        ? "campaign_generation_website_photo"
        : "campaign_generation",
      campaign.id
    );

    const job = await prisma.job.create({
      data: {
        organizationId: ctx.organizationId,
        type: "CREATE_EVERYTHING",
        payload: {
          campaignId: campaign.id,
          brief: p.data.brief,
          goal: p.data.goal,
          days: p.data.days,
        photoSource: p.data.photoSource,
        imageUrl: p.data.imageUrl,
        imageUrls: p.data.imageUrls,
        },
      },
    });

    return NextResponse.json(
      {
        campaignId: campaign.id,
        jobId: job.id,
        brandId: brand.id,
        status: "queued",
      },
      { status: 202 }
    );
  } catch (e) {
    const m = e instanceof Error ? e.message : "Unable to queue campaign";

    return NextResponse.json(
      { error: m },
      {
        status:
          m === "UNAUTHENTICATED"
            ? 401
            : m === "FORBIDDEN"
              ? 403
              : 402,
      }
    );
  }
}
