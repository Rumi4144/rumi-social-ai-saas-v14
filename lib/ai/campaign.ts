import OpenAI from "openai";
import { buildVisualConcept, type RecentVisualConcept } from "./visual-plan";
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
    platforms: string[];
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
          "platforms",
          "headline",
          "caption",
          "visualDirection",
        ],
        properties: {
          day: { type: "integer" },
          type: { type: "string" },
          platforms: {
          type: "array",
          minItems: 1,
          items: { type: "string" },
        },
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
      minItems: 5,
      maxItems: 5,
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
  recentConcepts?: RecentVisualConcept[];
  dailyPlan?: Array<{
    day: number;
    date: string;
    specialDay?: string | null;
    platforms: string[];
  }>;
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
    industry?: string | null;
    description?: string | null;
    targetAudience?: string | null;
    contentGoals?: string | null;
    postingFrequency?: string | null;
    approvalRequired?: boolean;
    website?: string | null;
    primaryGoal?: string | null;
  };
}) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY_MISSING");
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const scheduleContext =
    input.dailyPlan?.length
      ? input.dailyPlan
          .map((item) => {
            const special = item.specialDay
              ? ` | Special day: ${item.specialDay}`
              : "";

            const platforms = item.platforms.length
              ? item.platforms.join(", ")
              : "none";

            return `Day ${item.day} | Date: ${item.date}${special} | Platforms: ${platforms}`;
          })
          .join("\n")
      : "No day-by-day publishing plan supplied.";

  const prompt = `Create a complete ${input.days}-day social campaign for ${input.brand.name}.
Brief: ${input.brief}
Goal: ${input.goal}

DAILY PUBLISHING PLAN:
${scheduleContext}

Treat the DAILY PUBLISHING PLAN as authoritative scheduling context.
For each numbered campaign day, create EXACTLY ONE primary social post.
That single daily post must be suitable for distribution to ALL platforms selected for that day.
Do NOT create duplicate Facebook, Instagram, LinkedIn, or other platform-specific versions of the same day's post.
The selected platforms are publishing destinations for the daily post, not instructions to create additional posts.
For a 7-day campaign, return EXACTLY 7 primary posts: one post for each campaign day.
Each day's post must have its own distinct creative angle, headline, caption, call-to-action, and visual concept while maintaining one coherent campaign strategy.
Use the supplied calendar date as context for that day's creative.

When a Special day is supplied, consider it an optional creative opportunity, not a mandatory promotion.
Use the occasion only when it is relevant and appropriate to the brand, campaign objective, audience and brief.
Do not force holiday language, discounts, sales, religious messaging or promotional claims merely because a special day appears on the calendar.
If the special day is relevant, make that day's concept meaningfully specific to the occasion rather than adding the holiday name superficially.
Maintain campaign continuity and creative variety across surrounding days.

Brand voice: ${input.brand.voice || "professional, distinctive"}
Positioning: ${input.brand.positioning || ""}
Business type: ${input.businessContext?.businessType || ""}
Industry: ${input.businessContext?.industry || ""}
Website: ${input.businessContext?.website || ""}
Business description: ${input.businessContext?.description || ""}
Target audience: ${input.businessContext?.targetAudience || ""}
Brand content goals: ${input.businessContext?.contentGoals || ""}
Long-term business goal: ${input.businessContext?.primaryGoal || ""}
Preferred publishing frequency: ${input.businessContext?.postingFrequency || ""}
Publishing approval: ${
  input.businessContext?.approvalRequired === false
    ? "Auto-publish approved campaigns"
    : "Review every post before publishing"
}
Preferred words: ${input.brand.preferredWords || ""}
Banned words/claims: ${input.brand.bannedWords || ""}
Visual rules: ${input.brand.visualRules || ""}
Use the Brand Brain and business context as persistent background context.
VISUAL SUBJECT PLANNING:
Plan distinct primary subjects across daily posts as well as Stories. Do not make every post a product hero or treat a service benefit as an arbitrary physical object.
${Array.from({ length: input.days }, (_, index) => {
  const context = input.businessContext || {};
  const concept = buildVisualConcept({ businessContext: context, variationIndex: index, recentConcepts: input.recentConcepts });
  return `Day ${index + 1}: ${concept.subjectCategory} — ${concept.direction}`;
}).join("\n")}
Business context and recent concepts for this brand only: ${JSON.stringify({ business: input.businessContext || {}, recentConcepts: (input.recentConcepts || []).slice(-6) })}
The subject plan is adapted to this business. For real-photo campaigns, describe the supplied photographs honestly; do not imply a new generated scene or product.
The current brief and campaign goal determine this campaign's specific objective.
Write each platform post natively for that platform rather than repeating one caption.
Vary hooks, creative angles, captions, calls-to-action, and visual concepts while maintaining one coherent campaign strategy.
Follow the brand voice, positioning, preferred words, banned words/claims, and visual rules.
Use the website only as business context. Never invent facts, product details, prices, reviews, guarantees, or claims that were not supplied.
Make calls-to-action appropriate to the campaign objective and business type.


STORY SEQUENCE RULES:
If Instagram is selected on at least one day in the DAILY PUBLISHING PLAN, create EXACTLY 5 Instagram Story slides.
If Instagram is not selected anywhere in the DAILY PUBLISHING PLAN, return an empty stories array.
The Story sequence is a campaign-level creative asset and does not override the per-day platform selections above.

Treat the five Stories as one coherent visual sequence, not five
variations of the same image or message.

Story 1: attention-grabbing emotional hook.
Story 2: introduce a new perspective, benefit, question or useful idea.
Story 3: use a human, product, lifestyle, environment or detail-led
moment appropriate to the specific brand.
Story 4: deepen the campaign idea using a distinctly different visual concept.
Story 5: conclude the sequence with an appropriate call-to-action.

VISUAL VARIETY:
Every Story must have a meaningfully different visualDirection.

Across the five Stories, deliberately vary:
- primary subject
- setting or environment
- camera distance and angle
- lighting
- dominant colors
- composition
- visual metaphor
- use of people versus objects/environment

Do NOT generate five variations of the same person, landscape,
sunrise, room, product angle or symbolic metaphor.

The five images should look like one professionally art-directed campaign
while providing obvious visual progression from Story 1 through Story 5.

These rules must adapt to the specific Brand Brain, business type,
campaign objective and message. Do not force one visual style across
different customer accounts.

Create a short, distinctive campaign title of 4 to 9 words in the title field. Do not copy the brief verbatim. Do not begin the title with generic instructions such as "Launch", "Create", "Promote", or "Generate". The title should feel like a professional campaign name and reflect the product, service, story, or central creative idea. Be commercially useful but factual. Never invent product specifications, certifications, awards, customer reviews, scarcity, prices, materials, provenance, medical claims, guarantees or performance claims not supplied in the brief. Make the content varied rather than repeating one caption.`;
  const response = await client.responses.create({
    model: process.env.OPENAI_TEXT_MODEL || "gpt-5.6-luna",
    reasoning: {
      effort: "low",
    },
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
