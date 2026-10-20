# TikTok video publishing

The app supports Direct Post for finished MP4 campaign reels. TikTok sign-in alone does not grant publishing permission. Existing connections must reconnect and grant `video.publish`.

## Production setup

1. In the existing TikTok developer app, add Content Posting API and enable Direct Post. Request `video.publish` alongside the existing `user.info.basic` permission. Keep the existing client key and secret in the production environment.
2. Keep the registered redirect URI exactly `https://rumisocialai.com/api/social/tiktok/callback/` (including the trailing slash). OAuth connects must start and finish while signed into the same Rumi Social workspace.
3. Verify `https://rumisocialai.com/` in the developer app's URL properties. Server-stored video is delivered using `PULL_FROM_URL` from an expiring, tenant-bound signed `/api/video/tiktok/<assetId>` URL; it does not redirect to a private Blob URL. Hosting must serve the approved domain.
4. Reconnect from Settings → TikTok → Reconnect TikTok for posting. The account card checks the granted scope and queries current creator settings. This check never sends a video to TikTok.
5. Complete TikTok's required Direct Post audit. Until approval is confirmed, `TIKTOK_PUBLIC_POSTING_APPROVED` remains unset/false and only `SELF_ONLY` choices returned by TikTok are offered. Unaudited clients also require private creator accounts and have TikTok-imposed testing caps. Set `TIKTOK_PUBLIC_POSTING_APPROVED=true` and redeploy only after confirmed approval. Do not infer approval from a successful account connection.

TikTok's current guidelines require a creator nickname, fresh creator settings, an editable caption, preview, privacy with no default, interaction controls off by default and disabled where the creator prohibits them, commercial disclosures, music-use consent, and delivery tracking. The posting panel implements these. Verify the actual media used in the audit also meets TikTok's watermark/content guidelines; software branding must not be added to exports as a condition of using the service.

## Posting

Export and save a finished MP4 reel. Under Post your reel, select TikTok, review the video and caption, choose visibility, review interaction and disclosure options, and explicitly authorize uploading. Any change to those TikTok options clears consent. The reviewed caption and exact asset/account are stored with the publishing job. At delivery time, creator permissions and duration limits are checked again; visibility is never silently changed.

An upload acceptance is not reported as posted. A stored publish ID is polled until `PUBLISH_COMPLETE`; processing checks reuse the original upload and do not consume upload-attempt retries. Ambiguous initialization is never automatically repeated. TikTok processing failure is surfaced with its failure code. An expired, missing-scope, changed or disconnected account cannot publish.

TikTok still controls permission, quota, moderation, audit and domain verification. Repository tests use fake API responses; no live upload or TikTok approval is implied by passing them.

## Validation

- `node --test tests/tiktok-publishing.test.cjs`: consent and disclosure validation, permissions, account-bound encrypted refresh, tenant isolation, scheduling snapshot, status progression, failure/duplicate protection, signed media URLs, and OAuth scope/cookie.
- `node tests/tiktok-posting-browser.cjs`: actual posting controls with isolated API fixtures, including privacy defaults, editable text, renewed consent, disclosures, duration blocks and reconnect guidance.
- Full unit suite and production build also run in CI.

References: https://developers.tiktok.com/doc/content-sharing-guidelines ; https://developers.tiktok.com/doc/content-posting-api-reference-direct-post ; https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info ; https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status
