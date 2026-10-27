# Campaign photo review

New AI photos created by the campaign worker and manual image regeneration are now reviewed before automatic selection. User-selected website photos and uploads retain their existing explicit selection flow. Existing campaigns are not regenerated retroactively.

The reviewer sees the actual candidate at up to 1024 pixels, the headline and caption, brand/business/audience/voice, occasion and creative direction, and up to three distinct recent selected photos from the same campaign. It checks message, emotion, visual variety and obvious factual/visual problems. Matching is advisory: it does not verify real customer identities, testimonials or exact product specifications. Supplied content and image text are treated as data, not instructions.

`OPENAI_PHOTO_REVIEW_MODEL` defaults to `gpt-4.1-mini`, using the existing server-only `OPENAI_API_KEY`. Reviews use Responses image input and strict structured output, with `store: false`, a 30-second timeout, no SDK retries, bounded output and resized image inputs. Remote comparison images use the existing DNS-pinned public fetcher.

## Decisions and recovery

- A passed image may replace the current photo only while the post remains editable and its caption/headline/selected media have not changed. Approval resets to draft.
- A failed first image permits one corrected replacement, with a fixed provider request ID. The worker/browser resumes in a new request before buying the replacement to stay within hosting limits.
- A failed second image, missing credentials, timeout, incomplete review or unreadable comparison produces a human-review notice. No further automatic generation occurs.
- Originals and replacements are saved as separate MediaAssets before review, initially `superseded`. They remain available in the photo library. Flagged candidates are never automatically rendered or selected.
- A user can inspect and explicitly select a flagged photo through the existing tenant-scoped selection endpoint. That resets approval and records the previous review plus `userReviewed`.
- PHOTO_SELECTION and PHOTO_REVIEW jobs store progress/results. No schema migration is needed. Paid provider submissions and review claims are durable; uncertain outcomes do not submit again. Stale interrupted reviews require human review.
- Manual regeneration keeps the request identifier in browser session storage so refreshing can resume the same purchase.
- Comparison is bounded to available recent photos at review time, not a guarantee of uniqueness across every historical campaign. Failed provider requests may still incur provider charges; there is no claim that a failed review is free.

## Validation

`node --test tests/photo-review.test.cjs` covers decisions, one-replacement limits, retained originals, stable retry IDs/prompts, changed posts, publishing locks, tenant-scoped comparisons, duplicate claims, malformed results and unavailable review.

`node tests/photo-review-browser.cjs` exercises a pending request across reload, no rendering of flagged results, explicit selection, and desktop/mobile layout with local fixture data. It makes no paid provider requests. Existing creative regression, holiday, worker recovery and full suite checks also apply.

Official API references:
- https://developers.openai.com/api/docs/guides/images-vision
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/models/gpt-4.1-mini
