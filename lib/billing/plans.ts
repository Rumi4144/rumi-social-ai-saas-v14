import { canonicalPlan, PACKAGE_CATALOG, type PaidPackageKey } from "./packages";
export const PLANS = Object.fromEntries(Object.entries(PACKAGE_CATALOG).map(([key, item]) => [key, { name: item.label, monthlyCredits: item.monthlyCredits, brands: item.brands, team: item.team, clients: item.clients, socialAccounts: item.socialAccounts, scheduledPosts: item.scheduledPosts, video: true, whiteLabel: item.whiteLabel }])) as Record<PaidPackageKey, {name:string;monthlyCredits:number;brands:number;team:number;clients:number;socialAccounts:number;scheduledPosts:number;video:boolean;whiteLabel:boolean}>;
export type PlanKey = PaidPackageKey;
export function planFor(key?: string | null) { return PLANS[canonicalPlan(key)]; }
export const TOPUPS = { small: { credits: 250 }, medium: { credits: 750 }, large: { credits: 2000 } } as const;
