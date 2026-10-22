# AI Test Lab

`/ai-test-lab` is a separate owner/administrator test area. It does not publish samples. The sidebar link is available in the normal app navigation; non-administrators see an explanation rather than paid controls.

## Ad creation defaults

Campaign images, manual photo regeneration, and reel scene photos default to BFL FLUX 3 Image Klein at 1K. `IMAGE_PROVIDER` defaults to `bfl`; setting it explicitly to `openai` selects the previous image provider. Missing credentials never trigger a paid fallback. Existing Rumi image credit behavior is preserved. Provider tasks are retained so status/download retries reuse the purchased image.

`/studio/presenters` defaults to the WaveSpeed workflow for owners and administrators, with a campaign/post selector, typed-script voice preview or uploaded recording, and separate explicit provider-cost approvals. Finished clips are saved as campaign media and can be selected for the post or opened in the reel editor. Nothing is automatically published. This direct-provider workflow uses the same daily estimate allowance as the lab and does not deduct additional Rumi generation credits. Runway product demonstrations remain available through the explicitly labeled premium option (`?provider=runway`); the legacy API requires that provider selection. Other cinematic Runway video tools keep their existing behavior.

In the presenter's typed-script mode, **Create script for me** uses the selected owned campaign post and Brand Brain to draft approximately 15 or 30 seconds of spoken copy. It uses the existing server-only `OPENAI_API_KEY` and `OPENAI_TEXT_MODEL`; text usage is billed to that OpenAI account separately from the WaveSpeed allowance. The returned draft is editable, at most 600 characters, and does not overwrite the campaign caption. Successful replacement clears the previous voice selection and cost quote; failures preserve the current draft. It never starts speech or video generation. The endpoint enforces the same owner/administrator role and current-workspace checks before making a model request, with automatic SDK retries disabled.

## Setup

Add server-only `BFL_API_KEY`, `WAVESPEED_API_KEY`, and the existing private `BLOB_READ_WRITE_TOKEN` in the hosting environment. A model stays disabled until its provider key and private storage are configured. No database migration is required: quotes and samples use the existing Job table, and temporary uploaded inputs use MediaAsset.

- Images: BFL `flux-3-image-klein`, one 1K 4:5 PNG per submission. Listed estimate: $0.009. API documentation: https://docs.bfl.ai/api-reference/utility/generate-an-image-with-flux-3-klein
- Presenter video: WaveSpeed `wavespeed-ai/infinitetalk-fast`, using an uploaded photo and audio. The uploaded-recording path does not purchase text-to-speech. Complete-input estimates use the provider pricing API. Documentation: https://wavespeed.ai/models/wavespeed-ai/infinitetalk-fast and https://wavespeed.ai/docs/pricing-api
- Optional typed-script voice: WaveSpeed `minimax/speech-02-hd`, with preset `Calm_Woman`, `Friendly_Person` or `Patient_Man`. The script is sent unchanged, bounded to 600 characters, with MP3 output. A complete-input provider quote and separate explicit approval are required before speech generation. The resulting audio is privately saved, previewable/downloadable and reusable as an owned presenter input. No voice cloning or extra provider key is needed. Documentation: https://wavespeed.ai/models/minimax/speech-02-hd

In Talking presenter, users can choose **Type your script** or **Upload a recording**. Typed scripts use two paid steps: approve voice generation, listen, then approve video generation using a live price based on the actual audio. The app never starts the video automatically. Script or voice changes invalidate the selected generated audio. Saved audio can be selected again from history without purchasing a new voice generation. Voices share the same daily allowance, single-use quote, request ID and recovery protections as other samples.

Inputs upload directly to provider storage using single-use upload tickets. They expire at the provider after seven days; the app rejects inputs older than six days. Final results are copied into private app storage when progress is checked. Browser polling runs every 15 seconds while the lab is open; reopening the lab and checking progress recovers the same provider task. There is no separate background worker for this experimental tab.

## Cost and recovery behavior

Only workspace owners/administrators can run tests. No additional Rumi credit debit is made in this administrator lab; the configured provider account pays for actual generation. The UI requires a fresh estimate and explicit paid-generation acknowledgment.

`AI_LAB_DAILY_USD` defaults to 2 and is clamped to a maximum of 10. This limits reserved estimates per workspace per UTC day, not the provider's final invoice. Each estimate must be at most $1, and at most 20 generations can be reserved daily. Tax, storage, input uploads and additional attempts are excluded from generation estimates. Configure provider-side account spending limits separately when available.

Single-use quotes expire after two minutes. A stable organization-bound request ID and Serializable database reservation prevent concurrent duplicate submissions and daily-budget races. One outstanding or uncertain sample blocks new generations, including across midnight. Confirmed provider rejections and ambiguous submissions are never automatically regenerated. Failed/uncertain requests retain their estimated reservation conservatively.

If submission cannot be confirmed, reconcile it manually in the provider account before changing the job's state. Never retry generation merely to check status. A confirmed task ID is retained on a transient database-save failure. Storage/status retries only poll and save the same purchased output.

## Validation

- `node --test tests/ai-lab.test.cjs`: mocked tenant boundaries, consent, estimates, quote expiry/reuse, concurrent submissions, daily allowance, outstanding requests across midnight, ambiguous responses and transient database recovery.
- `node tests/ai-lab-browser.cjs`: real component against simulated API responses, desktop/mobile layout, explicit cost acknowledgment, safe history refresh, comparison, disabled unconfigured providers and upload controls.
- `npm run typecheck` and `npm run build`.

These checks make no paid provider calls. Real provider credentials, upload CORS behavior, account access, output quality and final billing require a separately initiated live sample after configuration.
