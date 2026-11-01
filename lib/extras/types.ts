import type { ExtraKind, PresenterChoice } from "./catalog";
import type { WeeklyItem, WeeklyManifest } from "../weekly/types";
export type ExtraRequest = { requestId: string; brandId: string; kind: ExtraKind; brief: string; productId?: string; presenter?: PresenterChoice; expectedCredits: number };
export type ExtraManifest = WeeklyManifest & { extraKind: ExtraKind; brief: string; productId?: string; presenter?: PresenterChoice; fingerprint: string; providerBudgetUsd?: number };
export type ExtraSummary = { id: string; kind: ExtraKind; title: string; createdAt: string; status: string; error: string | null; nextJobId: string | null; pendingJobs: number; item: WeeklyItem | null };
export type ExtrasResponse = {
  organizationId: string; canManage: boolean; availableCredits: number; canCreate: boolean; reason: string | null;
  brands: Array<{id: string; name: string; products: Array<{id: string; name: string; reelAvailable: boolean}>}>;
  configured: Record<ExtraKind, boolean>; extras: ExtraSummary[];
};
