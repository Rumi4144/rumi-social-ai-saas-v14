import type { ReelProject } from "./timeline";
import type { ReelSource } from "./post-context";
import type { MusicChoice } from "./music";
import { industryReelDefaults } from "@/lib/industries";
export type AutoReelPlan = { organizationId: string; campaign: { id: string; title: string }; post: { id: string; headline: string; caption: string }; brand: { id: string; name: string; color: string; accent: string; website: string; logo?: string; industry?: string | null }; project: ReelProject; sources: ReelSource[]; warnings: string[] };
export function autoPlanMatches(plan: AutoReelPlan, context: { organizationId: string; campaignId: string; contentItemId: string }) {
  return plan.organizationId === context.organizationId && plan.campaign?.id === context.campaignId && plan.post?.id === context.contentItemId;
}
export function automaticMusic(brand: string, industry?: string | null): MusicChoice {
  const defaults = industryReelDefaults(industry);
  if (defaults) return defaults.music;
  if (/master\s*mind|hypno|meditat|wellness/i.test(brand)) return "ocean-waves";
  if (/guitar|guitarra|luthier/i.test(brand)) return "classical";
  return "ambient";
}
// A completion may update the editor only while its original selection is active.
export function reelOperationIsCurrent(started: string, current: string, signal?: AbortSignal) {
  return started === current && !signal?.aborted;
}
