/** One catalog for weekly delivery, billing display and administrator controls.
 * Existing paid plan IDs and advertised monthly prices are retained. Stripe
 * checkout uses only server-configured price IDs; this catalog never reprices
 * existing subscriptions or grants credits on a page visit.
 */
export const PACKAGE_KEYS = ["starter", "creator", "business", "agency"] as const;
export type PaidPackageKey = typeof PACKAGE_KEYS[number];
export type WeeklyMix = { images: number; motionReels: number; aiVideos: number };
export const WEEKLY_CREDIT_COST = { packCopy: 1, postPreparation: 2, motionReelCompletion: 4, aiVideoCompletion: 120 } as const;
export const PACKAGE_CATALOG = {
  starter: { label: "Intro", priceUsd: 19, monthlyCredits: 150, weeklyPosts: 7, mix: { images: 6, motionReels: 1, aiVideos: 0 }, brands: 1, team: 1, clients: 0, socialAccounts: 2, scheduledPosts: 40, whiteLabel: false },
  creator: { label: "Growth", priceUsd: 39, monthlyCredits: 500, weeklyPosts: 7, mix: { images: 5, motionReels: 2, aiVideos: 0 }, brands: 3, team: 2, clients: 0, socialAccounts: 5, scheduledPosts: 100, whiteLabel: false },
  business: { label: "Business", priceUsd: 79, monthlyCredits: 1500, weeklyPosts: 14, mix: { images: 10, motionReels: 3, aiVideos: 1 }, brands: 10, team: 5, clients: 0, socialAccounts: 15, scheduledPosts: 500, whiteLabel: false },
  agency: { label: "Agency", priceUsd: 199, monthlyCredits: 5000, weeklyPosts: 21, mix: { images: 16, motionReels: 4, aiVideos: 1 }, brands: 50, team: 15, clients: 25, socialAccounts: 75, scheduledPosts: 2500, whiteLabel: true },
} as const;
export const TRIAL_PACKAGE = { label: "Trial", priceUsd: 0, monthlyCredits: 100, weeklyPosts: 7, mix: { images: 6, motionReels: 1, aiVideos: 0 }, brands: 1, team: 1, clients: 0, socialAccounts: 2, scheduledPosts: 7, whiteLabel: false } as const;
export function canonicalPlan(value?: string | null): PaidPackageKey {
  const aliases: Record<string, PaidPackageKey> = { starter: "starter", intro: "starter", creator: "creator", growth: "creator", pro: "creator", business: "business", agency: "agency", enterprise: "agency" };
  return aliases[(value || "starter").toLowerCase()] || "starter";
}
export function weeklyMixQuote(mix: WeeklyMix) {
  const counts = [mix.images, mix.motionReels, mix.aiVideos];
  if (counts.some(value => !Number.isSafeInteger(value) || value < 0 || value > 364)) throw new Error("Choose valid whole-number content quantities.");
  const posts = counts.reduce((sum, value) => sum + value, 0);
  if (!posts || posts > 364) throw new Error("Choose at least one post and no more than 364.");
  const preparationCredits = WEEKLY_CREDIT_COST.packCopy + posts * WEEKLY_CREDIT_COST.postPreparation;
  const completionCredits = mix.motionReels * WEEKLY_CREDIT_COST.motionReelCompletion + mix.aiVideos * WEEKLY_CREDIT_COST.aiVideoCompletion;
  return { posts, preparationCredits, completionCredits, packCredits: preparationCredits + completionCredits };
}
export function costForWeeklyMix(mix: WeeklyMix) { return weeklyMixQuote(mix).packCredits; }
export function weeklyPackageSpec(plan?: string | null, status?: string | null) {
  const oneTime = status === "trialing" || plan === "trial", key = oneTime ? "trial" as const : canonicalPlan(plan);
  const item = key === "trial" ? TRIAL_PACKAGE : PACKAGE_CATALOG[key];
  const canGenerate = status === "active" || status === "trialing";
  return { ...item, key, mix: { ...item.mix }, oneTime, canGenerate, blockReason: canGenerate ? null : "An active plan or trial is needed to prepare new posts. Your existing content stays available.", ...weeklyMixQuote(item.mix) };
}
export type WeeklyPackageSpec = ReturnType<typeof weeklyPackageSpec>;
export function validateWeeklyMix(spec: WeeklyPackageSpec, mix: WeeklyMix) {
  const quote = weeklyMixQuote(mix);
  if (quote.posts > spec.weeklyPosts) throw new Error(`This package includes up to ${spec.weeklyPosts} posts per week across this workspace.`);
  if (mix.motionReels > spec.mix.motionReels || mix.aiVideos > spec.mix.aiVideos) throw new Error("This combination exceeds your package’s reel or AI-video allowance. You can replace a video with an image post.");
  return quote;
}
export function checkWeeklyAllowance(spec: WeeklyPackageSpec, usage: { postsThisWeek: number; trialPacksUsed: number; requestedPosts?: number }) {
  if (!spec.canGenerate) return { allowed: false, reason: spec.blockReason! };
  if (spec.oneTime && usage.trialPacksUsed > 0) return { allowed: false, reason: "Your trial includes one seven-day pack. Choose a paid plan for future weeks; your existing pack stays available." };
  const requested = usage.requestedPosts ?? spec.weeklyPosts;
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > spec.weeklyPosts || usage.postsThisWeek + requested > spec.weeklyPosts) return { allowed: false, reason: `Your ${spec.weeklyPosts}-post weekly allowance is shared across this workspace’s brands. Review or finish the pack already prepared for this week.` };
  return { allowed: true, reason: null };
}
export function configuredPlanPrice(key: PaidPackageKey, env: Record<string, string | undefined> = process.env) {
  return env[`STRIPE_${key.toUpperCase()}_PRICE_ID`] || env[`STRIPE_PRICE_${key.toUpperCase()}`] || null;
}
export function planFromPrice(priceId: string, env: Record<string, string | undefined> = process.env): PaidPackageKey | null {
  return PACKAGE_KEYS.find(key => configuredPlanPrice(key, env) === priceId) || null;
}
