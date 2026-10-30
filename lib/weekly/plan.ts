import { createHash } from "node:crypto";
import type { WeeklyMix } from "../billing/packages";
import type { WeeklyManifest, WeeklySlot, WeeklyKind } from "./types";

export const WEEKLY_LAYOUTS = ["modern-gradient", "framed-editorial", "geometric-focus", "cinematic", "heritage", "gallery-story", "bold-spotlight", "weekly-banner", "weekly-orbit", "weekly-editorial", "weekly-diagonal", "weekly-frame"] as const;
const PILLARS = ["Discover", "Understand", "Use", "Choose"];
const THEMES = ["the essentials", "thoughtful details", "everyday routines", "a fresh perspective", "materials and methods", "questions worth asking", "small improvements", "care and preparation", "the process", "finding the right fit", "creative possibilities", "lasting value", "your next step"];
const ANGLES = ["a practical introduction", "one useful detail", "a real-world use", "a common question", "a helpful checklist", "a closer look", "an invitation to explore"];
export type WeeklyPhoto = { imageUrl: string; sourceUrl: string; productName: string; assetId?: string };
export function dateOnly(value: Date) { return value.toISOString().slice(0, 10); }
export function dateValue(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || dateOnly(parsed) !== value) throw new Error("Choose a valid week.");
  return parsed;
}
export function monday(value: string | Date = new Date()) {
  const date = typeof value === "string" ? dateValue(value) : new Date(value);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return dateOnly(date);
}
export function addDays(value: string, count: number) { const date = dateValue(value); date.setUTCDate(date.getUTCDate() + count); return dateOnly(date); }
export function annualPosition(weekStart: string, startsOn: string) {
  const index = Math.max(0, Math.round((dateValue(weekStart).getTime() - dateValue(monday(startsOn)).getTime()) / 604800000));
  return { weekNumber: index % 52 + 1, cycle: Math.floor(index / 52) + 1 };
}
/** Keep one origin even if the customer prepares a later week before this one. */
export function annualStart(history: WeeklyManifest[], fallback = monday()) {
  const first = history[0];
  if (!first) return fallback;
  if (first.startsOn) return monday(first.startsOn);
  const index = (Math.max(1, first.cycle || 1) - 1) * 52 + Math.max(1, first.weekNumber || 1) - 1;
  return addDays(first.weekStart, -index * 7);
}
export function weeklyPackId(organizationId: string, brandId: string, weekStart: string) {
  return `weekly-${createHash("sha256").update(JSON.stringify([organizationId, brandId, weekStart])).digest("hex").slice(0, 40)}`;
}
function rank(seed: string, value: string) { return createHash("sha256").update(`${seed}:${value}`).digest("hex"); }
export function photoGroups(photos: WeeklyPhoto[]) {
  const groups = new Map<string, WeeklyPhoto[]>();
  for (const photo of photos) {
    if (!photo.sourceUrl || !photo.productName || !photo.imageUrl) continue;
    const key = `${photo.sourceUrl.replace(/\/$/, "")}::${photo.productName.toLowerCase().trim()}`;
    const rows = groups.get(key) || [];
    if (!rows.some(row => row.imageUrl === photo.imageUrl)) rows.push(photo);
    groups.set(key, rows);
  }
  return [...groups.values()];
}
/** A year is a plan, not 364 invented finished assets. Every slot has a stable
 * editorial angle and a history-aware layout; generation happens per week. */
export function planWeek(input: { organizationId: string; brandId: string; brandName: string; weekStart: string; startsOn: string; mix: WeeklyMix; photos: WeeklyPhoto[]; history: WeeklyManifest[] }): { slots: WeeklySlot[]; weekNumber: number; cycle: number } {
  const { weekNumber, cycle } = annualPosition(input.weekStart, input.startsOn);
  const count = input.mix.images + input.mix.motionReels + input.mix.aiVideos;
  const kinds: WeeklyKind[] = Array.from({ length: count }, () => "image");
  const videoCount = input.mix.motionReels + input.mix.aiVideos;
  for (let index = 0; index < videoCount; index++) kinds[Math.min(count - 1, Math.floor((index + 1) * count / (videoCount + 1)))] = index < input.mix.motionReels ? "motion_reel" : "ai_video";
  const prior = input.history.filter(row => row.brandId === input.brandId && row.weekStart < input.weekStart).sort((a, b) => a.weekStart.localeCompare(b.weekStart)).flatMap(row => row.slots);
  const layouts = prior.map(slot => slot.layout), photos = prior.map(slot => slot.sourceImageUrl || "");
  const gallery = photoGroups(input.photos).filter(rows => rows.length >= 3);
  const slots: WeeklySlot[] = [];
  for (let index = 0; index < count; index++) {
    const day = Math.floor(index * 7 / count) + 1, kind = kinds[index];
    const seed = `${input.organizationId}:${input.brandId}:${input.weekStart}:${index}`;
    const available = WEEKLY_LAYOUTS.filter(layout => !layouts.slice(-5).includes(layout));
    const layout = [...available].sort((a, b) => layouts.lastIndexOf(a) - layouts.lastIndexOf(b) || rank(seed, a).localeCompare(rank(seed, b)))[0];
    layouts.push(layout);
    const candidates = kind === "image" ? input.photos : gallery[(weekNumber + index) % Math.max(1, gallery.length)] || [];
    const source = [...candidates].sort((a, b) => photos.lastIndexOf(a.imageUrl) - photos.lastIndexOf(b.imageUrl) || rank(seed, a.imageUrl).localeCompare(rank(seed, b.imageUrl)))[0];
    if (source) photos.push(source.imageUrl);
    const theme = `${PILLARS[(weekNumber - 1) % 4]} ${THEMES[Math.floor((weekNumber - 1) / 4)]}`;
    const topic = `${source?.productName || input.brandName}: ${theme}; ${ANGLES[(index + cycle - 1) % 7]}${count > 7 ? `, perspective ${Math.floor(index / 7) + 1}` : ""}`;
    slots.push({ key: `week-${cycle}-${weekNumber}-slot-${index + 1}`, day, date: addDays(input.weekStart, day - 1), kind, topic, layout, ...(source ? { sourceImageUrl: source.imageUrl, sourceUrl: source.sourceUrl, productName: source.productName } : {}) });
  }
  return { slots, weekNumber, cycle };
}
export function manifestOf(payload: unknown): WeeklyManifest | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as WeeklyManifest;
  return p.version === 1 && typeof p.brandId === "string" && typeof p.campaignId === "string" && typeof p.weekStart === "string" && Array.isArray(p.slots) ? p : null;
}
export function weeklyUsage(manifests: WeeklyManifest[], weekStart: string) {
  return { postsThisWeek: manifests.filter(row => row.weekStart === weekStart).reduce((total, row) => total + row.slots.length, 0), trialPacksUsed: manifests.filter(row => row.oneTime).length };
}
