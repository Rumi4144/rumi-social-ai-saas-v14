import { matchingWebsitePhoto, modelCodes, type PhotoEvidence } from "@/lib/campaign/photo-subject";
type Post = { headline?: string | null; caption?: string | null; topics?: string[]; type?: string };
type Brand = { name: string; industry?: string | null };
const words = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/);
const generic = new Set("a an the and for with by your our from meet explore discover take closer look at introducing introduction collection photo product guitar guitars classical electric nylon string cutaway inspired welcome find sound tone voice warm hear play crafted craftsmanship new premium".split(" "));
const namedCodes=(value:string)=>modelCodes(value).filter(code=>!/^(?:day|part|step|tip|lesson|week|episode|chapter|session|minute)s?\d/i.test(code));
export function reelProductSubject(post: Post, brand: Brand): string | undefined {
  if (post.type === "holiday_post") return;
  const topic = post.topics?.length === 1 ? post.topics[0] : "";
  const headline = post.headline || "";
  const retail = /guitar|instrument|retail|e.?commerce|physical product|furniture|apparel|jewel/i.test(`${brand.name} ${brand.industry || ""}`);
  if (topic && (retail || namedCodes(topic).length) && words(topic).some(word => word.length > 2 && !generic.has(word))) return topic;
  if (namedCodes(headline).length) return headline;
  // A single product-page link is stronger context than shared category words.
  const links = [...new Set((post.caption?.match(/https:\/\/[^\s<>"']+/g) || []).map(url=>url.replace(/[).,;!?]+$/, "")))];
  if (retail && links.length === 1) try { const url = new URL(links[0]); if (/\/products?\//i.test(url.pathname)) return decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) || "").replace(/-/g, " "); } catch {}
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
/** Actual website provenance wins over prompt wording or the post an image was attached to. */
export function reelPhotoMatchesProduct(subject: string | undefined, asset: { url?: string | null; metadata?: unknown }) {
  if (!subject) return true;
  const metadata = object(asset.metadata), saved = object(metadata.sourceEvidence);
  const evidence: PhotoEvidence = {
    title: typeof saved.title === "string" ? saved.title : typeof metadata.productName === "string" && metadata.productName ? metadata.productName : typeof metadata.sourceUrl === "string" && typeof metadata.label === "string" && !/^Product photo \d+$/i.test(metadata.label) ? metadata.label : "",
    sourceUrl: typeof saved.sourceUrl === "string" ? saved.sourceUrl : typeof metadata.sourceUrl === "string" ? metadata.sourceUrl : "",
    imageUrl: typeof saved.imageUrl === "string" ? saved.imageUrl : asset.url || "unknown-photo",
  };
  if (!matchingWebsitePhoto({ topics: [subject] }, [evidence], [evidence.imageUrl])) return false;
  // Model codes alone are not globally unique: Ramirez A1 is not another maker's A1.
  const source = new Set(words(`${evidence.title} ${evidence.sourceUrl || evidence.imageUrl}`));
  // A reel title can append “in motion” to the product name. That describes the
  // edit, not a different model. Strip only known trailing presentation phrases
  // after a model code; keep manufacturer words and the exact code checks above.
  const identity = namedCodes(subject).length ? subject.replace(/\s+(?:in motion|in action|in focus|up close|at a glance)[.!?]?\s*$/i, "") : subject;
  const distinctive = words(identity).filter(word=>word.length > 2 && !generic.has(word));
  return distinctive.length > 0 && distinctive.every(word=>source.has(word));
}

export function savedProductSubject(post: Post, brand: Brand, job?: {payload?:unknown;result?:unknown}|null) {
 const payload=object(job?.payload), result=object(job?.result);
 const saved=Array.isArray(result.posts) ? result.posts.map(object).find(row=>row.headline===post.headline && row.caption===post.caption && row.type===post.type) : undefined;
 const slot=saved?.planKey && Array.isArray(payload.contentPlan) ? payload.contentPlan.map(object).find(row=>row.planKey===saved.planKey) : undefined;
 const topics=Array.isArray(slot?.topics) ? slot.topics.filter((value):value is string=>typeof value==="string") : undefined;
 return reelProductSubject({...post,topics},brand);
}
