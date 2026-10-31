// Preserve the callback registered in the existing Meta app unless explicitly configured.
export function instagramConfig() {
  const appId = process.env.INSTAGRAM_APP_ID || process.env.META_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || "https://rumi-social-ai-saas-v14.vercel.app/api/social/instagram/callback";
  if (!appId || !appSecret || !appUrl) throw new Error("INSTAGRAM_SETUP_MISSING");
  if (new URL(appUrl).protocol !== "https:" || new URL(redirectUri).protocol !== "https:") throw new Error("INSTAGRAM_SETUP_MISSING");
  return { appId, appSecret, appUrl, redirectUri };
}

export const INSTAGRAM_OAUTH_TYPE = "INSTAGRAM_OAUTH";
export function canManageInstagram(role: string) {
  return ["owner", "admin", "member", "superadmin"].includes(role);
}

export function instagramMessage(reason?: string) {
  const messages: Record<string, string> = {
    setup: "Instagram connection setup is incomplete. Ask the administrator to check the app settings.",
    session: "This Instagram sign-in expired or was cancelled. Start again from Settings.",
    workspace: "You do not have permission to change Instagram connections for this business.",
    token_exchange: "Instagram did not accept the sign-in. Try Reconnect Instagram and allow the requested access.",
    long_token: "Instagram could not finish authorizing the connection. Try reconnecting again.",
    profile: "Rumi could not read the Instagram account. Use an Instagram Business or Creator account and allow the requested access.",
    account_mismatch: "A different Instagram account was selected. Reconnect using the account shown in Settings, or disconnect it first to change accounts.",
    encryption_key_missing: "Rumi could not securely save the connection. Ask the administrator to check the app settings.",
    disconnected: "Instagram access has expired or was removed. Choose Reconnect Instagram.",
    temporarily_unavailable: "Instagram could not be checked right now. Try Check connection again shortly.",
  };
  return messages[reason || ""] || "Instagram could not finish connecting. Try again from Settings.";
}
