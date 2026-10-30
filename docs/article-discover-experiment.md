# Article Discover CTA experiment

Experiment ID: `article_discover_placement_v1`.

- **A:** the existing article layout, with the Discover button below the desktop table of contents and the original mobile intro container (using the brand surface background).
- **B:** replaces that button with a sticky banner to the right of the article on desktop (1024px and above). Below 1024px, the same banner appears inline above the cover image, replacing the original mobile intro. It reuses the bottom banner's image, copy and filled button. The bottom banner stays in both versions; the desktop sticky banner fades out when the bottom banner enters the viewport and stays hidden farther down the page. Scrolling back above the bottom banner restores it.
- Visitors receive a 50/50 random assignment, saved per browser in local storage (`kb-article-discover-placement-v1`). When storage is blocked, the assignment lasts for the current document only.
- All screen sizes participate. Events include `layout: desktop` at 1024px and above or `layout: inline` at smaller widths so the two experiences can be compared separately.

## Preview

Append `?article_variant=A` or `?article_variant=B` to an article URL. Preview links do not overwrite the saved assignment and do not emit experiment views or attach experiment fields to clicks. Remove the query to return to the remembered assignment.

## Measurement

The existing analytics bridge sends `kb_experiment_view` per article navigation and responsive layout change, with `experiment_id`, `variant`, `layout`, and the article ID. Discover clicks (`kb_cta_click`) carry the same experiment fields and their location (`article_sidebar`, `article_right_banner`, `article_mobile_intro`, `article_mobile_banner`, or `article_bottom_banner`). GA4 names the article field `article_slug`; Umami uses `article_id`.

Compare Discover clicks per experiment view, split by variant and layout; also compare the primary sidebar/right-banner or mobile placements separately from the bottom banner. These are event counts, so repeat clicks can count more than once. For visitor-level conversion, deduplicate by analytics visitor/session identifiers. Keep the existing analytics environment gates: local development sends no live data.

Before reporting in GA4, register `experiment_id`, `variant`, and `layout` as event-scoped custom dimensions if they are not already configured. This change provides event instrumentation; it does not configure a GA4 report or publish the experiment.

To begin a fresh test later, change both the experiment ID and the storage key so old assignments and results are not reused.
