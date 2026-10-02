import type { PublishResult } from "./providers";

// Instagram Login tokens use graph.instagram.com, not the Facebook Page API.
export async function publishInstagram(input: {
  accessToken: string;
  accountId: string;
  caption: string;
  mediaUrl?: string | null;
}): Promise<PublishResult> {
  if (!input.mediaUrl) return { ok: false, error: "Instagram requires an image for feed posts." };
  if (!input.accountId) return { ok: false, error: "INSTAGRAM_ACCOUNT_ID_MISSING" };
  if (input.caption.length > 2200) return { ok: false, error: "Instagram captions must be at most 2,200 characters." };

  const api = async (path: string, params: Record<string, string>, method = "GET") => {
    const query = new URLSearchParams(params);
    const response = await fetch(`https://graph.instagram.com/v23.0/${path}${method === "GET" ? `?${query}` : ""}`, {
      method,
      headers: { Authorization: `Bearer ${input.accessToken}`, ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      ...(method === "POST" ? { body: query } : {}),
      cache: "no-store",
    });
    const data = await response.json();
    return { response, data };
  };
  const failure = (result: { response: Response; data: any }, fallback: string): PublishResult => ({
    ok: false, code: result.response.status, error: result.data?.error?.message || fallback,
  });

  try {
    const identity = await api("me", { fields: "id,username" });
    if (!identity.response.ok) return failure(identity, "INSTAGRAM_IDENTITY_FAILED");
    if (String(identity.data.id) !== input.accountId) return { ok: false, error: "INSTAGRAM_ACCOUNT_ID_MISMATCH" };

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const imageUrl = new URL(input.mediaUrl, appUrl);
    // Reuse the existing captured creative's JPEG export. Do not change its renderer.
    if (appUrl && imageUrl.origin === new URL(appUrl).origin) {
      imageUrl.pathname = imageUrl.pathname.replace(/^\/api\/media\/([^/]+)(?:\/publish)?$/, "/api/media/$1/publish");
    }
    if (imageUrl.protocol !== "https:") return { ok: false, error: "Instagram requires a public HTTPS image URL." };
    const image = await fetch(imageUrl, { cache: "no-store" });
    if (!image.ok) return { ok: false, code: image.status, error: "INSTAGRAM_IMAGE_UNAVAILABLE" };
    const bytes = new Uint8Array(await image.arrayBuffer());
    if (bytes.length > 8 * 1024 * 1024) return { ok: false, error: "Instagram images must be at most 8 MB." };
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
      return { ok: false, error: "Instagram requires a JPEG image." };
    }

    const container = await api(`${input.accountId}/media`, { image_url: imageUrl.toString(), caption: input.caption }, "POST");
    const containerId = container.data?.id ? String(container.data.id) : "";
    if (!container.response.ok || !containerId) return failure(container, "INSTAGRAM_CONTAINER_CREATE_FAILED");
    console.log("INSTAGRAM_CREATED", JSON.stringify({ accountId: input.accountId, containerId }));

    // Publish only after Meta confirms that the image was fetched and processed.
    let ready = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      const status = await api(containerId, { fields: "status_code,status" });
      if (!status.response.ok) return failure(status, "INSTAGRAM_CONTAINER_STATUS_FAILED");
      if (status.data.status_code === "FINISHED") { ready = true; break; }
      if (["ERROR", "EXPIRED"].includes(status.data.status_code)) {
        return { ok: false, error: status.data.status || `INSTAGRAM_CONTAINER_${status.data.status_code}` };
      }
      if (attempt < 9) await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    if (!ready) return { ok: false, error: "INSTAGRAM_IMAGE_PROCESSING_TIMEOUT" };

    const published = await api(`${input.accountId}/media_publish`, { creation_id: containerId }, "POST");
    const mediaId = published.data?.id ? String(published.data.id) : "";
    if (!published.response.ok || !mediaId) return failure(published, "INSTAGRAM_PUBLISH_FAILED");
    console.log("INSTAGRAM_PUBLISHED", JSON.stringify({ accountId: input.accountId, containerId, mediaId }));

    // A confirmed publish must stay successful even if the subsequent read fails;
    // reporting failure here could cause the queue to publish the same image again.
    try {
      const verify = await api(mediaId, { fields: "id,permalink,media_type" });
      console.log("INSTAGRAM_VERIFY", JSON.stringify({ mediaId, verifiedId: verify.data?.id, hasPermalink: Boolean(verify.data?.permalink), mediaType: verify.data?.media_type, status: verify.response.status }));
    } catch {
      console.warn("INSTAGRAM_VERIFY_READ_FAILED", JSON.stringify({ mediaId }));
    }
    return { ok: true, code: published.response.status, externalId: mediaId };
  } catch {
    return { ok: false, error: "INSTAGRAM_PROVIDER_REQUEST_FAILED" };
  }
}
