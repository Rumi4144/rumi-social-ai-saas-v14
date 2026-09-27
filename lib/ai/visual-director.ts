type BrandVisualInput = {
  name: string;
  voice?: string | null;
  positioning?: string | null;
  visualRules?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  designStyle?: string | null;
};

type VisualDirectorInput = {
  brand: BrandVisualInput;
  campaignGoal?: string | null;
  platform?: string | null;
  contentType?: string | null;
  headline?: string | null;
  visualDirection?: string | null;
  variationIndex?: number;
};

const treatments = [
  {
    name: "Vibrant Editorial",
    direction:
      "Use rich sophisticated color, confident contrast, luminous highlights, and polished editorial advertising energy.",
  },
  {
    name: "Bright Lifestyle",
    direction:
      "Use fresh natural light, optimistic color, authentic environments, energetic depth, and an inviting contemporary lifestyle feeling.",
  },
  {
    name: "Cinematic",
    direction:
      "Use cinematic directional lighting, dimensional shadows, atmospheric depth, rich color separation, and a strong visual focal point.",
  },
  {
    name: "Brand-Dominant",
    direction:
      "Let the brand palette strongly influence accents, lighting, surfaces, wardrobe, or environment while maintaining natural photographic realism.",
  },
  {
    name: "Rich Luxury",
    direction:
      "Use refined materials, deep tonal range, premium lighting, elegant contrast, restrained richness, and sophisticated commercial art direction.",
  },
  {
    name: "Dynamic Contrast",
    direction:
      "Use strong foreground-background separation, complementary color contrast, unusual perspective, and immediate scroll-stopping visual impact.",
  },
  {
    name: "Natural Organic",
    direction:
      "Use expressive natural color, sunlight, organic textures, environmental depth, and an authentic but elevated photographic feeling.",
  },
  {
    name: "Conceptual",
    direction:
      "Translate the message into an original visual metaphor using color, light, scale, movement, environment, or symbolic objects without relying on clichés.",
  },
];

const compositions = [
  "asymmetrical editorial composition with generous negative space",
  "environmental storytelling with a strong foreground focal point",
  "dynamic off-center composition with layered depth",
  "close-up or detail-led composition with dramatic visual texture",
  "wide lifestyle composition with natural movement",
  "architectural composition using light, shadow and geometry",
  "cinematic perspective with foreground, subject and background separation",
  "minimal hero composition with one memorable visual idea",
];

export function buildVisualDirection(
  input: VisualDirectorInput
): string {
  const {
    brand,
    campaignGoal,
    platform,
    contentType,
    headline,
    visualDirection,
    variationIndex = 0,
  } = input;

  const index = Math.abs(variationIndex);

  const treatment =
    treatments[index % treatments.length];

  const composition =
    compositions[
      Math.floor(index / treatments.length) %
        compositions.length
    ];

  const palette = [
    brand.primaryColor,
    brand.secondaryColor,
    brand.accentColor,
  ]
    .filter(Boolean)
    .join(", ");

  return `
RUMI SOCIAL AI — VISUAL DIRECTOR V2

Create premium advertising imagery specifically for this brand and message.

BRAND
Name: ${brand.name}
Voice: ${brand.voice || "professional, engaging and human"}
Positioning: ${brand.positioning || "premium and trustworthy"}
Design style: ${brand.designStyle || "contemporary premium"}
Brand colors: ${palette || "derive an appropriate sophisticated palette"}
Existing visual rules: ${brand.visualRules || "none provided"}

CAMPAIGN
Goal: ${campaignGoal || "brand communication"}
Platform: ${platform || "social media"}
Content type: ${contentType || "social post"}
Message/headline: ${headline || "none"}

VISUAL TREATMENT
Treatment: ${treatment.name}
${treatment.direction}

COMPOSITION
Use ${composition}.

ORIGINAL CREATIVE DIRECTION
${visualDirection || "Interpret the campaign message visually."}

COLOR INTELLIGENCE
Choose a palette appropriate to this specific brand, audience and message.

Do not assume premium means beige, gray, brown, desaturated,
minimal or monochromatic.

When appropriate, introduce richer complementary colors,
environmental color, wardrobe color, colored light, sky,
nature, architectural color or tasteful accent elements.

Use brand colors intelligently as inspiration or accents.
Do not flood the entire image with one brand color.

Maintain excellent color harmony and professional advertising quality.

VISUAL ENERGY
The image must have a clear focal point and enough visual energy
to stop someone scrolling through a social feed.

Use light, color, contrast, depth, texture, movement or perspective
to create visual interest.

Avoid flat lighting and visually empty scenes unless deliberate
minimalism is strongly appropriate to the brand.

VARIETY ENGINE
This creative must not feel like a generic template.

Avoid repeatedly using:
- beige interiors
- empty chairs
- desks
- laptops
- coffee cups
- generic offices
- centered objects
- identical camera angles
- identical lighting
- generic meditation scenes
- clocks or pendulums
- handshake imagery

Choose subjects and environments based on the actual campaign idea.

EMOTIONAL STORYTELLING
Translate the campaign message into a visual emotion or story.

Depending on the brand and message, communicate qualities such as
possibility, aspiration, confidence, excitement, serenity,
craftsmanship, transformation, discovery, achievement,
connection or curiosity.

HUMAN IMAGERY
Use people only when they strengthen the idea.
When people are appropriate, favor authentic candid moments,
natural expression, believable environments and contemporary
commercial photography rather than staged stock-photo poses.

PRODUCT IMAGERY
When the campaign concerns a physical product, preserve the
product's identity and make it visually dominant.
Use lighting, environment and composition to elevate it rather
than inventing misleading product details.

TYPOGRAPHY SPACE
Reserve intentional clean negative space for Rumi Social AI
to add headline, brand name and CTA later.

Do not place important visual details where typography is likely
to be positioned.

SEMANTIC RELEVANCE GUARD
The image must accurately represent the actual brand, product, service,
and campaign message.

Never introduce a product, treatment, profession, facility, activity,
piece of equipment, or service that the business does not actually offer.

Before selecting the main subject, ask:
"Could this image cause a reasonable viewer to misunderstand what this
business actually does?"

If yes, choose another concept.

For service businesses, visualize the benefit, emotion, experience,
transformation, aspiration, or idea without inventing unrelated services.

For product businesses, preserve the correct product category and do not
substitute a visually similar but inaccurate product.

Prefer concepts directly supported by the campaign message and Brand DNA.

CLICHE FILTER
Avoid generic or overused visual shorthand when a more distinctive concept
can communicate the idea.

Avoid by default:
- stacked stones
- massage chairs or spa equipment unless actually relevant
- pendulums
- clocks
- generic meditation poses
- handshakes
- light bulbs
- puzzle pieces
- generic office meetings
- empty treatment rooms
- meaningless decorative objects

These may appear only when genuinely relevant to the specific business
and campaign.

QUALITY BAR
The result should resemble professionally art-directed advertising
or editorial photography—not generic AI imagery or stock photography.

It should be visually memorable even before typography is added.

STRICT OUTPUT RULES
Generate ONLY the underlying photography or artwork.

Absolutely no:
- words
- letters
- numbers
- typography
- logos
- brand names
- signatures
- watermarks
- labels
- UI elements

Rumi Social AI applies all typography and branding afterward.
`.trim();
}
