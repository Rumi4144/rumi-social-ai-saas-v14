import { NextResponse } from "next/server";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "caption"],
  properties: {
    headline: { type: "string" },
    caption: { type: "string" },
  },
};

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await tenantContext();
    const { id } = await params;

    const item = await prisma.contentItem.findFirst({
      where: {
        id,
        campaign: {
          brand: {
            organizationId: ctx.organizationId,
          },
        },
      },
      include: {
        campaign: {
          include: {
            brand: true,
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

    const onboarding = await prisma.onboardingState.findUnique({
      where: {
        organizationId: ctx.organizationId,
      },
      select: {
        businessType: true,
        website: true,
        goal: true,
      },
    });

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY_MISSING");
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const brand = item.campaign.brand;

    const prompt = `Rewrite one social media post for this brand.

Brand: ${brand.name}
Brand voice: ${brand.voice || "professional, distinctive"}
Positioning: ${brand.positioning || ""}
Preferred words: ${brand.preferredWords || ""}
Banned words/claims: ${brand.bannedWords || ""}
Business type: ${onboarding?.businessType || ""}
Website: ${onboarding?.website || ""}
Long-term business goal: ${onboarding?.goal || ""}

Campaign goal: ${item.campaign.goal}
Platform: ${item.platform}
Post type: ${item.type}

Current headline:
${item.headline || ""}

Current caption:
${item.caption || ""}

Create a genuinely fresh alternative, not a light paraphrase.
Write naturally for the specified platform.
Keep the brand voice and positioning.
Make the opening hook distinct from the current version.
Keep the copy commercially useful but factual.
Do not invent specifications, prices, awards, reviews, scarcity,
guarantees, medical claims, performance claims, or other facts
that were not supplied.
If a website is available, it may be used for the call to action,
but do not claim facts merely because a URL was provided.

Return a concise headline and complete caption.`;

    const response = await client.responses.create({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-luna",
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: "regenerated_social_post",
          strict: true,
          schema,
        },
      },
    });

    if (!response.output_text) {
      throw new Error("EMPTY_AI_RESPONSE");
    }

    const generated = JSON.parse(response.output_text) as {
      headline: string;
      caption: string;
    };

    const updated = await prisma.contentItem.update({
      where: { id },
      data: {
        headline: generated.headline.trim(),
        caption: generated.caption.trim(),
      },
    });

    return NextResponse.json({
      ok: true,
      item: updated,
    });
  } catch (error) {
    console.error("REGENERATE_CAPTION_ERROR", error);

    const message =
      error instanceof Error ? error.message : "Could not regenerate caption.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
