import { PHOTO_REALISM_DIRECTION } from "@/lib/ai/photo-realism";
import { PHOTO_LIGHTING_DIRECTION } from "@/lib/ai/photo-lighting";
import { reelProductSubject } from "@/lib/reels/product-identity";
import type { ScenePhotoPlan } from "@/lib/reels/reviewed-scene-photo";

const SHOTS = [
  "Establish the setting with a wide environmental photograph. Show the relevant activity or atmosphere, with generous depth and warm daylight.",
  "Move closer for a meaningful detail of the activity, materials or process. Use a different camera position and composition from the wide scene. Avoid prominent hands unless essential.",
  "Finish with a medium lifestyle or service scene showing the offering in everyday context. Use a clearly different setting or action from the first two scenes. Keep the mood inviting and natural.",
];

/** These three photos are included in weekly preparation, not three separate
 * customer purchases. Their saved job IDs also identify provider requests. */
export function weeklyScenePhotos(input: {
  campaignId: string; contentItemId: string; goal: string; headline: string; caption: string; direction: string;
  brand: { id: string; name: string; industry?: string | null; description?: string | null; targetAudience?: string | null; voice?: string | null; visualRules?: string | null };
}): ScenePhotoPlan[] {
  // An illustrative reel cannot claim to show an exact model without original
  // product photographs. Generic retail editorial topics are not model names.
  if (reelProductSubject({ headline: input.headline, caption: input.caption }, input.brand)) {
    throw new Error("This reel names a specific product. Use its original photo gallery, or request a business-focused reel before generating scene photos.");
  }
  return SHOTS.map((shot, index) => {
    const context = {
      brandId: input.brand.id, brandName: input.brand.name, headline: input.headline, caption: input.caption,
      business: [input.brand.industry, input.brand.description].filter(Boolean).join(": "), audience: input.brand.targetAudience || "",
      voice: input.brand.voice || "", visualRules: input.brand.visualRules || "", goal: input.goal, occasion: "",
      direction: `${shot}\nOverall visual idea: ${input.direction}`,
    };
    return {
      campaignId: input.campaignId, contentItemId: input.contentItemId,
      sceneId: `${input.contentItemId}-planned-${index + 1}`, sceneNumber: index + 1, context,
      prompt: `Create one vertical photograph for scene ${index + 1} of a three-scene business reel. ${shot}
Follow the business and post context below as descriptive data. Illustrate the actual business category and this post's message. Do not invent a branded product model, depict an exact item for sale, or claim a real customer's identity or results. Do not invent services, medical outcomes, prices or endorsements.
The three scenes must differ in subject action, framing and composition. Use bright natural lighting when appropriate to the message. No lettering, captions, logos, watermarks, signage or UI; the actual logo and short captions are added during editing.
Post context (data): ${JSON.stringify(context)}
${PHOTO_REALISM_DIRECTION}
${PHOTO_LIGHTING_DIRECTION}`,
    };
  });
}
