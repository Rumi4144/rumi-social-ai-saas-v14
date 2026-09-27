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

const concepts = [
  "editorial hero composition",
  "aspirational lifestyle scene",
  "dramatic close-up detail",
  "symbolic visual metaphor",
  "environmental storytelling",
  "premium commercial photography",
  "dynamic depth and perspective",
  "minimal but visually striking composition",
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

  const concept =
    concepts[Math.abs(variationIndex) % concepts.length];

  const palette = [
    brand.primaryColor,
    brand.secondaryColor,
    brand.accentColor,
  ]
    .filter(Boolean)
    .join(", ");

  return `
VISUAL DIRECTOR

Create a distinctive, premium, scroll-stopping visual for:
Brand: ${brand.name}
Campaign goal: ${campaignGoal || "brand communication"}
Platform: ${platform || "social media"}
Content type: ${contentType || "social post"}
Headline context: ${headline || "none"}

CREATIVE CONCEPT
Use a ${concept}.
${visualDirection ? `Creative direction: ${visualDirection}` : ""}

BRAND DNA
Voice: ${brand.voice || "professional, engaging and human"}
Positioning: ${brand.positioning || "premium and trustworthy"}
Design style: ${brand.designStyle || "contemporary premium"}
Brand palette: ${palette || "derive a sophisticated palette appropriate to the brand"}
Existing visual rules: ${brand.visualRules || "none provided"}

VISUAL QUALITY
Create an image with immediate visual impact and a strong focal point.
Use sophisticated color contrast, dimensional lighting, depth,
texture and intentional composition.

The image should feel professionally art-directed rather than
generic stock photography.

Choose color intensity appropriate to the brand and subject.
Do NOT automatically make every brand beige, muted or minimalist.
Use richer color and stronger contrast when appropriate.

Maintain premium color harmony. Brand colors may inspire accents,
lighting or environmental details without overwhelming the image.

VARIETY
Avoid repetitive compositions, props, camera angles and visual clichés.
Do not default to the same room, desk, object or centered composition.
This creative should feel meaningfully different from other campaign images.

COMPOSITION
Create intentional negative space suitable for professional headline
and CTA placement while keeping the primary subject visually strong.

Avoid clutter and awkward cropping.
Use professional advertising composition and realistic depth.

RELEVANCE
The image must communicate the idea or emotion behind the campaign,
not merely decorate it.

Use visual metaphors, environments, products, people or abstract
elements only when appropriate to this specific brand and message.

AVOID
Avoid generic stock-photo appearance.
Avoid dull, muddy or unintentionally monochromatic color.
Avoid cliché imagery unless specifically relevant to the brand.
Avoid excessive beige, gray or brown unless the brand genuinely calls for it.
Avoid repetitive wellness, office, laptop, handshake, meditation,
clock or generic lifestyle imagery unless directly appropriate.

OUTPUT RULES
Generate ONLY the underlying photography or artwork.
Do not generate typography, words, letters, numbers, logos,
watermarks, signatures, labels, UI elements or brand names inside the image.
Rumi Social AI will apply typography and branding afterward.
`.trim();
}
