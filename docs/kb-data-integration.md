# KB content integration: review build

## Source and reproducibility

The existing `public/education_hub_articles` submodule now points to
`https://github.com/HappySonnyDev/EducationHubArticles`, branch
`feat/kb-metadata-cleanup`. The gitlink pins the exact reviewed source revision;
normal setup must not implicitly pull latest main.

```sh
git submodule update --init public/education_hub_articles
yarn kb:validate
SKIP_ENV_VALIDATION=1 yarn dev --port 3001
```

`SKIP_ENV_VALIDATION` is for local content/UI review without SendGrid credentials,
not a production configuration. An isolated second review server can use
`NEXT_DIST_DIR=.next-kb-validation` and port 3002.

The workbook and PDF supplied by the content team were consulted. The workbook
explicitly describes candidate mappings, not an approved bulk import. Only its
taxonomy, proposed tags/classification, and featured references were exported;
private analytics/evidence columns were not published.

Source snapshot: 211 article concepts, 318 Markdown renditions: 211 English,
64 Chinese, 43 Spanish. No article directory, Markdown body or original
frontmatter was edited. Metadata is a sidecar in the fork's `metadata/` folder.
Existing `/knowledge-base/[slug]` paths and source filename locale conventions
determine the manifest. Historical URL normalization is used only for proposed
classification matching, never for redirects or canonical paths.

Run `node scripts/prepare-kb-content.mjs <content-checkout>` to regenerate the
sidecar after a source change. This overwrites generated catalog/reconciliation
files, not Markdown. Review the resulting diff and commit it in the content
branch, then update the website gitlink to that commit. Do not rerun blindly over
manual metadata edits. The application fails on mismatched source hashes rather
than silently loading stale metadata.

## Implemented routes

- `/knowledge-base`: actual Hub counts, manually referenced starter picks with same-Hub
  fallback, GA-backed Most read cards (see `kb-most-read.md`), five search suggestions.
- `/knowledge-base/topic?hub=<id>`: original Subjects tabs, selected-Subject article grid,
  density slider and Filter menu. Real data fills the approved layout; selecting
  View all removes the Subject filter without adding grouped section headings.
  Optional `subject=<id>` selects a Subject from article breadcrumbs/categories.
  Latest-to-oldest is supported; popularity/editorial filters remain disabled
  until their data is supplied.
- `/knowledge-base/articles?page=2`: 24 articles per server-rendered page, normal next/previous
  links, newest first with stable ID tiebreak. Invalid pages return 404.
- `/knowledge-base/search?q=...`: weighted title/summary/taxonomy/tags/body search with
  technical punctuation and Chinese handling. No external search service.
- `/knowledge-base/<original-slug>`: directly renders the approved article UI
  with original Markdown, images, sanitized HTML, heading navigation,
  Topic/Subject links and up to three relevant related articles. Existing slugs,
  including case and underscores, are preserved. Locale prefixes are unchanged.
  There is no redirect to a new Hub- or Subject-based article URL.
- Start Here uses Stefan's approved eight further-reading articles, in order,
  across four steps. The existing canonical account-abstraction slug is retained
  instead of the typo in the feedback URL. The fifth "Try it & build" step has
  been removed from the navigation and guide, and the headline says four steps.
  The remaining English guide copy and selections are unchanged. Steps 3 and 4
  use the approved revised titles.
- Listings and prebuilt article routes use actual published locale files.
  When a public article translation is absent, its locale-prefixed URL permanently
  redirects to the existing published English article path instead of serving
  English content under the requested locale. Actual translations serve directly;
  unknown, draft and future entries return 404. Publishing status is independent
  of metadata review status. Unknown metadata does not remove existing articles.

The redesigned homepage and supporting pages now live under `/knowledge-base`,
matching the existing public prefix. The old `/kb` route family, including the
static article/style-guide and duplicate article previews, has been removed
without redirects. Existing `/knowledge-base/[slug]` routes keep serving the
approved data-backed article UI directly. Public pages no longer inherit the
preview noindex flag; search results remain noindex. This branch has not been
deployed to production.
Cards, search results, reading lists, recent posts and related articles use the
stored canonical article paths. Next Link adds the current locale prefix once;
review catalogs are scoped to the current locale. Missing public translations
redirect to the existing English article address. Hub/Subject changes affect
navigation and metadata, never the article address. Original article-body links
keep their established destinations. No article route renames or redirects to
new categorized URLs are introduced; missing-translation redirects are the only
article redirects added here.

The accepted UI is the pre-integration `951c139` design. Data integration must
preserve its page structure, styling, cards and controls. Handoff document
interaction proposals do not override the approved UI without user approval.
On 2026-09-28 the user approved Ahron's PDF refinements: uppercase home labels,
explicit desktop copy breaks, no Hub numbering, purple/white reading-link hover,
aligned display headings and guide spacing, darker Subject/Step borders, and a
single desktop Subject row with an eye icon for View all. Mobile rails remain
scrollable rather than squeezing every card into the viewport.

Both KB newsletter forms now call the existing SendGrid signup endpoint and
configured list. Email-only requests omit the name field; the old named signup
remains supported. See `kb-newsletter-integration.md` for behavior and tests.

## Remaining review / release gates

- 248 renditions have proposed Hub assignments; general and unmatched material
  remains in All Articles. All classifications retain `pending-editorial` status.
- 40 renditions have no matching workbook proposal; 85 historical workbook
  candidates have no source match. Do not invent articles or redirect them.
- One of 18 historical featured URLs has no exact match (the VM article's old
  explainCKBot suffix). The Hub currently uses eligible fallback content.
- 73 renditions have no supplied author. Show that absence rather than inventing
  attribution. Existing website date corrections were reused and audited.
- Production taxonomy approval, curated fallback selection, translated
  Hub labels/guide copy, URL alias review, sitemap/canonical/hreflang rollout and
  a production crawl remain required before release.
- The homepage Most read cards use the approved 2025-09-28–2026-09-27 GA4
  snapshot. Refresh is manual, not a live GA API integration. Archive and Hub
  popularity controls remain disabled; their default is still newest first.
- The downloaded September 24 SEO handoff has been reviewed. Its pagination
  rules conflict, its Hub path URLs require an additional routing change, and
  its static archive-page list exceeds the current page count. Resolve these
  before implementing the sitemap; see `kb-seo-handoff-review.md`. Search
  Console submission will be handled by the team.

## Checks

`yarn kb:validate` checks all source/body hashes, route and identity uniqueness,
original source-directory slugs, canonical article links (including case,
underscores and locale prefixes), and stable addresses after reclassification.
It also exercises the real article route loaders: prebuilt public paths contain
only actual published renditions, missing public translations permanently redirect
to the existing English article path, actual translations stay localized, and
unknown, draft and future articles return 404. The source snapshot still contains
318 unmodified renditions; redirects preserve original slug case, underscores
and URL encoding.
Taxonomy ownership, available cover paths, review-catalog locale isolation,
recommendation deduplication and technical/Chinese search examples are covered.
This is not an editorial review or proof that every historical public URL was
live. Actual production HTTP URL reconciliation is still needed before
introducing historical URL redirects beyond the missing-translation behavior.
