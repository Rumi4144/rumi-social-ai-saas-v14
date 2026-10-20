# TikTok video publishing

The app supports Direct Post for finished MP4 campaign reels. TikTok sign-in alone does not grant publishing permission. Existing connections must reconnect and grant `video.publish` after the production revision granting that scope is approved.

## Production setup

1. In the existing TikTok developer app, add Content Posting API and enable Direct Post. Request `video.publish` alongside the existing `user.info.basic` permission. Keep the existing client key and secret in the production environment.
2. Until the new production revision is approved, OAuth requests only `user.info.basic` and uses the previously approved `https://rumi-social-ai-saas-v14.vercel.app/api/social/tiktok/callback/`. That host relays the signed response to the main domain, where the original user session, workspace and host-only state cookie are checked before token exchange. The exchange retains the original registered redirect URI. After approval, set `TIKTOK_CONTENT_POSTING_APPROVED=true` and redeploy to request `video.publish` and use the main-domain callback. `TIKTOK_REDIRECT_URI` can explicitly choose an approved callback on either trusted deployment host; arbitrary origins are rejected. Keep the registered redirect URI exactly `https://rumisocialai.com/api/social/tiktok/callback/` (including the trailing slash). OAuth connects must start and finish while signed into the same Rumi Social workspace.
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

## Administrator sandbox test area

`/settings/tiktok-test` is restricted to the app super administrator. It uses `TIKTOK_SANDBOX_CLIENT_KEY` and `TIKTOK_SANDBOX_CLIENT_SECRET`, with a distinct sandbox callback at `/api/social/tiktok-test/callback/`. Register that exact callback and the main URL prefix in the TikTok sandbox, add the selected account as a target user, and confirm the sandbox permits `video.publish` before connecting. These settings do not grant or imply production approval.

The test grant is tagged `environment: sandbox`, encrypted, bound to the sandbox client key and open ID, and stored under provider `tiktok_sandbox`. Normal connection lists and publishing cannot use it; the production OAuth callback rejects sandbox state. The original workspace connection is not replaced. Test grants refresh only with sandbox credentials.

The test screen reuses the normal TikTok preview, caption, privacy, interaction, disclosure and explicit consent controls. It accepts only saved MP4s owned by the selected business and binds consent to the exact test account. The server independently enforces `SELF_ONLY` even if public production posting has been approved. A manual click starts one test upload, with a claimed idempotency receipt before initialization. Test receipts use `TIKTOK_SANDBOX_POST` Jobs, not PublishJobs; campaign publication status is never changed. A separate status action polls the same receipt. Ambiguous initialization requires checking TikTok before any new attempt. No background worker sends sandbox test uploads.

Credentials, account authorization, actual API access and a real private upload must still be checked in the developer portal. Tests and a successful build do not establish those external conditions.
