# AI Test Lab

`/ai-test-lab` is a separate owner/administrator test area. It does not change campaign defaults or publish samples. The sidebar link is available in the normal app navigation; non-administrators see an explanation rather than paid controls.

## Setup

Add server-only `BFL_API_KEY`, `WAVESPEED_API_KEY`, and the existing private `BLOB_READ_WRITE_TOKEN` in the hosting environment. A model stays disabled until its provider key and private storage are configured. No database migration is required: quotes and samples use the existing Job table, and temporary uploaded inputs use MediaAsset.

- Images: BFL `flux-3-image-klein`, one 1K 4:5 PNG per submission. Listed estimate: $0.009. API documentation: https://docs.bfl.ai/api-reference/utility/generate-an-image-with-flux-3-klein
- Presenter video: WaveSpeed `wavespeed-ai/infinitetalk-fast`, using an uploaded photo and audio. No extra text-to-speech generation is purchased. Complete-input estimates use the provider pricing API. Documentation: https://wavespeed.ai/models/wavespeed-ai/infinitetalk-fast and https://wavespeed.ai/docs/pricing-api

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
