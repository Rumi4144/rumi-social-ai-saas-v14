export type FlareModel = "flare-medium" | "flare-high";
export function isFlare(model: string): model is FlareModel {
  return model === "flare-medium" || model === "flare-high";
}
export function isLabPhoto(model: string) { return model === "flux" || isFlare(model); }
export const FLARE_MODEL = "gpt-image-2.5-flare-2026-09-08";
export const FLARE_SIZE = "1024x1280";
export const flareOutputUsd = { "flare-medium": 0.01134, "flare-high": 0.0453 } as const;
export function flareQuality(model: FlareModel) { return model === "flare-high" ? "high" : "medium"; }

// Keep the same final instructions for all three photo comparison options.
export function labPhotoPrompt(prompt: string) {
  return `${prompt}\n\nMobile readability guidance: If the requested image includes advertising text, design it to be read comfortably on a phone at feed size. Use a very large bold headline, large supporting text, a prominent call-to-action button, and a clearly readable website address. Use strong text/background contrast, generous line spacing and safe margins. Give the requested lettering enough space; avoid tiny lettering, dense paragraphs, condensed fonts and narrow text columns. Prefer short supporting copy only when the request allows it. Preserve all supplied exact wording and spelling; never silently shorten or omit required text. If necessary, reduce the photograph's share of the layout instead of shrinking the words. Follow any explicit text sizing or layout instructions in the request. If the request is for a clean photo, no text, or no lettering, do not add any text, buttons or website addresses.`;
}

export function flareQuote(model: FlareModel, prompt: string) {
  // Published 4:5 output estimate plus a conservative UTF-8 prompt allowance.
  // This is a reservation, not a provider invoice or a live balance check.
  const inputAllowance = new TextEncoder().encode(labPhotoPrompt(prompt)).length + 64;
  return Math.ceil((flareOutputUsd[model] + inputAllowance * 5 / 1_000_000) * 1_000_000) / 1_000_000;
}
export type PhotoUsage = { textInputTokens: number; imageInputTokens: number; outputTokens: number };
export function photoUsage(value: unknown): PhotoUsage | undefined {
  if (!value || typeof value !== "object") return;
  const usage = value as {input_tokens?: unknown; output_tokens?: unknown; input_tokens_details?: {text_tokens?: unknown; image_tokens?: unknown}};
  const text = usage.input_tokens_details?.text_tokens, image = usage.input_tokens_details?.image_tokens, output = usage.output_tokens;
  if (![text, image, output, usage.input_tokens].every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n < 1_000_000_000)) return;
  if ((text as number) + (image as number) !== usage.input_tokens) return;
  return {textInputTokens: text as number, imageInputTokens: image as number, outputTokens: output as number};
}
export function photoUsageCost(usage: PhotoUsage) {
  return (usage.textInputTokens * 5 + usage.imageInputTokens * 8 + usage.outputTokens * 30) / 1_000_000;
}

export const labPhotoBriefs = [
  {
    "id": "connection",
    "label": "Music as connection",
    "prompt": "One natural commercial photograph, vertical 4:5. Bright soft daylight, open shadows, clear midtones, inviting natural color and realistic textures. Preserve highlight detail and lifelike skin. No heavy teal/brown cast, gloomy filter, excessive saturation or artificial HDR. No text, logo or watermark. Make the requested moment the clear subject. Any visible hands must have coherent joints and natural contact with objects. Do not invent a testimonial or a guaranteed outcome.\n\nTwo anonymous adult friends share a relaxed music-making moment in a sunlit living room. One plays a generic unbranded full-size nylon-string classical guitar, and the other listens with an engaged, natural expression. Medium-wide candid composition, with the instrument and relevant hand positions readable. Show a believable playing pose and consistent instrument construction. Use a small deep-green accent in the room, with warm wood, white walls and daylight. This is a lifestyle concept, not a depiction of a specific Rumi guitar model."
  },
  {
    "id": "guitar",
    "label": "Guitar in daylight",
    "prompt": "One natural commercial photograph, vertical 4:5. Bright soft daylight, open shadows, clear midtones, inviting natural color and realistic textures. Preserve highlight detail and lifelike skin. No heavy teal/brown cast, gloomy filter, excessive saturation or artificial HDR. No text, logo or watermark. Make the requested moment the clear subject. Any visible hands must have coherent joints and natural contact with objects. Do not invent a testimonial or a guaranteed outcome.\n\nA generic unbranded full-size classical guitar on a stable stand beside a large daylight window. The complete instrument is visible, from headstock to bridge and body, at a natural three-quarter angle. Warm wood grain and coherent strings, frets and hardware. Pale neutral surroundings with one small green accent, soft grounded shadows and generous breathing room. No people or hands. This is a concept image, not a product-accuracy test. For a product-accuracy test, both models must receive the same approved photograph of the actual guitar; do not score text-only output as an exact product representation."
  },
  {
    "id": "wellness",
    "label": "Financial wellness",
    "prompt": "One natural commercial photograph, vertical 4:5. Bright soft daylight, open shadows, clear midtones, inviting natural color and realistic textures. Preserve highlight detail and lifelike skin. No heavy teal/brown cast, gloomy filter, excessive saturation or artificial HDR. No text, logo or watermark. Make the requested moment the clear subject. Any visible hands must have coherent joints and natural contact with objects. Do not invent a testimonial or a guaranteed outcome.\n\nAn anonymous adult couple in their fifties shares a relaxed conversation in a bright kitchen after a simple planning session. A closed notebook and unmarked papers sit naturally at the side of the counter. Capture warmth and attention through their interaction, without a staged handshake, forced grin, luxury props, distress or a desk portrait. Soft morning daylight, natural skin and welcoming color. The scene should suggest time for what matters, without suggesting these are real clients or promising financial results."
  }
] as const;
