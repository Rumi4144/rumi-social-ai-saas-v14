import { NextResponse } from "next/server";
import OpenAI from "openai";
import { z } from "zod";
import { tenantContext } from "@/lib/auth/context";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({ productId: z.string().min(1) });
const responseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "subheadline", "cta"],
  properties: {
    headline: { type: "string" },
    subheadline: { type: "string" },
    cta: { type: "string" },
  },
};

export async function POST(req: Request) {
  try {
    const ctx = await tenantContext();
    if (!ctx.isSuperAdmin || ctx.role === "viewer") {
      return NextResponse.json({ error: "Creative controls are not available to this account." }, { status: 403 });
    }

    const parsed = requestSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Choose a product to create an ad." }, { status: 400 });

    const product = await prisma.product.findFirst({
      where: { id: parsed.data.productId, brand: { organizationId: ctx.organizationId } },
      include: { brand: true },
    });
    if (!product) return NextResponse.json({ error: "Product not found in this workspace." }, { status: 404 });
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "AI copy generation is not configured. Ask your administrator for help." }, { status: 503 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-luna",
      input: `Write concise on-image social ad copy for this product and brand.

Brand: ${product.brand.name}
Industry: ${product.brand.industry || ""}
Brand description: ${product.brand.description || ""}
Brand voice: ${product.brand.voice || "warm, distinctive and clear"}
Positioning: ${product.brand.positioning || ""}
Preferred words: ${product.brand.preferredWords || ""}
Words and claims to avoid: ${product.brand.bannedWords || ""}
Product: ${product.name}
Verified product description: ${product.description || "No additional verified product details were provided."}
Known price: ${product.price == null ? "not provided" : `${product.currency} ${product.price.toString()}`}

Create one elegant headline of at most 8 words, one supporting line of at most 16 words, and a short, natural call to action of at most 4 words. Make the copy specific to the supplied product and brand. Do not invent specifications, history, materials, awards, reviews, guarantees, scarcity, prices, or performance claims. Do not mention information that was not provided. Return only the requested JSON fields.`,
      text: {
        format: {
          type: "json_schema",
          name: "studio_product_ad_copy",
          strict: true,
          schema: responseSchema,
        },
      },
    });

    if (!response.output_text) throw new Error("AI returned no ad copy.");
    const copy = JSON.parse(response.output_text) as { headline: string; subheadline: string; cta: string };
    const clean = {
      headline: copy.headline.trim().slice(0, 140),
      subheadline: copy.subheadline.trim().slice(0, 280),
      cta: copy.cta.trim().slice(0, 40),
    };
    if (!clean.headline || !clean.subheadline || !clean.cta) throw new Error("AI returned incomplete ad copy.");
    return NextResponse.json(clean, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate ad copy.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
