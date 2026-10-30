/** Resolve only saved media on this application, never a client-supplied host. */
export function savedItemMedia(value: string | null | undefined) {
  if (!value) return null;
  try {
    const origin = process.env.NEXT_PUBLIC_APP_URL || "https://rumisocialai.com";
    const url = new URL(value, origin);
    if (url.origin !== new URL(origin).origin || url.username || url.password || url.hash) return null;
    const video = /^\/api\/video\/media\/([\w-]+)$/.exec(url.pathname);
    const image = /^\/api\/media\/([\w-]+)(?:\/publish)?$/.exec(url.pathname);
    if (!video && !image) return null;
    return { id: (video || image)![1], kind: video ? "video" as const : "image" as const };
  } catch { return null; }
}

export const lockedDeliveryStatuses = ["scheduled", "publishing", "retry", "processing", "verification_pending", "published"];
export const downloadableStatuses = ["approved", "scheduled", "published"];

export function safeDownloadName(headline: string | null | undefined) {
  return (headline || "rumi-post").normalize("NFKD").replace(/[^a-zA-Z0-9 -]/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "rumi-post";
}
