import { get } from "@vercel/blob";
import { decodeClip } from "./clips";

export async function videoBytes(asset: { url: string | null; metadata: unknown; organizationId: string; id: string }) {
  if (asset.url?.startsWith("data:")) return decodeClip(asset.url);
  const metadata = asset.metadata as { pathname?: string } | null;
  const pathname = metadata?.pathname;
  // Generated clips must come from this workspace's private store.
  if (pathname !== `runway/${asset.organizationId}/${asset.id}.mp4`) throw new Error("Video storage unavailable.");
  const stored = await get(pathname, { access: "private" });
  if (stored?.statusCode !== 200 || stored.blob.size > 100_000_000) throw new Error("Video unavailable.");
  const bytes = Buffer.from(await new Response(stored.stream).arrayBuffer());
  if (bytes.length > 100_000_000) throw new Error("Video too large.");
  return { bytes, contentType: "video/mp4" };
}
