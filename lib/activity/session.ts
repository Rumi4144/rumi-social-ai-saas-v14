export const ACTIVITY_ACTION = "account.session.activity";
export const CHECK_IN_MS = 30_000;
export const ONLINE_WINDOW_MS = 90_000;
export const IDLE_AFTER_SECONDS = 300;

export type ActivityTab = { seenAt: string; activeAt: string; active: boolean };
export type ActivitySession = {
  version: 1;
  signedInAt: string | null;
  trackingStartedAt: string;
  lastSeenAt: string;
  lastActiveAt: string | null;
  activeSeconds: number;
  endedAt: string | null;
  tabs: Record<string, ActivityTab>;
};

export type CheckIn = { tabId: string; visible: boolean; idleSeconds: number };

export function newActivitySession(signedInAt: string | null, now: Date): ActivitySession {
  return {
    version: 1, signedInAt, trackingStartedAt: now.toISOString(),
    lastSeenAt: now.toISOString(), lastActiveAt: null,
    activeSeconds: 0, endedAt: null, tabs: {},
  };
}

export function readActivitySession(value: unknown): ActivitySession | null {
  const s = value as ActivitySession | null;
  if (!s || s.version !== 1 || !Number.isFinite(Date.parse(s.trackingStartedAt)) ||
      !Number.isFinite(Date.parse(s.lastSeenAt)) || !Number.isFinite(s.activeSeconds) ||
      s.activeSeconds < 0 || !s.tabs || typeof s.tabs !== "object") return null;
  return s;
}

export function activityStatus(session: ActivitySession, now: Date): "Online" | "Idle" | "Offline" | "Signed out" {
  if (session.endedAt) return "Signed out";
  const recentTabs = Object.values(session.tabs).filter(tab =>
    now.getTime() - Date.parse(tab.seenAt) < ONLINE_WINDOW_MS);
  if (!recentTabs.length) return "Offline";
  return recentTabs.some(tab => tab.active) ? "Online" : "Idle";
}

export function applyCheckIn(session: ActivitySession, input: CheckIn, now: Date): ActivitySession {
  // A late request from another tab must never reopen a signed-out session.
  if (session.endedAt) return session;
  const elapsed = Math.max(0, (now.getTime() - Date.parse(session.lastSeenAt)) / 1000);
  const wasActive = activityStatus(session, new Date(session.lastSeenAt)) === "Online";
  // Count each elapsed interval once for the entire sign-in, across all tabs.
  // Missing check-ins (sleep, closed browser, lost connection) contribute no time.
  const credit = wasActive && elapsed <= CHECK_IN_MS / 1000 * 2.5 ? elapsed : 0;
  const tabs = Object.fromEntries(Object.entries(session.tabs).filter(([, tab]) =>
    now.getTime() - Date.parse(tab.seenAt) < ONLINE_WINDOW_MS));
  const activeAt = new Date(Math.max(Date.parse(session.trackingStartedAt),
    now.getTime() - input.idleSeconds * 1000)).toISOString();
  tabs[input.tabId] = {
    seenAt: now.toISOString(), activeAt,
    active: input.visible && input.idleSeconds < IDLE_AFTER_SECONDS,
  };
  // Bound storage even if a client repeatedly sends different tab identifiers.
  const keptTabs = Object.fromEntries(Object.entries(tabs)
    .sort((a, b) => b[1].seenAt.localeCompare(a[1].seenAt)).slice(0, 20));
  const lastActiveAt = input.visible && input.idleSeconds < IDLE_AFTER_SECONDS
    ? [session.lastActiveAt || "", activeAt].sort().at(-1)!
    : session.lastActiveAt;
  return { ...session, lastSeenAt: now.toISOString(), lastActiveAt,
    activeSeconds: session.activeSeconds + credit, tabs: keptTabs };
}

export function sessionSpanSeconds(session: ActivitySession): number {
  return Math.max(0, (Date.parse(session.endedAt || session.lastSeenAt) -
    Date.parse(session.signedInAt || session.trackingStartedAt)) / 1000);
}

export type ActivityRow = {
  id: string;
  userName: string;
  email: string;
  business: string;
  session: Omit<ActivitySession, "tabs">;
  status: ReturnType<typeof activityStatus>;
  spanSeconds: number;
};

export type ActivityPage = { rows: ActivityRow[]; hasMore: boolean; updatedAt: string };
