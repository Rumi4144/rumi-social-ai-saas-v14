# Mixed campaign calendar

The planner accepts exact quantities of static posts, reels, Stories, and presenter drafts across 7, 15, or 30 calendar days. Enter 0–30 of each format, up to 60 regular drafts total. Each format is spread evenly across the dates, so multiple drafts can share a day. Legacy plans still support one rotating format per day. Observances are selected by default and can be deselected; they add separate static drafts on their actual dates; they never replace a daily entry. Users can deselect suggestions and add custom occasions. This is a suggestions catalog, not an exhaustive list of holidays or observed office closures.

Draft-only mode charges the existing campaign-writing credit and creates no image jobs or finished videos. Reel and presenter drafts require a selected finished campaign video before publishing or scheduling. Stories are distinct vertical 1080 × 1920 drafts; automated Story publishing is deliberately blocked until a dedicated integration exists. All content and planning-job reads use the active organization.

Observance references:

- U.S. federal holiday rules: https://www.opm.gov/policy-data-oversight/pay-leave/federal-holidays/
- Global Wellness Day, second Saturday in June: https://www.globalwellnessday.org/about/what-is-gwd/
- World Mental Health Day, October 10: https://www.who.int/campaigns/world-mental-health-day
- World Kindness Day, November 13: https://theworldkindnessmovement.org/about-us-2/story/
- World Meditation Day, December 21: https://www.un.org/en/observances/meditation-day

Dates use UTC calendar arithmetic to avoid daylight-saving drift. The default start date uses America/New_York. Custom dates and extras are validated before campaign creation. Generated responses must contain exactly one distinct plan key per requested slot before existing campaign items can be replaced.

Holiday image generation uses the saved occasion as the primary subject, ahead of general campaign subject rotation. All 11 U.S. federal holidays are suggested on their actual dates (not office-closure observed dates). Website-photo campaigns leave holiday drafts without an image rather than recycling an unrelated product photo; draft-only campaigns generate no images. Existing photos are not regenerated automatically.
