import { decryptSecret } from "@/lib/security/crypto";

export type PublishResult = {
  ok: boolean;
  externalId?: string;
  code?: number;
  error?: string;
};

async function facebookJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store" });
  let result: any = null;
  try { result = await response.json(); } catch { result = null; }
  return { response, result };
}

export async function publishToProvider(input: {
  platform: string;
  token: string;
  externalAccountId: string;
  caption: string;
  mediaUrl?: string | null;
}): Promise<PublishResult> {
  if (!input.token) return { ok: false, error: "MISSING_TOKEN" };

  let decrypted: string;
  try { decrypted = decryptSecret(input.token); }
  catch { return { ok: false, error: "TOKEN_DECRYPT_FAILED" }; }

  if (input.platform.toLowerCase() !== "facebook") {
    return { ok: false, error: `${input.platform.toUpperCase()}_PROVIDER_NOT_CONFIGURED` };
  }

  try {
    const stored = JSON.parse(decrypted) as { pageAccessToken?: string; pageId?: string };
    const pageAccessToken = stored.pageAccessToken;
    const pageId = stored.pageId || input.externalAccountId;
    if (!pageAccessToken || !pageId) return { ok: false, error: "FACEBOOK_PAGE_CREDENTIALS_MISSING" };

    // Verify the Page token belongs to the Page we are about to publish to.
    const identity = await facebookJson(
      `https://graph.facebook.com/v23.0/me?fields=id,name&access_token=${encodeURIComponent(pageAccessToken)}`
    );
    if (!identity.response.ok || !identity.result?.id) {
      return { ok: false, code: identity.response.status, error: identity.result?.error?.message || "FACEBOOK_PAGE_IDENTITY_FAILED" };
    }
    if (String(identity.result.id) !== String(pageId)) {
      return { ok: false, error: `FACEBOOK_PAGE_ID_MISMATCH:${identity.result.id}:${pageId}` };
    }

    // Text-only posts are straightforward Page feed posts.
    if (!input.mediaUrl) {
      const body = new URLSearchParams({ message: input.caption || "", access_token: pageAccessToken });
      const { response, result } = await facebookJson(
        `https://graph.facebook.com/v23.0/${pageId}/feed`,
        { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }
      );
      if (!response.ok) return { ok: false, code: response.status, error: result?.error?.message || "FACEBOOK_FEED_PUBLISH_FAILED" };
      return { ok: true, code: response.status, externalId: result?.id ? String(result.id) : undefined };
    }

    // Fetch the final raster creative from Rumi Social AI.
    const mediaResponse = await fetch(input.mediaUrl, { cache: "no-store" });
    if (!mediaResponse.ok) return { ok: false, code: mediaResponse.status, error: `FACEBOOK_MEDIA_FETCH_FAILED_${mediaResponse.status}` };
    const mediaBytes = await mediaResponse.arrayBuffer();
    if (mediaBytes.byteLength >= 10 * 1024 * 1024) return { ok: false, error: "FACEBOOK_IMAGE_TOO_LARGE" };
    const mediaType = mediaResponse.headers.get("content-type") || "image/jpeg";

    // Stage media as unpublished, so the staging upload itself does not create a Page photo story.
    const form = new FormData();
    form.append("source", new Blob([mediaBytes], { type: mediaType }), mediaType.includes("png") ? "creative.png" : "creative.jpg");
    form.append("published", "false");
    form.append("access_token", pageAccessToken);

    const upload = await facebookJson(
      `https://graph.facebook.com/v23.0/${pageId}/photos`,
      { method: "POST", body: form }
    );
    const photoId = upload.result?.id ? String(upload.result.id) : "";
    if (!upload.response.ok || !photoId) {
      return { ok: false, code: upload.response.status, error: upload.result?.error?.message || "FACEBOOK_PHOTO_STAGE_FAILED" };
    }

    // Attach the staged media to a Page feed story using Meta's indexed attached_media form field.
    const feedBody = new URLSearchParams();
    feedBody.set("message", input.caption || "");
    feedBody.set("attached_media[0]", JSON.stringify({ media_fbid: photoId }));
    feedBody.set("access_token", pageAccessToken);

    const feed = await facebookJson(
      `https://graph.facebook.com/v23.0/${pageId}/feed`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: feedBody }
    );
    const postId = feed.result?.id ? String(feed.result.id) : "";

    console.log(
      "FACEBOOK_V3_CREATED",
      JSON.stringify({ pageId, photoId, postId })
    );

    if (!feed.response.ok || !postId) {
      await facebookJson(`https://graph.facebook.com/v23.0/${photoId}?access_token=${encodeURIComponent(pageAccessToken)}`, { method: "DELETE" }).catch(() => null);
      return { ok: false, code: feed.response.status, error: feed.result?.error?.message || "FACEBOOK_FEED_ATTACH_FAILED" };
    }

    // Verify the exact object Meta just returned instead of requiring the
    // Page /feed collection to reflect it immediately. The collection can lag.
    const verify = await facebookJson(
      `https://graph.facebook.com/v23.0/${postId}?fields=id,permalink_url,is_published,attachments&access_token=${encodeURIComponent(pageAccessToken)}`
    );

    const verifiedId = verify.result?.id ? String(verify.result.id) : "";
    const permalink = typeof verify.result?.permalink_url === "string"
      ? verify.result.permalink_url
      : "";
    const isPublished = verify.result?.is_published === true;
    const attachments = Array.isArray(verify.result?.attachments?.data)
      ? verify.result.attachments.data
      : [];
    const hasAttachment = attachments.length > 0;

    console.log(
      "FACEBOOK_V3_VERIFY",
      JSON.stringify({
        postId,
        verifiedId,
        isPublished,
        hasPermalink: Boolean(permalink),
        hasAttachment,
      })
    );

    if (
      !verify.response.ok ||
      verifiedId !== postId ||
      !isPublished ||
      !permalink ||
      !hasAttachment
    ) {
      await facebookJson(`https://graph.facebook.com/v23.0/${postId}?access_token=${encodeURIComponent(pageAccessToken)}`, { method: "DELETE" }).catch(() => null);
      await facebookJson(`https://graph.facebook.com/v23.0/${photoId}?access_token=${encodeURIComponent(pageAccessToken)}`, { method: "DELETE" }).catch(() => null);
      return {
        ok: false,
        code: verify.response.status || 409,
        error: verify.result?.error?.message || "FACEBOOK_POST_VERIFICATION_FAILED",
      };
    }

    return { ok: true, code: feed.response.status, externalId: postId };
  } catch (error) {
    console.error("Facebook provider failed", error);
    return { ok: false, error: error instanceof Error ? error.message : "FACEBOOK_PROVIDER_FAILED" };
  }
}
