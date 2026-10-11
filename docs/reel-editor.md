# Finished reel editor

Open Creative Studio → Finished reels, or “Make a finished reel for this post” inside a campaign. The editor combines up to six photos or video clips into a 1080 × 1920 reel with editable scene captions, fades, six visual layouts, and a brand closing screen. Upload presenter clips to use their existing performance; this feature does not generate or lip-sync presenters.

Use “Save draft in this browser” before leaving. Drafts, including imported files, are saved locally by workspace, campaign and post. They do not transfer between browsers. “Export finished reel” records the timeline in real time; keep the tab visible. MP4 is preferred when the browser supports it; otherwise the editor exports WebM, which can be downloaded but cannot be selected for Facebook publishing. Music and voiceover uploads are optional.

## Music

Under Sound, enable “Add background music” and choose Flamenco, Classical, Fingerpicking guitar, Jazz, Country, Blues, Bossa nova, Acoustic folk, Soft piano, Upbeat pop, Soft ambient, Soft acoustic guitar, or Upload my music. The built-in arrangements are synthesized original instrumentals, not recordings of the displayed instrument or licensed commercial songs. Each genre has its own harmony, rhythm and instrument sounds. Fingerpicking guitar uses a gentle alternating-thumb bass pattern with individually picked upper strings. Soft acoustic guitar has slower, sparser picking, a mellow attack and a quieter mix. “Listen to music” plays a 12-second sample at the selected volume. It stops when the selection changes, the page is hidden, or export begins. The visual preview remains silent; watch the finished export for the full mix with voiceover and clip audio.

Music selection and volume are saved in the post’s browser draft and used by both single-reel and weekly exports. Turning background music off silences both built-in and uploaded music while preserving voiceover and the separate clip-audio choice. A retained upload does not override a selected built-in style. Older drafts restore their previous music behavior. No music service, extra credits or API keys are required.

Watch the exported reel, then save it to a campaign post. Private Vercel Blob uploads use the existing Blob configuration, with signed callbacks, ownership checks and a 100 MB limit. No database migration, generation credits or automatic publication is involved. Selecting the video and approving/scheduling the post remain separate campaign actions.

## Photos and styles

Choose cinematic, animated collage, framed gallery, product spotlight, clean slideshow, or split-screen details. Collage and split layouts use different selected scene sources; a single source is shown once rather than duplicated into empty panels. The weekly planner offers all six layouts.

“Load product photos” reads the selected post’s product link or a uniquely matching saved product. A manual address must belong to that brand’s website or saved products. The importer reads a WooCommerce product gallery, matching Product structured data, or the page’s social preview image. It does not scan unrelated page images. Photos are saved as post-owned library assets; repeated imports reuse them. External sites may block requests or omit gallery metadata, in which case upload the photos directly.

Thumbnail cards and scene selectors let the user choose photos. Multi-file upload supports JPEG, PNG, WebP, MP4 and WebM (100 MB each, up to 30 uploaded library items); a reel still uses at most six scenes. Draft saving retains unused uploaded library files too. Product imports and media access enforce workspace ownership. Remote downloads require public HTTPS destinations, pinned DNS, same-origin redirects, timeouts and byte limits.

Validation: typecheck, production build, and automated reel tests covering timeline boundaries, layouts, gallery extraction, product matching, workspace ownership, idempotent imports, unsafe hosts, draft restoration and existing upload behavior. Browser checks use an isolated preview with the real Martinez MF-17 product gallery and no production mutations.
