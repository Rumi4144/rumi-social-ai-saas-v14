import { createHash } from "node:crypto";
export function reelAssetId(pathname: string) { return `reel_${createHash("sha256").update(pathname).digest("hex").slice(0, 32)}`; }
export function privateReelPath(pathname: string, organizationId: string, contentItemId: string) {
  return pathname.startsWith(`reels/${organizationId}/${contentItemId}/`) && /^reels\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-f0-9-]{36}\.(mp4|webm)$/.test(pathname);
}
