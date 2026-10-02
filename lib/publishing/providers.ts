import { decryptSecret } from "@/lib/security/crypto";

export type PublishResult = {
  ok: boolean;
  externalId?: string;
  code?: number;
  error?: string;
};

export async function publishToProvider(input: {
  platform: string;
  token: string;
  externalAccountId: string;
  caption: string;
  mediaUrl?: string | null;
}): Promise<PublishResult> {
  if (!input.token) {
    return { ok: false, error: "MISSING_TOKEN" };
  }

  let decrypted: string;

  try {
    decrypted = decryptSecret(input.token);
  } catch {
    return { ok: false, error: "TOKEN_DECRYPT_FAILED" };
  }

  const platform = input.platform.toLowerCase();

  if (platform === "facebook") {
    try {
      const stored = JSON.parse(decrypted) as {
        pageAccessToken?: string;
        pageId?: string;
      };

      const pageAccessToken = stored.pageAccessToken;
      const pageId =
        stored.pageId || input.externalAccountId;

      if (!pageAccessToken || !pageId) {
        return {
          ok: false,
          error: "FACEBOOK_PAGE_CREDENTIALS_MISSING",
        };
      }

      let response: Response;

    // Text-only Facebook Page post.
    if (!input.mediaUrl) {
      const endpoint =
        `https://graph.facebook.com/v23.0/${pageId}/feed`;

      const body = new URLSearchParams({
        message: input.caption || "",
        access_token: pageAccessToken,
      });

      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        cache: "no-store",
      });
    } else {
      // Download the finished Rumi Social AI creative ourselves,
      // then upload the actual image bytes to Facebook.
      // This avoids Meta having to fetch our media URL.
      const mediaResponse = await fetch(input.mediaUrl, {
        cache: "no-store",
      });

      if (!mediaResponse.ok) {
        return {
          ok: false,
          code: mediaResponse.status,
          error: `FACEBOOK_MEDIA_FETCH_FAILED_${mediaResponse.status}`,
        };
      }

      const mediaType =
        mediaResponse.headers.get("content-type") || "image/png";

      const mediaBytes = await mediaResponse.arrayBuffer();

      if (mediaBytes.byteLength >= 10 * 1024 * 1024) {
        return {
          ok: false,
          error: "FACEBOOK_IMAGE_TOO_LARGE",
        };
      }

      // Publish directly to the Facebook Page feed.
      // Do not create a Facebook /photos object.
      const feedBody = new URLSearchParams({
        message: input.caption || "",
        access_token: pageAccessToken,
      });

      if (input.mediaUrl) {
        feedBody.set("link", input.mediaUrl);
      }

      response = await fetch(
        `https://graph.facebook.com/v23.0/${pageId}/feed`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: feedBody,
          cache: "no-store",
        }
      );
    }

    const result = await response.json();

    console.log(
      "FACEBOOK_FINAL_RESPONSE",
      JSON.stringify({
        httpStatus: response.status,
        ok: response.ok,
        result,
      })
    );

      if (!response.ok) {
        console.error(
          "Facebook publishing failed",
          result
        );

        return {
          ok: false,
          code: response.status,
          error:
            result?.error?.message ||
            "FACEBOOK_PUBLISH_FAILED",
        };
      }

      const externalId =
        result.post_id || result.id;

  
    if (externalId) {
      const inspectResponse = await fetch(
        `https://graph.facebook.com/v23.0/${externalId}?fields=id,permalink_url,is_published,attachments&access_token=${encodeURIComponent(pageAccessToken)}`,
        { cache: "no-store" }
      );

      const inspectResult = await inspectResponse.json();

      console.log(
        "FACEBOOK_POST_INSPECT",
        JSON.stringify(inspectResult)
      );

      const firstAttachment =
        inspectResult?.attachments?.data?.[0] || null;

      console.log(
        "FACEBOOK_ATTACHMENT_DETAIL",
        JSON.stringify({
          type: firstAttachment?.type || null,
          url: firstAttachment?.url || null,
          targetId: firstAttachment?.target?.id || null,
          targetUrl: firstAttachment?.target?.url || null,
          mediaImageSrc:
            firstAttachment?.media?.image?.src || null,
          mediaWidth:
            firstAttachment?.media?.image?.width || null,
          mediaHeight:
            firstAttachment?.media?.image?.height || null,
        })
      );
    }

    return {
        ok: true,
        code: response.status,
        externalId: externalId
          ? String(externalId)
          : undefined,
      };
    } catch (error) {
      console.error("Facebook provider failed", error);

      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "FACEBOOK_PROVIDER_FAILED",
      };
    }
  }

  return {
    ok: false,
    error:
      `${input.platform.toUpperCase()}_PROVIDER_NOT_CONFIGURED`,
  };
}
