import { prisma } from "@/lib/prisma";
import { weeklyPackageSpec, validateWeeklyMix, checkWeeklyAllowance, weeklyMixQuote, type WeeklyMix } from "@/lib/billing/packages";
import { savedItemMedia, downloadableStatuses } from "@/components/weekly/item-policy";
import { photoKey } from "@/lib/reels/product-photos";
import { runwayConfigured } from "@/lib/video/runway";
import { addDays, annualPosition, annualStart, dateValue, manifestOf, monday, photoGroups, planWeek, weeklyPackId, weeklyUsage, type WeeklyPhoto } from "./plan";
import type { PrepareWeeklyRequest, WeeklyDelivery, WeeklyItem, WeeklyItemMapping, WeeklyManifest, WeeklyMutationResponse, WeeklyResponse } from "./types";

type Context = { organizationId: string; role: string; userId: string };
type Options = { brandId?: string; weekStart?: string };
export class WeeklyError extends Error { constructor(message: string, public status = 400) { super(message); } }
const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
function selectedWeek(value?: string) { const week = value || monday(); dateValue(week); if (monday(week) !== week) throw new WeeklyError("Choose the Monday that starts this week."); return week; }
async function brandSources(organizationId: string, brand: { id: string; products: Array<{ name: string; imageUrl: string | null; sourceUrl: string | null }> }) {
  const assets = await prisma.mediaAsset.findMany({ where: { organizationId, kind: "product_photo", status: "ready", url: { not: null }, OR: [{ campaignId: null, metadata: { path: ["brandId"], equals: brand.id } }, { campaignId: { in: (await prisma.campaign.findMany({ where: { brandId: brand.id, brand: { organizationId } }, select: { id: true } })).map(c => c.id) } }] }, select: { id: true, url: true, metadata: true }, orderBy: { createdAt: "desc" }, take: 300 });
  const photos: WeeklyPhoto[] = brand.products.flatMap(p => p.imageUrl && p.sourceUrl ? [{ imageUrl: p.imageUrl, sourceUrl: p.sourceUrl, productName: p.name }] : []);
  for (const asset of assets) {
    const meta = object(asset.metadata), evidence = object(meta.sourceEvidence);
    const sourceUrl = evidence.sourceUrl || meta.sourceUrl, productName = evidence.title || meta.productName;
    if (asset.url && typeof sourceUrl === "string" && typeof productName === "string" && sourceUrl && productName) photos.push({ imageUrl: asset.url, sourceUrl, productName, assetId: asset.id });
  }
  // Width/quality variants of one photograph never count as multiple scenes.
  return [...new Map(photos.filter(p => /^https:\/\//.test(p.imageUrl) && /^https:\/\//.test(p.sourceUrl)).map(p => [`${p.sourceUrl}:${photoKey(p.imageUrl)}`, p])).values()];
}
async function loadBase(ctx: Context, options: Options) {
  const [brands, subscription, records] = await Promise.all([
    prisma.brand.findMany({ where: { organizationId: ctx.organizationId }, include: { products: true }, orderBy: { createdAt: "asc" } }),
    prisma.subscription.findUnique({ where: { organizationId: ctx.organizationId } }),
    prisma.job.findMany({ where: { organizationId: ctx.organizationId, type: "WEEKLY_PACK" }, orderBy: { createdAt: "asc" } }),
  ]);
  const brand = options.brandId ? brands.find(b => b.id === options.brandId) : brands[0];
  if (options.brandId && !brand) throw new WeeklyError("Business not found in this workspace.", 404);
  const weekStart = selectedWeek(options.weekStart), weekEnd = addDays(weekStart, 6);
  const manifests = records.map(row => manifestOf(row.payload)).filter((row): row is WeeklyManifest => !!row);
  const brandHistory = brand ? manifests.filter(row => row.brandId === brand.id) : [];
  const startsOn = annualStart(brandHistory);
  const photos = brand ? await brandSources(ctx.organizationId, brand) : [];
  const hasGallery = photoGroups(photos).some(group => group.length >= 3);
  const motionAvailable = hasGallery && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const aiVideoAvailable = hasGallery && runwayConfigured();
  const spec = weeklyPackageSpec(subscription?.plan, subscription?.status);
  const mix: WeeklyMix = { images: spec.mix.images + (motionAvailable ? 0 : spec.mix.motionReels) + (aiVideoAvailable ? 0 : spec.mix.aiVideos), motionReels: motionAvailable ? spec.mix.motionReels : 0, aiVideos: aiVideoAvailable ? spec.mix.aiVideos : 0 };
  return { brands, brand, subscription, records, manifests, brandHistory, startsOn, photos, hasGallery, motionAvailable, aiVideoAvailable, spec, mix, weekStart, weekEnd };
}
export function latestDeliveries<T extends { socialConnectionId: string; createdAt: Date; updatedAt?: Date; status: string }>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const row of [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) if (!latest.has(row.socialConnectionId)) latest.set(row.socialConnectionId, row);
  return [...latest.values()];
}
export function fullyPublished(status: string, deliveries: Array<{ status: string }>) {
  return deliveries.length ? deliveries.every(row => row.status === "published") : status === "published";
}
export async function weeklyView(ctx: Context, options: Options = {}): Promise<WeeklyResponse> {
  const base = await loadBase(ctx, options), { brand, brands, spec, manifests, records, weekStart, weekEnd, startsOn, mix } = base;
  const usage = weeklyUsage(manifests, weekStart), quote = weeklyMixQuote(mix);
  const allowance = checkWeeklyAllowance(spec, { ...usage, requestedPosts: quote.posts });
  const record = brand ? records.find(row => row.id === weeklyPackId(ctx.organizationId, brand.id, weekStart)) : undefined;
  const manifest = record ? manifestOf(record.payload) : null;
  const items = brand ? await prisma.contentItem.findMany({ where: { campaign: { brandId: brand.id, brand: { organizationId: ctx.organizationId } }, ...(manifest ? { campaignId: manifest.campaignId } : { scheduledFor: { gte: new Date(`${weekStart}T00:00:00Z`), lt: new Date(`${addDays(weekStart, 7)}T00:00:00Z`) } }) }, orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }] }) : [];
  const ids = items.map(item => item.id);
  const [assets, publishJobs, connections, changes, preparationJobs] = await Promise.all([
    ids.length ? prisma.mediaAsset.findMany({ where: { organizationId: ctx.organizationId, contentItemId: { in: ids }, status: "ready", kind: { in: ["social_creative", "campaign_video"] } } }) : [],
    ids.length ? prisma.publishJob.findMany({ where: { organizationId: ctx.organizationId, contentItemId: { in: ids } }, orderBy: { createdAt: "desc" } }) : [],
    prisma.socialConnection.findMany({ where: { organizationId: ctx.organizationId }, select: { id: true, accountName: true } }),
    ids.length ? prisma.job.findMany({ where: { organizationId: ctx.organizationId, type: "CONTENT_CHANGE_REQUEST", status: "pending", OR: ids.map(id => ({ payload: { path: ["contentItemId"], equals: id } })) }, orderBy: { updatedAt: "desc" } }) : [],
    manifest ? prisma.job.findMany({ where: { organizationId: ctx.organizationId, type: { in: ["CREATE_EVERYTHING", "GENERATE_IMAGE"] }, payload: { path: ["campaignId"], equals: manifest.campaignId } }, orderBy: { createdAt: "asc" } }) : [],
  ]);
  const mapping: WeeklyItemMapping[] = object(record?.result).items || [];
  const output: WeeklyItem[] = [];
  for (const item of items) {
    const jobs = latestDeliveries(publishJobs.filter(row => row.contentItemId === item.id));
    if (fullyPublished(item.status, jobs)) continue;
    const slot = manifest?.slots.find(s => mapping.some(m => m.contentItemId === item.id && m.slotKey === s.key));
    const kind = slot?.kind || (item.type === "reel_post" || item.type === "presenter_post" ? "motion_reel" : "image");
    const ref = savedItemMedia(item.mediaUrl);
    const asset = ref && assets.find(a => a.id === ref.id && a.contentItemId === item.id && a.campaignId === item.campaignId && a.kind === (ref.kind === "image" ? "social_creative" : "campaign_video"));
    const correctMedia = !!asset?.url && (kind === "image" ? ref?.kind === "image" : ref?.kind === "video" && object(asset.metadata).contentType === "video/mp4");
    const requested = changes.find(row => object(row.payload).contentItemId === item.id);
    const approvalBlockedReason = requested ? "Your changes are with Admin. Review the revised post when they are complete." : !item.headline?.trim() ? "This post still needs its headline." : !correctMedia ? kind === "image" ? "The finished design is still being prepared." : kind === "motion_reel" ? "Finish the reel to create its moving scenes, music and captions." : "Create and review the three AI moving scenes, then finish the video." : null;
    const deliveries: WeeklyDelivery[] = jobs.map(row => ({ id: row.id, connectionId: row.socialConnectionId, platform: row.platform, account: connections.find(c => c.id === row.socialConnectionId)?.accountName || row.platform, status: row.status, scheduledFor: row.scheduledFor.toISOString(), error: row.lastError, publishedAt: row.publishedAt?.toISOString() || null }));
    const needsAttention = deliveries.some(row => ["failed", "retry", "verification_pending"].includes(row.status));
    const image = assets.find(a => a.contentItemId === item.id && a.kind === "social_creative");
    output.push({ id: item.id, campaignId: item.campaignId, brandId: brand!.id, date: slot?.date || item.scheduledFor?.toISOString().slice(0, 10) || weekStart, day: slot?.day || 1, type: item.type, kind, headline: item.headline || "", caption: item.caption || "", status: item.status, isReady: !approvalBlockedReason, approvalBlockedReason, mediaUrl: item.mediaUrl, previewUrl: correctMedia ? item.mediaUrl : image ? `/api/media/${image.id}` : null, mediaKind: correctMedia ? ref!.kind : image ? "image" : null, assetId: correctMedia ? asset!.id : null, downloadUrl: correctMedia && downloadableStatuses.includes(item.status) ? `/api/weekly/items/${item.id}/download` : null, platforms: item.platform.split(",").map(v => v.trim()).filter(Boolean), needsAttention, deliveries, changeRequest: requested ? { comment: String(object(requested.payload).comment || ""), createdAt: requested.updatedAt.toISOString() } : null, changesRequested: !!requested, nextAction: needsAttention ? "delivery_attention" : correctMedia ? "review" : kind === "motion_reel" ? "finish_motion_reel" : kind === "ai_video" ? "finish_ai_video" : "prepare" });
  }
  const pending = preparationJobs.filter(job => ["queued", "running"].includes(job.status)), failed = preparationJobs.find(job => job.status === "failed");
  const warnings = [];
  if (brand && !brand.logoUrl) warnings.push("Admin can add this business’s actual logo to its Brand Brain. A logo will not be invented.");
  if (!base.hasGallery && Number(spec.mix.motionReels) + Number(spec.mix.aiVideos) > 0) warnings.push("This business needs three distinct saved photos of the same product before automatic reels can be included. This week defaults to image posts; Admin can import the product gallery.");
  if (base.hasGallery && !base.motionAvailable) warnings.push("Video saving is not configured yet. This week defaults to image posts.");
  if (base.hasGallery && !base.aiVideoAvailable && spec.mix.aiVideos > 0) warnings.push("AI moving-scene video is not configured yet. Its slot is replaced with an image post and its video cost is excluded.");
  if (!base.photos.length) warnings.push("No saved product photos are available. Images will illustrate your business; they will not be presented as exact product photographs.");
  let reason = !brand ? "Ask Admin to set up this business’s brand first." : ctx.role === "viewer" ? "Your access is read-only." : record ? "This week has already been prepared. Continue reviewing its saved posts." : !allowance.allowed ? allowance.reason : (base.subscription?.credits || 0) < quote.preparationCredits ? "There are not enough credits to prepare this week." : null;
  const position = annualPosition(weekStart, startsOn);
  return { organizationId: ctx.organizationId, canManage: ctx.role !== "viewer", brands: brands.map(b => ({ id: b.id, name: b.name })), brand: brand ? { id: brand.id, name: brand.name, website: brand.websiteUrl, logoUrl: brand.logoUrl } : null, weekStart, weekEnd, weekNumber: position.weekNumber, pack: manifest && record ? { ...manifest, id: record.id, status: pending.length ? "preparing" : failed || output.some(item => !item.isReady) ? "needs_attention" : items.length && !output.length ? "complete" : "ready", error: failed ? "Some media could not be prepared. Admin can review the failed generation; your saved posts and credits remain recorded." : null, pendingJobs: pending.length, nextJobId: pending.find(job => job.status === "queued")?.id || null } : null, items: output, prepare: { allowed: !reason, reason, mix, preparationCredits: quote.preparationCredits, completionCredits: quote.completionCredits, totalCredits: quote.packCredits, availableCredits: base.subscription?.credits || 0, warnings, motionAvailable: base.motionAvailable, aiVideoAvailable: base.aiVideoAvailable }, plan: { key: spec.key, label: spec.label, weeklyPosts: spec.weeklyPosts, mix: { ...spec.mix }, oneTime: spec.oneTime, postsThisWeek: usage.postsThisWeek }, annualPlan: { weeks: 52, days: 364, cycle: position.cycle, preparedWeeks: base.brandHistory.length, generatedPosts: base.brandHistory.reduce((sum, row) => sum + row.slots.length, 0), startsOn } };
}

