// The production Login Kit revision still registers the original deployment URL.
// Do not request unapproved posting scopes just because a draft contains them.
export function tikTokOAuthConfig(appUrl: string) {
  const origin = new URL(appUrl).origin;
  const postingApproved = process.env.TIKTOK_CONTENT_POSTING_APPROVED === "true";
  const legacyOrigin = "https://rumi-social-ai-saas-v14.vercel.app";
  const redirectUri = process.env.TIKTOK_REDIRECT_URI ||
    `${!postingApproved && origin === "https://rumisocialai.com" ? legacyOrigin : origin}/api/social/tiktok/callback/`;
  const redirect = new URL(redirectUri);
  if ((redirect.origin !== origin && !(origin === "https://rumisocialai.com" && redirect.origin === legacyOrigin)) ||
      redirect.pathname !== "/api/social/tiktok/callback/" || redirect.search || redirect.hash || redirect.username || redirect.password) {
    throw new Error("TIKTOK_REDIRECT_URI_INVALID");
  }
  return { redirectUri, scope: postingApproved ? "user.info.basic,video.publish" : "user.info.basic" };
}
