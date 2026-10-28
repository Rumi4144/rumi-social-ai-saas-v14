import type { ReelProject } from "./timeline";
import type { ReelSource } from "./post-context";
import { photoKey } from "./product-photos";
import { automaticMusic } from "./automatic";

export const PRODUCT_REEL_COST = 120;
export const PRODUCT_REEL_SCENE_COST = 40;
export type ProductReelShot = { id: string; assetId: string; imageUrl: string; label: string; prompt: string; caption: string };
export type ProductReelPlan = {
  campaignId: string; contentItemId: string; sourceUrl: string; productName: string; productSubject?: string;
  brand: { name: string; website: string; color: string; accent: string; logo?: string; industry?: string | null };
  shots: ProductReelShot[];
};
export type ProductReelView = {
  id: string; status: string; error: string | null; progress: number; cost: number; configured: boolean;
  campaignId: string; contentItemId: string; productName: string; sourceUrl: string;
  shots: { id: string; label: string; caption: string; imageUrl: string; status: string; error: string | null }[];
  project?: ReelProject; sources?: ReelSource[]; musicStyle?: ReturnType<typeof automaticMusic>;
};

/** Camera motion is deliberately specified separately from the product identity.
 * No invented features, presenter claims or fake demonstrations enter the brief. */
export function productReelShots(productName: string, photos: { id: string; url: string }[]): ProductReelShot[] {
  const unique = photos.filter((photo, index) => photos.findIndex(other => photoKey(other.url) === photoKey(photo.url)) === index);
  if (!unique.length) throw new Error("This product needs a website photo before creating a moving reel.");
  const directions = [
    ["Opening product shot", "A continuous, smooth camera approach toward the whole product. The product fills the vertical composition with generous space around its edges. Warm daylight, bright natural colors.", productName],
    ["Moving detail shot", "A slow lateral camera slide across the visible product surface, revealing its existing texture and construction. Frame only details actually visible in the reference. Warm daylight and clear, bright colors.", "A closer look"],
    ["Closing product shot", "A gentle camera arc around the visible front of the product, ending on a steady, attractive hero composition. Preserve the reference view; do not reveal unseen surfaces. Warm daylight and bright natural colors.", "Explore the collection"],
  ];
  return directions.map(([label, direction, caption], index) => {
    const photo = unique[Math.min(index, unique.length - 1)];
    return { id: String(index + 1), assetId: photo.id, imageUrl: photo.url, label, caption,
      prompt: `${direction} This is a moving product film, with continuous camera motion throughout the shot. Preserve the exact product in the reference image: its shape, proportions, materials, colors, logos and existing details. Keep the product stable and undistorted. Show this product only. Do not add people, hands, demonstrations, new features, writing, captions, watermarks or graphics. Product name for identification only: ${productName.slice(0, 180)}.` };
  });
}

export function productReelProject(plan: ProductReelPlan, videoIds: string[]) {
  if (videoIds.length !== 3 || new Set(videoIds).size !== 3) throw new Error("All three moving scenes must be ready before opening this reel.");
  const sources: ReelSource[] = plan.shots.map((shot, index) => ({ id: videoIds[index], kind: "video", src: `/api/video/file?jobId=${encodeURIComponent(videoIds[index])}`, contentItemId: plan.contentItemId, label: shot.label, seconds: 5 }));
  const project: ReelProject = { ...plan.brand, brand: plan.brand.name, productSubject: plan.productSubject || plan.productName, cta: "Explore the collection", style: "product-film", animation: "gentle", logoThroughout: !!plan.brand.logo, logoSize: 12, closingSeconds: 0, endingOverlay: true,
    scenes: plan.shots.map((shot, index) => ({ id: `product-${videoIds[index]}`, src: sources[index].src, kind: "video", headline: shot.caption, detail: "", seconds: 5, direction: shot.label })) };
  return { project, sources, musicStyle: automaticMusic(plan.brand.name, plan.brand.industry) };
}
