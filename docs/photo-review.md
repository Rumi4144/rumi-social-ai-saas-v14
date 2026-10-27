# Campaign photo review

New AI photos created by the campaign worker, manual image regeneration and reel scene generation are reviewed before automatic selection. User-selected website photos and uploads retain their existing explicit selection flow. Existing campaigns are not regenerated retroactively.

The reviewer sees the actual candidate at up to 1024 pixels, the headline and caption, brand/business/audience/voice, occasion and creative direction, and up to three distinct recent selected photos from the same campaign. It checks message, emotion, visual variety and obvious factual/visual problems. It now first reports separate anatomy and hand-to-object contact assessments, with visible evidence. Either a defect or uncertainty blocks automatic selection, even when the general criteria pass. Normal occlusion, cropping and real anatomical differences are not defects by themselves; images without people can pass without these checks being applicable. Matching is advisory: it does not verify real customer identities, testimonials or exact product specifications. Supplied content and image text are treated as data, not instructions.

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

## Reel scene photos

Reel scenes use the same reviewer with up to three ready photos from their own post, including its main photo and other scenes. Other versions of the same scene, the candidate itself and flagged photos are excluded. The request freezes the caption, brand context and requested shot. One Rumi credit covers the request, including at most one corrected replacement. Each generated image is saved before review; only a passed result becomes ready. A changed post or unavailable review requires a manual choice. This does not replace the main post image or change delivery settings.

`REEL_SCENE_PHOTO` retains its progress, frozen plan and result. A replacement resumes in a separate HTTP request with a fixed provider identifier, and duplicates do not debit again. The browser retains the request in local storage until success or a manual decision. A definitive initial provider rejection returns the credit once. A failed replacement retains the initial image without refunding the completed first generation. Both originals remain available through the photo library. The scene review notice can select the photo explicitly or keep it saved while changing the description; neither action purchases a new image. Legacy pending requests keep the original prompt shape.

The automatic reel planner excludes failed, pending and unavailable review candidates, including archived assets. The manual photo library labels these candidates for inspection. Video cards expose playback controls, seek to an initial frame where possible, and provide an error message/link if playback cannot load.

## Validation

`node --test tests/photo-review.test.cjs` covers decisions, one-replacement limits, retained originals, stable retry IDs/prompts, changed posts, publishing locks, tenant-scoped comparisons, duplicate claims, malformed results and unavailable review.

`node tests/photo-review-browser.cjs` exercises a pending request across reload, no rendering of flagged results, explicit selection, and desktop/mobile layout with local fixture data. It makes no paid provider requests. Existing creative regression, holiday, worker recovery and full suite checks also apply.

`node --test tests/scene-photo.test.cjs tests/reel-auto-plan.test.cjs tests/reel-library.test.cjs` covers scene billing, retries, retained candidates, frozen context and automatic exclusion. `node tests/scene-photo-browser.cjs` verifies scene continuation, explicit review, reload recovery and clip controls/error states at desktop and mobile widths. These fixtures do not establish real-world model quality or verify a user's private video.

Official API references:
- https://developers.openai.com/api/docs/guides/images-vision
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/models/gpt-4.1-mini

## Anatomy review update

New review responses must include `anatomy`, `anatomyEvidence`, `objectInteraction` and `interactionEvidence`. The application checks these fields independently of `accurate` and derives a readable issue if the model reports a physical defect but leaves its general issues empty. Invalid or omitted fields require manual review. This uses the existing review call, model and image inputs; it does not add another paid call or increase the one-replacement limit. Completed reviews retain their cached outcomes and are not retroactively re-purchased.

Campaign and new reel generation prompts favor simple credible poses, coherent fingers/joints/nails and realistic contact with objects. Product detail concepts avoid gratuitous hands; explicit hands/playing requests are preserved. Already-started reel requests keep their frozen prompt so resuming them does not change a provider purchase.

The automated tests verify rejection decisions and bounded retries using fixture verdicts. They do not establish the vision model's detection accuracy on real photographs. A manual final check is still needed; this change does not repair existing image pixels.

## Brighter campaign direction

New campaign photos and reel scenes use shared daylight/mood guidance: open shadows, readable subjects, natural material colors and restrained brand accents. Automatic treatments no longer request cinematic shadows or deep luxury tones. Explicit evening/stage requests and solemn occasions retain their intended atmosphere. Existing pending scene requests keep their frozen prompts.

The seven showcase layouts use light surroundings with dark readable text; the geometric layout gives the complete photo a larger rectangular area. Automatic variety selects from Modern Gradient, Framed Editorial, Geometric Focus and Gallery Story. Explicit style choices remain honored, including the legacy Classic photo overlay. Saved creative files are not overwritten; a user must render a new design to apply the layout changes to an existing post. This change does not edit source photo pixels or change the production image provider.

`tests/brand-template-contrast.test.cjs` checks actual headline/background contrast across dark, pale and saturated brand colors. Existing showcase and browser checks cover formats, original photo preservation, saved-style selection and no writes during preview.