export async function prepareWeekly(ctx: Context, input: PrepareWeeklyRequest): Promise<WeeklyMutationResponse> {
  if (ctx.role === "viewer") throw new WeeklyError("Your access is read-only.", 403);
  const base = await loadBase(ctx, input), { brand, weekStart, weekEnd } = base;
  if (!brand) throw new WeeklyError("Set up this business’s brand before preparing its week.");
  if (weekStart < monday() || weekStart > addDays(monday(), 51 * 7)) throw new WeeklyError("Prepare this week or one of the next 51 weeks. Existing history stays available.");
  const id = weeklyPackId(ctx.organizationId, brand.id, weekStart);
  const reuse = (payload: WeeklyManifest): WeeklyMutationResponse => ({ packId: id, campaignId: payload.campaignId, jobId: payload.generationJobId, preparationCredits: payload.preparationCredits, reused: true });
  return prisma.$transaction(async tx => {
    // All brands share one subscription and weekly allowance. The row lock
    // serializes quota checks, deterministic claims and the debit together.
    await tx.$queryRaw`SELECT "id" FROM "Subscription" WHERE "organizationId" = ${ctx.organizationId} FOR UPDATE`;
    const existing = await tx.job.findFirst({ where: { id, organizationId: ctx.organizationId, type: "WEEKLY_PACK" } });
    const prior = manifestOf(existing?.payload);
    if (prior) return reuse(prior);
    const duplicate = await tx.job.findFirst({ where: { organizationId: ctx.organizationId, type: "WEEKLY_PACK", payload: { path: ["requestId"], equals: input.requestId } } });
    if (duplicate) throw new WeeklyError("This preparation request was already used for another week. Refresh before preparing a different week.", 409);
    const subscription = await tx.subscription.findUnique({ where: { organizationId: ctx.organizationId } });
    const spec = weeklyPackageSpec(subscription?.plan, subscription?.status), mix = input.mix || base.mix;
    const quote = validateWeeklyMix(spec, mix);
    if ((mix.motionReels || mix.aiVideos) && !base.hasGallery) throw new WeeklyError("Three distinct saved photos of the same product are needed for this reel combination. Choose image posts or ask Admin to import a product gallery.", 409);
    if (mix.motionReels && !base.motionAvailable || mix.aiVideos && !base.aiVideoAvailable) throw new WeeklyError("This video option is not configured yet. Choose image posts; no preparation credits were charged.", 503);
    if (input.expectedCredits !== quote.preparationCredits) throw new WeeklyError("The preparation cost changed. Review the latest credit total before continuing.", 409);
    const records = await tx.job.findMany({ where: { organizationId: ctx.organizationId, type: "WEEKLY_PACK" }, orderBy: { createdAt: "asc" } });
    const manifests = records.map(row => manifestOf(row.payload)).filter((row): row is WeeklyManifest => !!row);
    const allowance = checkWeeklyAllowance(spec, { ...weeklyUsage(manifests, weekStart), requestedPosts: quote.posts });
    if (!allowance.allowed) throw new WeeklyError(allowance.reason!, 409);
    if (!subscription || subscription.credits < quote.preparationCredits) throw new WeeklyError("There are not enough credits to prepare this week.", 409);
    const startsOn = annualStart(manifests.filter(row => row.brandId === brand.id));
    const plan = planWeek({ organizationId: ctx.organizationId, brandId: brand.id, brandName: brand.name, weekStart, startsOn, mix, photos: base.photos, history: manifests });
    const campaign = await tx.campaign.create({ data: { brandId: brand.id, title: `${brand.name} · Week ${plan.weekNumber} · ${weekStart}`, goal: brand.contentGoals || "awareness", status: "generating", scheduledFor: dateValue(weekStart) } });
    const generationJobId = `${id}-generate`;
    const manifest: WeeklyManifest = { version: 1, brandId: brand.id, campaignId: campaign.id, generationJobId, startsOn, weekStart, weekEnd, weekNumber: plan.weekNumber, cycle: plan.cycle, requestId: input.requestId, mix, slots: plan.slots, oneTime: spec.oneTime, preparationCredits: quote.preparationCredits, completionCredits: quote.completionCredits, packCredits: quote.packCredits };
    const connections = await tx.socialConnection.findMany({ where: { organizationId: ctx.organizationId, status: "connected" }, select: { provider: true } });
    const platforms = [...new Set(connections.map(c => c.provider))];
    // Product identity is kept separate from the editorial angle. The existing
    // reel verifier treats every word of a product topic as identity evidence.
    const contentPlan = plan.slots.map(slot => ({ planKey: slot.key, day: slot.day, date: slot.date, type: slot.kind === "image" ? "post" : "reel_post", platforms, occasion: null, extra: false, topics: [slot.productName || slot.topic] }));
    const dailyPlan = Array.from({ length: 7 }, (_, index) => ({ day: index + 1, date: addDays(weekStart, index), platforms }));
    const recentTopics = manifests.filter(row => row.brandId === brand.id).slice(-4).flatMap(row => row.slots.map(slot => slot.topic));
    const brief = `Prepare a seven-day pack for ${brand.name}. Follow every assigned planKey, date and topic. Each item should have a fresh angle, a short clear headline and practical caption. Use verified brand facts only; do not invent prices, discounts, reviews, guarantees, awards or expertise. Make the image visually dominant, with a bold readable headline of at most 8 words. A video slot is a draft until its moving scenes and final export exist. Never call a still image a finished reel. ${base.photos.length ? "Use only the assigned actual product photos. Name only the product assigned to that slot and preserve its appearance." : "Use relevant illustrative scenes without pretending to depict a specific physical product."} Assigned editorial angles: ${plan.slots.map(slot => `${slot.key}: ${slot.topic}`).join(" | ")}. Avoid repeating these recent angles: ${recentTopics.join(" | ")}`;
    await tx.job.create({ data: { id, organizationId: ctx.organizationId, type: "WEEKLY_PACK", status: "queued", payload: manifest as any } });
    await tx.job.create({ data: { id: generationJobId, organizationId: ctx.organizationId, type: "CREATE_EVERYTHING", payload: { campaignId: campaign.id, weeklyPackId: id, weeklySlots: plan.slots, weeklySources: base.photos, brief, goal: campaign.goal, days: 7, contentPlan, dailyPlan, photoSource: base.photos.length ? "website" : "ai", imageUrls: base.photos.map(p => p.imageUrl), websitePhotoEvidence: base.photos.map(p => ({ imageUrl: p.imageUrl, sourceUrl: p.sourceUrl, title: p.productName })), brandContext: { name: brand.name, voice: brand.voice, positioning: brand.positioning, industry: brand.industry, description: brand.description, targetAudience: brand.targetAudience, contentGoals: brand.contentGoals, website: brand.websiteUrl, approvalRequired: true } } as any } });
    const charged = await tx.subscription.updateMany({ where: { organizationId: ctx.organizationId, credits: { gte: quote.preparationCredits } }, data: { credits: { decrement: quote.preparationCredits } } });
    if (charged.count !== 1) throw new WeeklyError("There are not enough credits to prepare this week.", 409);
    const after = await tx.subscription.findUniqueOrThrow({ where: { organizationId: ctx.organizationId } });
    await tx.creditLedger.create({ data: { organizationId: ctx.organizationId, delta: -quote.preparationCredits, balanceAfter: after.credits, reason: "weekly_pack_preparation", referenceId: id } });
    return { packId: id, campaignId: campaign.id, jobId: generationJobId, preparationCredits: quote.preparationCredits, reused: false };
  }, { timeout: 15000 });
}
