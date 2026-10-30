import { createHash } from "node:crypto";

/** Bind a rendered reel to the copy and selected artwork it was prepared from. */
export function reelPostRevision(item: { headline?: string | null; caption?: string | null; mediaUrl?: string | null }) {
  return createHash("sha256").update(JSON.stringify([item.headline || "", item.caption || "", item.mediaUrl || ""])).digest("hex");
}
