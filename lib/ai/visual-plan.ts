export type VisualBusinessContext = {
  businessType?: string | null;
  industry?: string | null;
  description?: string | null;
  targetAudience?: string | null;
};

export const subjectCategories = [
  "human", "lifestyle", "detail", "environment", "product", "conceptual",
] as const;
export type SubjectCategory = typeof subjectCategories[number];
export type VisualConcept = {
  subjectCategory: SubjectCategory;
  direction: string;
};
export type RecentVisualConcept = {
  subjectCategory?: string;
  direction?: string;
};

export function isSubjectCategory(value: unknown): value is SubjectCategory {
  return typeof value === "string" && subjectCategories.some(category => category === value);
}

export function businessVisualMode(context: VisualBusinessContext): "product" | "service" | "unknown" {
  const type = (context.businessType || "").toLowerCase();
  if (/service|coach|therap|consult|hypno/.test(type)) return "service";
  if (/product|retail|e.?commerce|shop|manufactur/.test(type)) return "product";
  const details = `${context.industry || ""} ${context.description || ""}`.toLowerCase();
  if (/hypno|therapy|therapist|coaching|consulting|counsel|professional services/.test(details)) return "service";
  if (/guitars?|instruments?|retail|furniture|apparel|jewell?ery|physical products/.test(details)) return "product";
  return "unknown";
}

export function buildVisualConcept(input: {
  businessContext: VisualBusinessContext;
  variationIndex: number;
  recentConcepts?: RecentVisualConcept[];
}): VisualConcept {
  const mode = businessVisualMode(input.businessContext);
  const categories = mode === "product"
    ? [...subjectCategories]
    : subjectCategories.filter(category => category !== "product");
  const recent = input.recentConcepts || [];
  const previous = recent.slice(-2).map(concept => concept.subjectCategory);
  const index = Number.isFinite(input.variationIndex) ? Math.abs(Math.trunc(input.variationIndex)) : 0;
  let subjectCategory = categories[index % categories.length];
  for (let offset = 0; offset < categories.length; offset++) {
    const candidate = categories[(index + offset) % categories.length];
    if (!previous.includes(candidate)) {
      subjectCategory = candidate;
      break;
    }
  }
  const directions: Record<SubjectCategory, string> = {
    human: "Make a person's meaningful action or interaction the primary subject. Connect it to the supplied business and message; an object must not be the hero. Do not imply a real customer, endorsement, practitioner, or employee.",
    lifestyle: "Make a believable everyday experience relevant to the audience the primary subject. Show a distinct action and setting rather than a product posed in another room. Do not invent a service, testimonial, facility, or outcome.",
    detail: mode === "product"
      ? "Use an expressive close-up of a supplied product detail, material, or hands interacting with it. Avoid another full-product hero photograph. Only show construction and features that were supplied."
      : "Use an expressive human gesture or moment of attention relevant to the message. Do not turn the service into a close-up of invented equipment or a symbolic object.",
    environment: "Show a relevant place through human activity and context. The activity and atmosphere tell the story; an empty room, chair, doorway, or unrelated object must not be the primary subject. Do not present an invented location as the business's premises.",
    product: "Make the actual supplied product the primary subject. Preserve its identity and features; do not redesign it or invent inventory. Choose a setting and angle different from recent concepts.",
    conceptual: "Express the message through a relevant human moment or abstract color, light, and movement. Do not replace an abstract benefit with a chair, road, doorway, clock, or arbitrary physical object. Do not invent measurable results or imply guarantees.",
  };
  return { subjectCategory, direction: directions[subjectCategory] };
}

export function buildVisualPlanPrompt(input: {
  businessContext: VisualBusinessContext;
  concept: VisualConcept;
  recentConcepts?: RecentVisualConcept[];
}): string {
  const recent = (input.recentConcepts || []).slice(-6);
  return `BUSINESS AND SUBJECT PLAN — AUTHORITATIVE
Business type: ${input.businessContext.businessType || "not supplied"}
Industry: ${input.businessContext.industry || "not supplied"}
Business description: ${input.businessContext.description || "not supplied"}
Audience: ${input.businessContext.targetAudience || "not supplied"}
Visual mode: ${businessVisualMode(input.businessContext)}
Primary subject category: ${input.concept.subjectCategory}
${input.concept.direction}
This subject plan takes priority over conflicting subject, product-hero, or no-people instructions in the original creative direction. Keep the campaign message and factual product information.
For a service business, human experience can communicate the service without an invented physical product or equipment. Background furniture may be incidental, never an unrelated hero.
Never mix another brand's products, services, claims, or identity into this image.
Recent concepts for THIS brand only (avoid their dominant subjects, actions, settings, and motifs):
${recent.length ? JSON.stringify(recent.map(item => ({ category: item.subjectCategory || "not recorded", direction: (item.direction || "").slice(0, 600) }))) : "No recent concepts recorded."}
Vary the subject and action, not merely lighting, palette, or camera angle.
This is creative planning; it is not proof that the generated image satisfies the plan.`;
}
