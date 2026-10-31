import type { Prisma } from "@prisma/client";
import { encryptSecret } from "@/lib/security/crypto";

export const FACEBOOK_OAUTH_TYPE = "FACEBOOK_OAUTH";
export const FACEBOOK_SELECTION_TYPE = "facebook_page_selection";
export type FacebookAttempt = {
  userId?: string;
  connectionId?: string | null;
  accountId?: string | null;
  redirectUri?: string;
  expiresAt?: number;
  encryptedPages?: string;
};
export type FacebookPage = { id: string; name: string; accessToken: string; pictureUrl?: string; tasks?: string[] };

export function facebookConfig() {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appId || !appSecret || !appUrl || new URL(appUrl).protocol !== "https:") throw new Error("FACEBOOK_SETUP_MISSING");
  // Keep the callback used by the existing Facebook app registration.
  return { appId, appSecret, redirectUri: `${appUrl}/api/social/facebook/callback` };
}

export function canManageFacebook(role: string) {
  return ["owner", "admin", "member", "superadmin"].includes(role);
}

export function validFacebookAttempt(payload: FacebookAttempt | null, userId: string) {
  return !!payload && payload.userId === userId && typeof payload.expiresAt === "number" && payload.expiresAt > Date.now();
}

// Call within the organization lock, after claiming the one-use OAuth/selection job.
export async function saveFacebookPage(tx: Prisma.TransactionClient, organizationId: string, attempt: FacebookAttempt, page: FacebookPage) {
  if (!page.id || !page.accessToken || (attempt.accountId && attempt.accountId !== page.id)) throw new Error("PAGE_MISMATCH");
  const existing = await tx.socialConnection.findFirst({ where: {
    organizationId, provider: "facebook",
    ...(attempt.connectionId ? { id: attempt.connectionId } : { externalId: page.id }),
  } });
  if (attempt.connectionId && (!existing || existing.externalId !== page.id)) throw new Error("CONNECTION_CHANGED");
  const data = {
    accountName: page.name || "Facebook Page", status: "connected",
    encryptedToken: encryptSecret(JSON.stringify({ pageAccessToken: page.accessToken, pageId: page.id, tasks: page.tasks || [] })),
  };
  // Never retarget an existing connection: pending deliveries and history refer to its identity.
  if (existing) await tx.socialConnection.update({ where: { id: existing.id }, data });
  else await tx.socialConnection.create({ data: { organizationId, provider: "facebook", externalId: page.id, ...data } });
}

export function facebookMessage(reason?: string) {
  const messages: Record<string, string> = {
    setup: "Facebook connection setup is incomplete. Ask the administrator to check the app settings.",
    session: "This Facebook sign-in expired or was cancelled. Start again from Settings.",
    workspace: "You do not have permission to change Facebook connections for this business.",
    token_exchange: "Facebook did not accept the sign-in. Try Reconnect Facebook and allow the requested access.",
    pages: "Rumi could not read your Facebook Pages. Reconnect with a Facebook account that can manage the Page and allow the requested access.",
    no_pages: "Facebook returned no available Pages. Check your Page access and allow Rumi to access the Page when reconnecting.",
    account_mismatch: "The saved Facebook Page was not available. Reconnect with an account that manages that same Page and select it in Facebook's permission screen. To use a different Page, disconnect first.",
    encryption_key_missing: "Rumi could not securely save the connection. Ask the administrator to check the app settings.",
    disconnected: "Facebook access has expired or was removed. Choose Reconnect Facebook.",
    temporarily_unavailable: "Facebook could not be checked right now. Try Check connection again shortly.",
  };
  return messages[reason || ""] || "Facebook could not finish connecting. Try again from Settings.";
}
