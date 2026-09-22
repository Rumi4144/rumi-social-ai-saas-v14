import { NextResponse } from "next/server";
import { z } from "zod";
import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { tenantContext } from "@/lib/auth/context";

const S = z.object({
  campaignId: z.string().optional(),
  contentItemId: z.string().optional(),
  prompt: z.string().min(10),
  format: z.enum(["square", "portrait", "story"]).default("square"),
});

export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();

    const p = S.safeParse(await req.json());

    if (!p.success) {
      return NextResponse.json(
        { error: p.error.flatten() },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY_MISSING" },
        { status: 500 }
      );
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const size =
      p.data.format === "square"
        ? "1024x1024"
        : "1024x1536";

    const result = await client.images.generate({
      model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
      prompt: p.data.prompt,
      size,
      quality: "medium",
      output_format: "png",
      n: 1,
    });

    const base64 = result.data?.[0]?.b64_json;

    if (!base64) {
      throw new Error("IMAGE_GENERATION_EMPTY");
    }

    const dataUrl = `data:image/png;base64,${base64}`;

    const existingAsset = p.data.contentItemId
      ? await prisma.mediaAsset.findFirst({
          where: {
            organizationId: ctx.organizationId,
            contentItemId: p.data.contentItemId,
            kind: "ai_image",
            provider: "openai",
          },
          orderBy: {
            createdAt: "desc",
          },
        })
      : null;

    const assetData = {
      organizationId: ctx.organizationId,
      campaignId: p.data.campaignId,
      contentItemId: p.data.contentItemId,
      kind: "ai_image",
      provider: "openai",
      status: "ready",
      url: dataUrl,
      prompt: p.data.prompt,
      metadata: {
        model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
        format: p.data.format,
        size,
      },
    };

    const asset = existingAsset
      ? await prisma.mediaAsset.update({
          where: { id: existingAsset.id },
          data: assetData,
        })
      : await prisma.mediaAsset.create({
          data: assetData,
        });

    return NextResponse.json({
      assetId: asset.id,
      url: dataUrl,
      format: p.data.format,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "IMAGE_GENERATION_FAILED";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
