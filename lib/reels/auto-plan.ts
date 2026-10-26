import { reelProductSubject, reelPhotoMatchesProduct } from "./product-identity";
import { parseReelScenePlan } from "./scene-plan";
import type { ReelProject, ReelStyle } from "./timeline";
import type { ReelSource } from "./post-context";
import { occasionVisualConcept } from "@/lib/ai/occasion";
import { industryReelDefaults } from "@/lib/industries";

export type AutoPlanBrand = { id: string; name: string; color: string; accent: string; website: string; logo?: string; industry?: string | null; designStyle?: string | null };
export function automaticReelStyle(brand: AutoPlanBrand, holiday = false): ReelStyle {
  const preference = brand.designStyle || "";
  if (/cinematic|showcase|heritage/i.test(preference)) return "showcase";
  if (/bold|energetic|playful|vibrant/i.test(preference)) return "bold";
  if (/minimal|clean/i.test(preference)) return "minimal";
  if (/luxury|editorial|elegant|premium/i.test(preference)) return "boutique";
  const business = `${brand.industry || ""} ${brand.name}`;
  if (!holiday && /guitar|retail|e.?commerce|product|jewel|furniture/i.test(business)) return "showcase";
  const defaults = industryReelDefaults(brand.industry);
  if (defaults) return defaults.style === "spotlight" ? "showcase" : defaults.style;
  if (/fitness|sport|restaurant|food|entertainment|event/i.test(business)) return "bold";
  return "boutique";
}
export type AutoPlanPost = { id: string; headline: string | null; caption: string | null; type: string; visualDirection?: string | null; occasion?: string; topics?: string[] };
export type AutoPlanAsset = { id: string; organizationId: string; brandId: string; campaignId: string; contentItemId?: string | null; kind: string; status: string; url: string | null; prompt?: string | null; metadata?: unknown; post?: AutoPlanPost };
const ignored = new Set("a an and are as at be by can do for from has have how in is it its may more of on or our that the their them there these they this to with you your photo image scene text shot close wide calm moment business brand premium campaign create realistic vertical photograph background lighting caption product fidelity critical no not people person adult hypnosis hypnotherapy session support journey step discover learn today help helping feel feeling take taking change positive advanced mind master explore book appointment consultation gentle safe natural practice personal professional approach".split(" "));
function tokens(value: string): Set<string> {
  return new Set((value.toLowerCase().match(/[a-z0-9]+/g) || []).filter(word => word.length > 2 && !ignored.has(word)).map(word => word.endsWith("s") && word.length > 4 ? word.slice(0, -1) : word));
}
function overlap(left: Set<string>, right: Set<string>) { return [...left].filter(word => right.has(word)).length; }
function metadata(asset: AutoPlanAsset): { label?: string; sceneId?: string; occasion?: string } {
  return asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
}
function subjectText(asset: AutoPlanAsset) {
  // Generation prompts append brand/product safety boilerplate. It is not evidence
  // that a photograph actually depicts one of those subjects.
  const prompt = (asset.prompt || "").split(/PRODUCT FIDELITY|Business context:|These fields|CAMPAIGN VISUAL DIVERSITY/i)[0].slice(0, 2000);
  return `${prompt} ${asset.post?.headline || ""} ${asset.post?.caption || ""} ${metadata(asset).label || ""}`;
}
// Shared business words do not make different treatment subjects interchangeable.
// A photo explicitly about another subject is excluded even if its caption also
// mentions stress, support or hypnosis, or it was attached to this same post.
const specificSubjects = [
  /\b(?:smok\w*|cigarette\w*|tobacco|nicotine|vaping|vape\w*)\b/i,
  /\b(?:weight[ -]?(?:loss|management|reduction)|los(?:e|ing)[ -]?weight|diet\w*|slimming|calories|bathroom scales?|weighing|overeating|appetite)\b/i,
  /\b(?:alcohol\w*|drinking|sobriety|sober)\b/i,
  /\b(?:insomnia|sleep\w*|bedtime)\b/i,
  /\b(?:phobia\w*|fear of|panic\w*)\b/i,
];
function subjectCompatible(asset: AutoPlanAsset, target: string) {
  const source = subjectText(asset);
  return specificSubjects.every(subject => !subject.test(source) || subject.test(target));
}
function normalized(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function occasionMatches(asset: AutoPlanAsset, occasion: string) {
  const saved = asset.post?.occasion || metadata(asset).occasion;
  if (saved) return normalized(saved) === normalized(occasion);
  const text = normalized(subjectText(asset));
  const label = normalized(occasion).replace(/ day$/, "");
  const aliases: Record<string, string[]> = {
    "independence": ["fourth of july", "4th of july", "independence day"],
    "christmas": ["christmas", "evergreen tree"],
    "thanksgiving": ["thanksgiving"],
    "halloween": ["halloween", "pumpkin"],
  };
  return (aliases[label] || [label]).some(term => (` ${text} `).includes(` ${term} `));
}
const unsafe = /100\s*%|\b(?:guarantee\w*|cure\w*|heal\w*|eliminat\w*|testimonial\w*|diagnos\w*|permanently|my (?:client|patient)|our (?:client|patient)|(?:client|patient)s? (?:said|says|reported))\b/i;
function concise(value: string, limit = 64) {
  const clean = value.replace(/https?:\/\/\S+|#[\w]+/g, "").replace(/\s+/g, " ").trim();
  if (!clean || unsafe.test(clean)) return "";
  if (clean.length <= limit) return clean;
  return clean.slice(0, limit - 1).replace(/\s+\S*$/, "") + "…";
}
function photoIdentity(url: string) {
  try { const parsed = new URL(url); parsed.hash = ""; for (const key of ["width", "height", "w", "h", "fit", "quality", "q"]) parsed.searchParams.delete(key); parsed.searchParams.sort(); return parsed.toString(); }
  catch { return url; }
}

/** Pure, deterministic planning; no providers, credits, writes or network access. */
export function automaticReelPlan(input: { organizationId: string; campaignId: string; brand: AutoPlanBrand; post: AutoPlanPost; assets: AutoPlanAsset[] }) {
  const { post, brand } = input;
  const warnings: string[] = [];
  const holiday = post.type === "holiday_post";
  const parsed = parseReelScenePlan(post.visualDirection);
  const saved = parsed?.scenes.length === 4 ? parsed : null;
  const fragments = (post.caption || "").split(/(?<=[.!?])\s+|\n+/).map(value => concise(value)).filter(Boolean);
  const captions = [...new Set([concise(post.headline || ""), ...fragments].filter(Boolean))].slice(0, 4);
  if (unsafe.test(`${post.headline || ""} ${post.caption || ""} ${post.visualDirection || ""}`)) warnings.push("Potential claims or testimonials were omitted from reel captions. Review the saved post before publishing.");
  const slots = Array.from({ length: 3 }, (_, index) => saved?.scenes[index] || { headline: captions[index] || "", seconds: 4, direction: "" });
  const topic = tokens(`${post.headline || ""} ${post.caption || ""}`);
  const headlineTopic = tokens(post.headline || "");
  const targetText = `${post.headline || ""} ${post.caption || ""}`;
  for (const word of tokens(brand.name)) topic.delete(word);
  for (const word of tokens(brand.name)) headlineTopic.delete(word);
  if (holiday && !post.occasion) warnings.push("The saved holiday slot could not be identified. Choose an occasion photo before exporting.");
  const productSubject = reelProductSubject(post, brand);
  const eligible = input.assets.filter(asset => asset.organizationId === input.organizationId && asset.brandId === brand.id && ["ready", "superseded"].includes(asset.status) && ["ai_image", "product_photo", "reel_scene_image"].includes(asset.kind) && !!asset.url && reelPhotoMatchesProduct(productSubject, asset) && subjectCompatible(asset, targetText) && (!holiday || (!!post.occasion && occasionMatches(asset, post.occasion))));
  if (productSubject && !eligible.length) warnings.push(`No verified photos match ${productSubject}. Load this product’s gallery; another product will not be substituted.`);
  const used = new Set<string>();
  const sources: ReelSource[] = [];
  const scenes: ReelProject["scenes"] = [];
  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index], sceneId = `${post.id}-planned-${index + 1}`;
    const direction = tokens(slot.direction), captionTopic = tokens(slot.headline);
    const ranked = eligible.filter(asset => !used.has(photoIdentity(asset.url!))).map(asset => {
      const words = tokens(subjectText(asset));
      for (const word of tokens(brand.name)) words.delete(word);
      const semantic = overlap(topic, words), shot = overlap(direction, words);
      const exactScene = asset.contentItemId === post.id && metadata(asset).sceneId === sceneId;
      const owned = asset.contentItemId === post.id;
      // Source-post association is evidence for the primary image, but not for
      // unrelated scene photos. Past campaign images require shared subject terms.
      const relevant = !!productSubject || exactScene || overlap(headlineTopic, words) > 0 || semantic >= 2 || shot >= 2 || (owned && asset.kind !== "reel_scene_image");
      return { asset, relevant, score: (exactScene ? 1000 : 0) + shot * 12 + overlap(captionTopic, words) * 10 + semantic * 5 + (owned ? 8 : 0) };
    }).filter(entry => entry.relevant).sort((a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id));
    const chosen = ranked[0]?.asset;
    if (!chosen) { warnings.push(`Scene ${index + 1} needs a relevant saved photo${post.occasion ? ` for ${post.occasion}` : ""}. Review this gap; no image was repeated or generated.`); continue; }
    used.add(photoIdentity(chosen.url!));
    const source: ReelSource = { id: chosen.id, kind: "image", src: `/api/reels/media?assetId=${encodeURIComponent(chosen.id)}&campaignId=${encodeURIComponent(input.campaignId)}`, contentItemId: chosen.contentItemId || undefined, libraryBrandId: brand.id, label: metadata(chosen).label || chosen.post?.headline || "Saved photo" };
    sources.push(source);
    scenes.push({ id: sceneId, src: source.src, kind: "image", headline: concise(slot.headline) || concise(post.headline || "") || concise(brand.name), detail: "", seconds: slot.seconds, direction: holiday && post.occasion ? occasionVisualConcept(post.occasion).direction : slot.direction });
  }
  if (!scenes.length) warnings.push("No relevant ready photos are available for this post. Add or select photos before exporting.");
  const closingSeconds = 3;
  if (scenes.length) {
    const available = 15 - closingSeconds;
    scenes.forEach((scene, index) => { scene.seconds = Math.floor(available / scenes.length) + (index < available % scenes.length ? 1 : 0); });
  }
  const style = automaticReelStyle(brand, holiday);
  const project: ReelProject = { brand: brand.name, website: brand.website, logo: brand.logo, color: brand.color, accent: brand.accent, cta: concise(saved?.cta || "Explore more", 70) || "Explore more", style, ...(productSubject ? {productSubject} : {}), animation: style === "bold" ? "lively" : "gentle", closingSeconds, scenes };
  return { project, sources, warnings };
}
