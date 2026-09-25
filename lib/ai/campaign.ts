import OpenAI from "openai";
export type CampaignPackage = {
  title: string;
  strategy: string;
  audience: string;
  hook: string;
  caption: string;
  cta: string;
  hashtags: string[];
  posts: {
    day: number;
    type: string;
    platform: string;
    headline: string;
    caption: string;
    visualDirection: string;
  }[];
  carousel: { headline: string; slides: string[] }[];
  stories: { frame: number; text: string; visualDirection: string }[];
  reel: {
    hook: string;
    voiceover: string;
    scenes: { seconds: number; prompt: string; onScreenText: string }[];
    cta: string;
  };
};
const schema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "strategy",
    "audience",
    "hook",
    "caption",
    "cta",
    "hashtags",
    "posts",
    "carousel",
    "stories",
    "reel",
  ],
  properties: {
    title: { type: "string" },
    strategy: { type: "string" },
    audience: { type: "string" },
    hook: { type: "string" },
    caption: { type: "string" },
    cta: { type: "string" },
    hashtags: { type: "array", items: { type: "string" } },
    posts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "day",
          "type",
          "platform",
          "headline",
          "caption",
          "visualDirection",
        ],
        properties: {
          day: { type: "integer" },
          type: { type: "string" },
          platform: { type: "string" },
          headline: { type: "string" },
          caption: { type: "string" },
          visualDirection: { type: "string" },
        },
      },
    },
    carousel: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "slides"],
        properties: {
          headline: { type: "string" },
          slides: { type: "array", items: { type: "string" } },
        },
      },
    },
    stories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["frame", "text", "visualDirection"],
        properties: {
          frame: { type: "integer" },
          text: { type: "string" },
          visualDirection: { type: "string" },
        },
      },
    },
    reel: {
      type: "object",
      additionalProperties: false,
      required: ["hook", "voiceover", "scenes", "cta"],
      properties: {
        hook: { type: "string" },
        voiceover: { type: "string" },
        scenes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["seconds", "prompt", "onScreenText"],
            properties: {
              seconds: { type: "integer" },
              prompt: { type: "string" },
              onScreenText: { type: "string" },
            },
          },
        },
        cta: { type: "string" },
      },
    },
  },
};
export async function generateCampaign(input: {
  brief: string;
  goal: string;
  days: number;
  brand: {
    name: string;
    voice?: string | null;
    positioning?: string | null;
    preferredWords?: string | null;
    bannedWords?: string | null;
    visualRules?: string | null;
  };
  businessContext?: {
    businessType?: string | null;
    website?: string | null;
    primaryGoal?: string | null;
  };
}) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY_MISSING");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = `Create a complete ${input.days}-day social campaign for ${input.brand.name}.
Brief: ${input.brief}
Goal: ${input.goal}
Brand voice: ${input.brand.voice || "professional, distinctive"}
Positioning: ${input.brand.positioning || ""}
Business type: ${input.businessContext?.businessType || ""}
Website: ${input.businessContext?.website || ""}
Long-term business goal: ${input.businessContext?.primaryGoal || ""}
Preferred words: ${input.brand.preferredWords || ""}
Banned words/claims: ${input.brand.bannedWords || ""}
Visual rules: ${input.brand.visualRules || ""}
Use the Brand Brain and business context as persistent background context.
The current brief and campaign goal determine this campaign's specific objective.
Write each platform post natively for that platform rather than repeating one caption.
Vary hooks, creative angles, captions, calls-to-action, and visual concepts while maintaining one coherent campaign strategy.
Follow the brand voice, positioning, preferred words, banned words/claims, and visual rules.
Use the website only as business context. Never invent facts, product details, prices, reviews, guarantees, or claims that were not supplied.
Make calls-to-action appropriate to the campaign objective and business type.

Create a short, distinctive campaign title of 4 to 9 words in the title field. Do not copy the brief verbatim. Do not begin the title with generic instructions such as "Launch", "Create", "Promote", or "Generate". The title should feel like a professional campaign name and reflect the product, service, story, or central creative idea. Be commercially useful but factual. Never invent product specifications, certifications, awards, customer reviews, scarcity, prices, materials, provenance, medical claims, guarantees or performance claims not supplied in the brief. Make the content varied rather than repeating one caption.`;
  const response = await client.responses.create({
    model: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-luna",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "campaign_package",
        strict: true,
        schema,
      },
    },
  });
  const text = response.output_text;
  if (!text) throw new Error("EMPTY_AI_RESPONSE");
  return JSON.parse(text) as CampaignPackage;
}
