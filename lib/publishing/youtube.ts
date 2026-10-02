import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import { prisma } from "@/lib/prisma";
import { deleteYouTubeData } from "./youtube-data";

export { YOUTUBE_CHUNK_SIZE, YOUTUBE_MAX_SIZE } from "@/app/publishing/youtube-limits";

export async function youtubeAccessToken(connection: { id: string; organizationId?: string; encryptedToken: string | null }, forceRefresh = false) {
  if (!connection.encryptedToken) throw new Error("Reconnect YouTube in Settings.");
  const bundle = JSON.parse(decryptSecret(connection.encryptedToken));
  if (!forceRefresh && bundle.accessToken && Number(bundle.expiresAt) > Date.now() + 60000) return String(bundle.accessToken);
  if (!bundle.refreshToken) throw new Error("Your YouTube connection expired. Reconnect it in Settings.");
  if (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) throw new Error("YouTube credentials are not configured.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET, refresh_token: bundle.refreshToken, grant_type: "refresh_token" }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    if (data.error === "invalid_grant" && connection.organizationId) await deleteYouTubeData({ ...connection, organizationId: connection.organizationId });
    throw new Error("Your YouTube connection expired. Reconnect it in Settings.");
  }
  const updated = { ...bundle, accessToken: data.access_token, refreshToken: data.refresh_token || bundle.refreshToken, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 };
  // A refresh must not overwrite an account that was reconnected concurrently.
  await prisma.socialConnection.updateMany({ where: { id: connection.id, encryptedToken: connection.encryptedToken }, data: { encryptedToken: encryptSecret(JSON.stringify(updated)) } });
  return String(data.access_token);
}

export function youtubeUploadUrl(value: string) {
  const url = new URL(value);
  if (url.origin !== "https://www.googleapis.com" || url.pathname !== "/upload/youtube/v3/videos" || url.username || url.password) throw new Error("YouTube returned an invalid upload session.");
  return url.toString();
}

export function youtubeNextOffset(range: string | null, total: number) {
  if (!range) return 0;
  const match = /^bytes=0-(\d+)$/.exec(range);
  const next = match ? Number(match[1]) + 1 : NaN;
  if (!Number.isSafeInteger(next) || next < 1 || next > total) throw new Error("YouTube returned an invalid upload offset.");
  return next;
}
