import { privateReelPath } from "@/lib/reels/storage";
import { get } from "@vercel/blob";
import { decodeClip } from "./clips";

export async function videoBytes(asset: { url: string | null; metadata: unknown; organizationId: string; id: string; contentItemId?: string | null }) {
  if (asset.url?.startsWith("data:")) return decodeClip(asset.url);
  const metadata = asset.metadata as { pathname?: string; contentType?: string } | null;
  const pathname = metadata?.pathname;
  // Generated clips must come from this workspace's private store.
  if (!pathname || (pathname !== `runway/${asset.organizationId}/${asset.id}.mp4` && (!asset.contentItemId || !privateReelPath(pathname, asset.organizationId, asset.contentItemId)))) throw new Error("Video storage unavailable.");
  const stored = await get(pathname, { access: "private" });
  if (stored?.statusCode !== 200 || stored.blob.size > 100_000_000) throw new Error("Video unavailable.");
  const bytes = Buffer.from(await new Response(stored.stream).arrayBuffer());
  if (bytes.length > 100_000_000) throw new Error("Video too large.");
  return { bytes, contentType: metadata?.contentType === "video/webm" ? "video/webm" : "video/mp4" };
}
