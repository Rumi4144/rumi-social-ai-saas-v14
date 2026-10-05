# Finished reel editor

Open Creative Studio → Finished reels, or “Make a finished reel for this post” inside a campaign. The editor combines up to six photos or video clips into a 1080 × 1920 reel with editable scene captions, fades, three visual layouts, and a brand closing screen. Upload presenter clips to use their existing performance; this feature does not generate or lip-sync presenters.

Use “Save draft in this browser” before leaving. Drafts, including imported files, are saved locally by workspace and campaign. They do not transfer between browsers. “Export finished reel” records the timeline in real time; keep the tab visible. MP4 is preferred when the browser supports it; otherwise the editor exports WebM, which can be downloaded but cannot be selected for Facebook publishing. Music and voiceover uploads are optional. The built-in synth soundtrack is original background music, not an instrument recording.

Watch the exported reel, then save it to a campaign post. Private Vercel Blob uploads use the existing Blob configuration, with signed callbacks, ownership checks and a 100 MB limit. No database migration, generation credits or automatic publication is involved. Selecting the video and approving/scheduling the post remain separate campaign actions.

Validation: production build/typecheck and automated tests for timeline boundaries, caption wrapping, upload ownership, private playback ranges and existing publishing flows. All three canvas layouts and closing screens were rendered and visually reviewed. Browser export/playback and the authenticated live upload flow still require a live check: browser launches in the local execution sandbox fail at macOS Mach port registration.
