import type { WeeklyMix } from "../billing/packages";

export type WeeklyKind = "image" | "motion_reel" | "ai_video";
export type WeeklySlot = {
  key: string; day: number; date: string; kind: WeeklyKind; topic: string;
  layout: string; sourceImageUrl?: string; sourceUrl?: string; productName?: string;
};
export type WeeklyManifest = {
  version: 1; brandId: string; campaignId: string; generationJobId: string;
  weekStart: string; weekEnd: string; weekNumber: number; cycle: number; startsOn?: string;
  requestId: string; mix: WeeklyMix; slots: WeeklySlot[]; oneTime: boolean;
  preparationCredits: number; completionCredits: number; packCredits: number;
};
export type WeeklyItemMapping = { slotKey: string; contentItemId: string };
export type WeeklyDelivery = { id: string; connectionId: string; platform: string; account: string; status: string; scheduledFor: string; error: string | null; publishedAt: string | null };
export type WeeklyItem = {
  id: string; campaignId: string; brandId: string; date: string; day: number;
  plannedDate?: string; canChangeDate?: boolean;
  type: string; kind: WeeklyKind; headline: string; caption: string;
  status: string; isReady: boolean; approvalBlockedReason: string | null;
  previewUrl: string | null; mediaUrl: string | null; mediaKind: "image" | "video" | null;
  assetId: string | null; downloadUrl: string | null; platforms: string[];
  needsAttention: boolean; deliveries: WeeklyDelivery[];
  changeRequest: { comment: string; createdAt: string } | null;
  changesRequested: boolean;
  nextAction: "prepare" | "finish_motion_reel" | "finish_ai_video" | "review" | "delivery_attention";
};
export type WeeklyResponse = {
  organizationId: string; canManage: boolean;
  brands: Array<{ id: string; name: string }>;
  brand: { id: string; name: string; website: string | null; logoUrl: string | null } | null;
  weekStart: string; weekEnd: string; weekNumber: number;
  pack: (WeeklyManifest & { id: string; status: "preparing" | "needs_attention" | "ready" | "complete"; error: string | null; pendingJobs: number; nextJobId: string | null }) | null;
  items: WeeklyItem[];
  prepare: { allowed: boolean; reason: string | null; mix: WeeklyMix; preparationCredits: number; completionCredits: number; totalCredits: number; availableCredits: number; warnings: string[]; motionAvailable: boolean; aiVideoAvailable: boolean };
  plan: { key: string; label: string; weeklyPosts: number; mix: WeeklyMix; oneTime: boolean; postsThisWeek: number };
  annualPlan: { weeks: 52; days: 364; cycle: number; preparedWeeks: number; generatedPosts: number; startsOn: string };
};
export type PrepareWeeklyRequest = { action: "prepare"; requestId: string; brandId?: string; weekStart?: string; expectedCredits: number; mix?: WeeklyMix };
export type WeeklyMutationResponse = { packId: string; campaignId: string; jobId: string; reused: boolean; preparationCredits: number };
