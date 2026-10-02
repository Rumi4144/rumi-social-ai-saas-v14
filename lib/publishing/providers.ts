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
      const pageId = stored.pageId || input.externalAccountId;

      if (!pageAccessToken || !pageId) {
        return {
          ok: false,
          error: "FACEBOOK_PAGE_CREDENTIALS_MISSING",
        };
      }

      // Text-only Page post.
      if (!input.mediaUrl) {
        const response = await fetch(
          `https://graph.facebook.com/v23.0/${pageId}/feed`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              message: input.caption || "",
              access_token: pageAccessToken,
            }),
            cache: "no-store",
          }
        );

        const result = await response.json();

        if (!response.ok) {
          console.error("Facebook text publishing failed", result);
          return {
            ok: false,
            code: response.status,
            error: result?.error?.message || "FACEBOOK_PUBLISH_FAILED",
          };
        }

        return {
          ok: true,
          code: response.status,
          externalId: result?.id ? String(result.id) : undefined,
        };
      }

      // Fetch the finished Rumi Social AI creative server-side so Facebook
      // receives real image bytes rather than an internal media URL.
      const mediaResponse = await fetch(input.mediaUrl, { cache: "no-store" });

      if (!mediaResponse.ok) {
        return {
          ok: false,
          code: mediaResponse.status,
          error: `FACEBOOK_MEDIA_FETCH_FAILED_${mediaResponse.status}`,
        };
      }

      const mediaType = mediaResponse.headers.get("content-type") || "image/jpeg";
      const mediaBytes = await mediaResponse.arrayBuffer();

      if (mediaBytes.byteLength >= 10 * 1024 * 1024) {
        return { ok: false, error: "FACEBOOK_IMAGE_TOO_LARGE" };
      }

      // Step 1: upload the image as unpublished media. This creates a media
      // object Facebook can attach to a normal Page feed post without first
      // publishing a standalone photo to the Page.
      const photoForm = new FormData();
      photoForm.append(
        "source",
        new Blob([mediaBytes], { type: mediaType }),
        mediaType.includes("png") ? "creative.png" : "creative.jpg"
      );
      photoForm.append("published", "false");
      photoForm.append("access_token", pageAccessToken);

      const photoResponse = await fetch(
        `https://graph.facebook.com/v23.0/${pageId}/photos`,
        {
          method: "POST",
          body: photoForm,
          cache: "no-store",
        }
      );

      const photoResult = await photoResponse.json();

      if (!photoResponse.ok || !photoResult?.id) {
        console.error("Facebook unpublished media upload failed", photoResult);
        return {
          ok: false,
          code: photoResponse.status,
          error:
            photoResult?.error?.message || "FACEBOOK_MEDIA_UPLOAD_FAILED",
        };
      }

      const mediaFbid = String(photoResult.id);

      // Step 2: create the Page feed post and attach the unpublished media.
      // Meta expects indexed attached_media form parameters.
      const feedBody = new URLSearchParams();
      feedBody.set("message", input.caption || "");
      feedBody.set(
        "attached_media[0]",
        JSON.stringify({ media_fbid: mediaFbid })
      );
      feedBody.set("access_token", pageAccessToken);

      const feedResponse = await fetch(
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

      const feedResult = await feedResponse.json();

      if (!feedResponse.ok || !feedResult?.id) {
        console.error("Facebook feed publishing failed", feedResult);

        // Best-effort cleanup of the unpublished media if feed creation fails.
        try {
          await fetch(
            `https://graph.facebook.com/v23.0/${mediaFbid}?access_token=${encodeURIComponent(pageAccessToken)}`,
            { method: "DELETE", cache: "no-store" }
          );
        } catch (cleanupError) {
          console.error("Facebook media cleanup failed", cleanupError);
        }

        return {
          ok: false,
          code: feedResponse.status,
          error: feedResult?.error?.message || "FACEBOOK_PUBLISH_FAILED",
        };
      }

      return {
        ok: true,
        code: feedResponse.status,
        externalId: String(feedResult.id),
      };
    } catch (error) {
      console.error("Facebook provider failed", error);
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : "FACEBOOK_PROVIDER_FAILED",
      };
    }
  }

  return {
    ok: false,
    error: `${input.platform.toUpperCase()}_PROVIDER_NOT_CONFIGURED`,
  };
}
