# September 24 SEO handoff: scoped review

Reviewed on September 28, 2026 from the downloaded
`🚀  Nervos-Website-Fixes-Dev-Handoff-2026-09-24.xlsx` workbook. The workbook was
read without modification. This review covers the user's sitemap question; it
does not approve or implement every redirect, slug cleanup, firewall, content,
or other task in the broader handoff.

## Verified source inventory

`10_dev_Sitemap_Include` contains 346 explicit URLs: 11 core pages, one Start
Here page, six Hubs, ten archive pages, and 318 article renditions. The 318
article rows comprise 211 English, 64 Chinese and 43 Spanish entries. The
workbook also requests genuinely translated core pages beyond those explicit
URLs. These counts describe the supplied list, not a completed production
HTTP crawl or verified indexability.

The inclusion and exclusion tabs agree that real translations may be included
and English fallback pages should not be treated as independent translations.
Published article paths must remain unchanged. Sitemap generation should use
the actual available routes and source data, not blindly copy the workbook's
URL rows.

## Decisions needed before implementation

1. **Pagination conflict.** `09_dev_Robots_Sitemap!A4` blocks every `?page=` or
   `&page=` URL, and `A7` excludes `?page` from the sitemap. In contrast,
   `10_dev_Sitemap_Include!A24:F32` explicitly includes the new archive's pages
   2–10 and requires self-canonicals. `10b_dev_Index_Exclude!A5:C5` identifies
   the _old_ `/knowledge-base?page=...` listing as the exclusion target.
   Proposed resolution: distinguish old listing filters from the new
   `/knowledge-base/articles?page=N` archive; do not apply a blanket pagination
   block. Confirm this interpretation with the team before rollout.
2. **Additional Hub routing change.**
   `10_dev_Sitemap_Include!A17:F22` and
   `10b_dev_Index_Exclude!A6:C6` request
   `/knowledge-base/topic/<slug>` and redirects from query-based Hub URLs.
   The current implementation uses `/knowledge-base/topic?hub=<id>`. These
   proposed path routes must exist before they can be listed in a sitemap.
   Confirm the additional Hub routing/redirect scope separately. It must not
   rename or redirect normal article URLs.
3. **Generate archive pages from the data.** The workbook includes page 10,
   but the current English catalog has 211 articles and the implementation
   serves 24 per page: nine pages. `src/server/kb-page.ts` rejects pages beyond
   the available articles. Generate only valid pages for each supported
   catalog; do not hardcode ten pages from the handoff.

The handoff's core-page `lastmod` suggestion uses the build date. A build alone
does not prove content changed; reliable content-modification dates should be
used where available rather than inventing updates. A deployment-time check
of canonical targets, translation availability and HTTP responses is still
required.

## Not changed by this review

No robots.txt, sitemap generator, public URL migration, new redirect, source
article edit, production deployment or Search Console submission was made.
The team has offered to handle Search Console access and sitemap submission
after the implementation is ready.

## October 22, 2026: D-01 historical article redirects

The newer `(2).xlsx` hand-off supersedes the September review above for this
implementation. D-01 is separate from D-18: current article folder names,
canonical paths, metadata, UI and editorial classifications are unchanged.

- `config/kb-legacy-redirects.mjs` builds permanent redirects from the current
  article catalog, with five explicit historical aliases from tab 05. It accepts
  literal and percent-encoded `_(explainCKBot)` suffixes and spaces.
- A real published translation is the destination when available. Missing
  translations go directly to the current English URL, avoiding a second D-06
  redirect. Existing draft/scheduled translations are not exposed or replaced.
- The regression fixture records all 499 tab 04 source rows. The 474 recovery
  rows use current destinations, not the unimplemented D-18 lowercase names.
  No normal article URL is redirected by these rules.
- Twenty-four rows explicitly say "No rule". Row 467 is also left unmapped:
  `Unlocking_CKB_Liquid_iCKB` is a typo without the legacy suffix, despite the
  spreadsheet claiming that the suffix catch-all handles it. Four excluded
  trailing-slash URLs first use Next's existing slash-removal rule, then use
  the new D-01 redirect. These four two-hop cases are recorded separately
  from the 474 one-hop recovery rows. The other unmapped paths remain unavailable.
- Unknown well-formed legacy slugs lose the suffix and still return a real
  404; they are not redirected to the homepage or matched to a guessed article.

Dele's merged content PRs #315–#319 and #321–#324 changed Markdown links, not
folders. Website #23 changed the Wiki links. D-18's fifty renames have not
occurred. Its future destinations must not be deployed until the corresponding
content, references and redirects can ship together. PR #320 remains excluded.

This change does not implement D-07 query redirects, D-19 general redirects,
sitemap generation, firewall settings or a production deployment. D-01's
production HTTP and Search Console acceptance remains pending deployment.

## October 23, 2026: D-18 approved article slug cleanup

This is the separately approved exception to preserving existing article URLs.
Only the 50 explicit mappings in `(2).xlsx`, `06_dev_Slug_Cleanup!A5:J54`, are
applied. Other article addresses and the site's visual design are unchanged.

- `metadata/slug-migrations.json` in the article repository records the exact
  mapping. `scripts/migrate-kb-slugs.mjs` applies it to an explicitly selected
  checkout, with collision checks, a two-step case-safe rename, and an
  idempotent `--check` mode.
- Fifty article folders / 141 files moved, affecting 61 renditions (50 EN,
  seven ZH, four ES). Eighty Markdown files contain 108 link-target updates.
  Visible article text, frontmatter, translations and all 455 asset bytes are
  preserved. The catalog still contains 213 articles / 320 renditions.
- Catalog IDs, canonical paths, source paths, image references, related IDs,
  featured IDs and reconciliation paths follow the approved mapping. Editorial
  classifications, recommendation order, review decisions and historical
  `handoff.json` evidence are preserved. Start Here and Most Read only receive
  corresponding ID changes; their contents and layout are not redesigned.
- Old bare article URLs and shared asset URLs permanently redirect to their
  new paths. Matching is case-sensitive to avoid redirect loops on case-only
  renames; query parameters are retained. The D-01 historical aliases/suffixes
  now point directly to final D-18 destinations. Missing-translation and
  unpublished-translation safeguards remain in place.
- The preparation script resolves historical handoff IDs through this mapping
  and preserves existing editorial decisions during regeneration.

### Local acceptance

- 108 regression tests, `kb:validate`, TypeScript and the production build pass.
  Existing lint, page-data-size and Next configuration warnings are unrelated
  to this migration and were not widened into this task.
- The local production server passes 400 old-article redirect requests, all
  474 D-01 recovery rows, all 320 current canonical article paths, all 455
  byte-checked assets and 80 old asset redirects. The 21 excluded/malformed
  paths still end in real 404s. Query values, duplicate keys and ordering are
  retained (equivalent URL encoding may be normalized by Next).
- Re-run these HTTP checks with
  `node scripts/check-kb-slug-migration-http.mjs http://localhost:3002` after
  starting a local production build. Tests additionally exercise Next's actual
  compiled middleware matcher, not just the handler in isolation.

### Release gates (not performed in this local implementation)

1. Commit the article changes, including the migration manifest and catalog,
   to the metadata-cleanup branch. On a case-insensitive filesystem, explicitly
   stage the old-to-new case-only renames: ordinary `git add -A` is not sufficient
   evidence. Verify the staged Git tree contains all 50 exact destination names
   and none of their exact old names. Do not change global Git settings.
2. Update the website's article-submodule pointer to that exact content commit,
   then commit the website's D-18 resolver, redirects, ID references and tests.
   A dirty submodule working tree is not a deployable replacement for the pin.
3. Deploy the paired website/content revision atomically. D-01 must be present
   before or with the rename; never deploy renamed content against website
   code that cannot resolve the old URLs. Neither a content-only deployment nor
   a redirect to an unavailable future slug is acceptable.
4. Re-run the canonical/legacy URL and asset HTTP checks in the deployed
   environment, then have the SEO owner verify production indexing. Sitemap
   generation/submission remains its separate D-03 item. PR #320 is still excluded.

No commit, push, merge or production deployment was performed for D-18.

## October 23, 2026: D-07 retired listing query URLs

The 10 October decision in `(2).xlsx`, `01_all_Task_List!G11:H11`, and
`10b_dev_Index_Exclude!A5:C5` supersedes the outdated canonical/noindex/robots
wording in tab 08. The query inventory in tab 08 is used for coverage, not as
authorization to block crawling or rewrite article URLs.

- Only the exact KB homepage path is affected, in each configured locale.
  `?sort_by=...` permanently redirects (308) to the same-language KB homepage.
  `?page=...` redirects to the same-language `/knowledge-base/articles` page.
  Explicit English resolves to the unprefixed English destination.
- When both parameters exist, `page` takes precedence so the old listing
  reaches the archive in one hop. All occurrences of both retired parameters
  are removed; other parameters, including repeated tracking keys, survive.
  Empty, repeated and invalid old values also collapse to that destination.
  Old page numbers are not copied into the differently sized new pagination.
- The current `/knowledge-base/articles?page=N` route is not redirected.
  Valid pages keep their content and have a self-canonical and a distinct
  browser title. Page 1 canonicalizes to the base archive URL; tracking keys
  are excluded from the canonical. Real translated article lists retain their
  locale; empty untranslated locale lists refer to the English archive.
- This narrowly covers the archive head-metadata portion also referenced by
  D-21. It does not complete D-21's Hub path migration, Hub listing coverage,
  other page metadata or locale policy. Visible archive H1, all child markup,
  layout classes, article order, links and controls are unchanged.
- Article URLs, D-01 and D-18 redirects, resources, search, Hub query routes
  and unrelated query parameters are untouched. D-02 continues allowing
  crawlers to see the redirects; no robots block or redirect-page noindex is
  added. Sitemap generation remains D-03.

Repeat the actual HTTP checks against a locally started production build with
`node scripts/check-kb-query-redirects-http.mjs http://localhost:3002`.
Local acceptance passed: 119 regression tests, source/catalog validation,
TypeScript, formatting and the production build. HTTP checks cover 72 old
listing cases and 23 valid archive-page requests (including explicit English
aliases), invalid-page 404s and untranslated-locale canonical handling.
The full D-01/D-18 article and asset HTTP checks also pass unchanged. Existing
lint/configuration warnings remain outside this task; the build has no errors.
Deployment and production acceptance remain separate. No commit, push, merge,
deployment or shared workbook status update was performed for D-07.

## October 23, 2026: D-13 article image alternative text

This completes the rendering fallback confirmed in `(2).xlsx`,
`01_all_Task_List!G17`, and Dele's clarification. Earlier template/avatar and
decorative-image changes remain intact; article-specific descriptions can
still be improved by the content team independently.

- Article covers use the current language's article title as their alt text.
- Body images preserve supplied Markdown or raw HTML descriptions exactly.
  Missing, empty or whitespace-only descriptions, and the placeholder
  `alt_text` (case-insensitive after trimming), fall back to that same title.
  Other text is not guessed or rewritten. Future meaningful Markdown alt
  descriptions automatically take precedence over the fallback.
- Decorative images remain empty-alt. Image resources, relative URL
  resolution, loading behavior, layout classes, dimensions, article text,
  routes and editorial selections are unchanged. No source Markdown or
  catalog file was edited for D-13.

Local acceptance: all 127 regression tests, source/catalog validation,
TypeScript and the production build pass. Full rendering comparisons across
320 published renditions are identical to the previous implementation after
removing alt attributes; source and body hashes remain unchanged. Real local
production HTTP checks also pass for all 320 pages (213 EN, 64 ZH, 43 ES):
320 covers use their titles; of 430 body images, 71 empty descriptions and
343 placeholders receive the fallback, while 16 supplied descriptions are
preserved. These are rendered image occurrences, not unique asset counts.

The fallback is not a replacement for content-specific accessibility copy or
a claim of complete accessibility compliance. Content-team description
improvements and deployed acceptance remain separate. No commit, push,
deployment or shared workbook status update was performed for D-13.

## October 23, 2026: D-08 independent SEO descriptions

This implements the code work authorized by `(2).xlsx`,
`01_all_Task_List!G12:O12`, and `11_dev_OnPage_Templates!A5:F5`.
The unapproved copy in `12_dev_Core_Page_Titles` has not been applied.

- Article frontmatter supports an optional plain-text `description` field in
  each language file. The preparation script carries it into the catalog and
  the loader exposes it without replacing the visible `subtitle`.
- Metadata prefers a nonblank `description`, otherwise the same language's
  `subtitle`. The shared OpenGraph component emits exactly one ordinary,
  Open Graph and Twitter description, all with the same normalized value.
  Metadata alone is limited to 155 Unicode characters, at word boundaries
  where possible; source copy and visible summaries remain intact. Older
  browsers without `Intl.Segmenter` have a safe fallback.
- Core and KB pages reuse their existing description copy. Foundation, which
  did not use the shared Page wrapper, now uses the same head-only component
  with its existing translated slogan and no formatting tags. Its visible
  title, emphasized slogan, navigation, layout and images are unchanged.
- There are currently no dedicated `description` values in the 320 article
  renditions. 264 use their existing subtitles. The remaining 56 (19 EN,
  19 ZH, 18 ES) lack both fields and remain empty rather than receiving invented
  copy. Content-team additions and approval remain separate work. The source
  Markdown and catalog were not changed for D-08.
- After content adds descriptions, regenerate and review the catalog and
  update the pinned content commit through the existing workflow. See
  `docs/kb-data-integration.md` for the field contract and regeneration steps.

Local acceptance: 145 regression tests, source/catalog validation, TypeScript,
formatting and production compilation pass. Actual production-mode HTTP
checks cover all 320 published article renditions plus 23 other page requests
(including Foundation's EN/ZH/ES pages, archive pagination and all six Hubs).
Each response has one matching description tag of each kind, within 155
characters. The full visible main markup of all 343 responses matches the
previous D-13 build exactly. Home and CKB page descriptions are distinct.
The isolated D-08 validation server was stopped after the checks.

D-08's code is complete; approved content copy, publication and deployed
acceptance are not. No commit, push, deployment or shared workbook status
update was performed for D-08.

## October 23, 2026: D-10 canonical, translation links and actual page language

This implements `(2).xlsx`, `01_all_Task_List!G14:H14`, and
`11_dev_OnPage_Templates!A7:F9`, with the previously confirmed D-07
pagination exception. Existing translation-routing behavior from D-06 remains
unchanged. No language-switcher UI is added by this task.

- One shared head component now owns canonical and hreflang links. Existing
  article addresses remain the canonical URLs; English uses the unprefixed
  address, with the production origin and no tracking parameters or fragment.
- Article alternates come from actual published, readable language files,
  not assumed locale availability. Every real rendition has the same
  reciprocal set, including itself and an English x-default when English
  exists. Missing, unpublished and unreadable translations are excluded.
  Future published translations join the set when content is regenerated.
- Core pages use their actual nonempty primary translation namespaces.
  Empty Korean/Turkish files do not advertise English fallback as translated
  content. Journey retains its genuine Korean/Turkish versions; Media Kit
  is English-only. `/home` and localized aliases canonicalize to the existing
  root homepage without introducing redirects.
- English-only redesigned KB landing pages remain English in metadata and
  do not advertise invented translations. Each Hub retains its distinguishing
  `?hub=` selector until the separate D-21 path migration is implemented.
- Archive page N keeps its own self-canonical, including `?page=N` for pages
  beyond page 1. Translated archives keep their actual catalog language;
  empty untranslated archives refer to English. No hreflang pairing is
  invented between different-language archive page numbers, which contain
  different article subsets. Search retains its clean canonical without
  declaring search-result translations.
- The HTML language is emitted correctly in the server response and reapplied
  after client navigation, including when Next.js resets it to the URL locale.
  Existing visible React tree positions and generated SVG IDs are preserved.

Local acceptance: 160 regression tests, source/catalog validation, TypeScript,
formatting and the production build pass (only existing warnings remain).
Actual production-mode HTTP checks cover 481 responses: all 320 published
article renditions, core language variants, KB landings, all six Hubs, valid
archive pages, explicit English aliases and tracking parameters. Each has one
canonical and the expected language/alternate set. All 481 visible main
elements are byte-for-byte identical to the prior D-13 build. D-06 missing
translation redirects and unknown-article 404s still pass. D-07's 72 legacy
listing redirect cases, 23 archive-page requests and invalid-page checks also
pass. The isolated validation server was stopped after testing.

Repeat head and optional visible-markup comparison checks with
`node scripts/check-page-seo-http.mjs <local-origin> [baseline-origin]`.
No source article content, catalog, UI, route behavior, title copy or editorial
selection was changed for D-10. D-21 Hub path migration, sitemap work,
publication and deployed acceptance remain separate. No commit, push,
deployment or shared workbook status update was performed for D-10.

## October 23, 2026: D-19 general redirects, baseline headers and UTC dates

Code work follows `(2).xlsx`, `01_all_Task_List!E23:J23`,
`05_dev_Redirects_Explicit!B125:E127`, and the date/header rows in
`17_dev_Performance`. D-19 is not marked fully deployed: the domain-level
redirect still requires Vercel configuration and external acceptance.

- Explicit `/en` and `/en/...` addresses now permanently redirect (308) to
  unprefixed English. `/ckb` and `/en/ckb` go directly to `/ckbpage`; other
  supported locale aliases keep their locale. Query values, duplicate keys
  and their order survive. Next may reserialize spaces from `%20` to `+`.
- Next 14 must preserve the raw incoming URL to distinguish a literal `/en`
  from its internally inferred default locale. Middleware normalizes data
  paths only for the existing D-07/D-18 helpers; it does not strip the required
  `/en` within `/_next/data/...` endpoints. D-07 listing cleanup and approved
  D-18 article migrations retain precedence and direct final destinations.
- All paths receive `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a Permissions-Policy
  disabling unused camera, microphone and geolocation capabilities. Baseline
  CSP disallows object embeds, restricts base URLs to self, and allows framing
  only by the same origin. It does not introduce script/connect/image/frame
  destination allowlists that would change existing GA/newsletter integrations.
  This is not a complete nonce-based script/XSS policy; a stricter policy
  would require a separate integration audit. Cross-origin embedding of the
  website is intentionally restricted; check deployment preview integrations.
- The exact `www.nervos.org` host additionally receives HSTS with one-year
  max-age, `includeSubDomains` and `preload`. Localhost and development hosts
  are excluded. A policy on www does not cover the apex or sibling subdomains,
  and the preload token is not a preload-list submission. No submission or
  platform configuration was performed.
- Existing Home, article and card date formatters already explicitly use UTC.
  No date UI change was needed. New regression tests execute their actual
  formatting expressions in UTC, Los Angeles, Shanghai and Kiritimati
  processes, covering midnight, date-only values, offsets, leap day, DST,
  year boundaries and missing/invalid values.

Local acceptance: all 167 regression tests, 320-rendition content validation,
TypeScript, formatting and production compilation pass. HTTP checks cover
171 D-19 responses including real Next data navigation and exact-host headers;
72 legacy listing redirects and 23 archive pages; 481 canonical/language
responses; 400 D-18 old article requests; 474 D-01 historical redirects;
320 current article paths; 455 unchanged asset responses and 80 old asset
redirects; and 21 excluded/malformed 404s. All 393 compared KB main elements
are byte-for-byte identical to the D-13 baseline.

The optional whole-site byte comparison encountered a build-time GitHub data
difference on `/es/learn`: D-13 has no author/contributors, whereas this build
has Keith-CY and 20 contributors. Removing only that author-panel subtree
leaves identical main markup. No UI components, layout, styles, source content
or editorial choices were changed by D-19.

Deployment follow-up: configure the apex-domain HTTP request to go directly
to `https://www.nervos.org/...` in Vercel Domains, retaining path/query, and
verify one response hop on the deployed host. Verify HTTPS/subdomain readiness
and actual edge headers before any apex HSTS or preload-list action. Deploy
the route changes with the existing D-01 work, as the handoff specifies.
The isolated validation server was stopped. No commit, push, deployment or
shared workbook status update was performed.

Repeat D-19 HTTP checks with
`node scripts/check-site-routing-http.mjs <local-origin> <isolated-build-dir>`.

## October 23, 2026: D-20 GA4 custom events and page groups

Code work follows `(2).xlsx`, `01_all_Task_List!G24:H24`. D-20 remains pending
deployed GA/DebugView acceptance and the owner's reporting configuration;
local mocks are not proof that a GA property has received events.

- The existing GA4 production measurement ID is retained, with an optional
  explicit environment override. All 17 handoff event names now have a GA4
  transport and the requested parameter mapping. Production Umami retains
  the existing KB identifiers; the newsletter result diagnostic is Umami-only.
  The updated [event inventory](./kb-analytics-events.md) documents both schemas.
- Shared `page_view` reporting handles initial load and client navigation,
  attaches one of the six `content_group` values, and avoids duplicate views
  from StrictMode or fragment-only navigation. GA uses the standard queue
  before its after-interactive SDK loads. Other auto-tag configurations still
  require administrator checks to prevent duplicate/manual page views.
- Preview requires an explicit test measurement ID, different from the
  production stream. Local debug additionally requires explicit opt-in.
  Unconfigured preview/local builds do not send GA events. The administrator
  must choose a stream in an independent test property: a different stream
  ID alone does not establish property isolation. Debug mode is never treated
  as a production-data filter. No new GTM container was introduced.
- Article clicks include the selected article's Hub and one-based displayed
  position. Step/TOC labels, resource/footer/social URLs, filter context,
  layout columns and pagination direction are supplied by existing controls.
  Footer Documentation/Github/Explorer also emit the resource event without
  replacing their footer click event or changing their destinations.
- Search preserves the existing five-suggestion JSON response and adds the
  full result count in `X-Total-Count`. Submit analytics obtains that count
  asynchronously without delaying navigation, or reuses a matching server
  count. Failed count requests omit the metric instead of reporting zero;
  disabled tracking makes no additional count request.
- Newsletter submit now fires only after the existing API accepts the request,
  with `status: accepted`; attempts, pending requests and errors are not
  successes. SendGrid's asynchronous acceptance is not final delivery or
  confirmed subscription. The form UI, provider, credentials and list are
  unchanged. Historical attempt counts must be analyzed separately.
- Explicit GA event URLs omit query/hash; search/title text has bounded,
  best-effort filtering for common sensitive patterns. No newsletter input
  values or error bodies are recorded. This is not a complete PII detector
  and does not sanitize unrelated automatic tags. Whole-page scroll tracking
  now survives StrictMode RAF cleanup and does not reset on TOC hash changes.

Local acceptance: all 225 regression tests, 320-rendition content validation,
TypeScript and the optimized Next build pass. Scoped ESLint has no errors
(existing image/non-null-assertion warnings remain). The validation build uses a
test-only measurement identifier and skips missing local SendGrid credential
validation; no actual subscription or GA request was made. Production/preview
environment branches and all 17 payloads are exercised by isolated VM tests.

Actual local HTTP checks verify 18 search queries across EN/ZH/ES against
server-rendered totals and the unchanged suggestion JSON, plus GET-only API
behavior. All 401 current KB responses have byte-identical visible main
markup against the prior D-13 baseline. Another 481 metadata/locale HTTP
checks pass. No UI, layout, CSS, visible copy, article routing, content source
or editorial selection was changed by D-20. The isolated test server was
stopped; the user's running servers were not changed.

The new [release checklist](./kb-release-checklist.md) records paired content
and website commits, D-18 release ordering, domain/WAF/header configuration,
sitemap handoff, preview GA property setup, automatic-event controls,
DebugView/key-event acceptance, SendGrid verification and rollback evidence.
It is a local cumulative document, not a shared-sheet status update or a
publication approval. No commit, push, deployment, production GA write or
shared workbook change was performed.

Repeat local output checks with
`node scripts/check-kb-analytics-http.mjs <local-origin> [baseline-origin]`.

## October 23, 2026: D-21 Hub routes and HTML coverage

Implemented the page/routing portion of `(2).xlsx`,
`01_all_Task_List!G25:K25`, with the related redirect, sitemap and on-page
tabs. D-21 is **not yet closed for release**: the approved redirects, robots
and sitemap must ship together. D-03 generation was completed in the subsequent
section below; production deployment and acceptance remain outstanding.
The draft D-14 title changes remain on hold; this work reuses existing titles
and visible introductory copy for page descriptions.

- Six English Hub paths now serve at `/knowledge-base/topic/<existing-hub-id>`.
  Old `?hub=<id>` and `?hub=<English name>` selectors permanently redirect
  directly to those paths. Subject/tracking values survive the redirect.
  `/knowledge-base/topic` without a selector redirects to the KB home;
  empty, repeated or unknown selectors and unknown Hub paths return 404.
- Hub templates have no translated editions. Locale-prefixed Hub paths
  redirect to the English Hub rather than publishing English copy at a
  supposedly translated URL. Article translations, their language switcher
  policy and the separate archive language rules are unchanged.
- Home Hub cards, Related hubs and article category navigation use the new
  canonical paths. Article URLs are unchanged by D-21; the earlier approved
  D-18 migrations remain intact.
- Every published article assigned to a Hub is present once as a real HTML
  card/link. The existing Subject filter controls the visibility of those
  same cards. Hidden cards have `hidden`, `display:none` and `tabindex=-1`;
  selecting View all reveals the complete list. Default Subject, visible
  card order, density, headings, copy and CSS are unchanged. Click positions
  remain one-based within the visible subset.
- Hub, Start Here and All articles metadata use their existing page copy,
  correct canonical URLs and production OG/Twitter URLs/images. Archive
  page N retains its distinct title and self-canonical. Hub Subject/tracking
  queries do not create additional canonical pages or language alternatives.

Current coverage is 151 English articles across the six Hubs (20, 14, 51, 8,
40 and 18). Another 62 English articles are not Hub-assigned and remain
accessible through All articles. This task does not invent new classifications
or claim that Hub coverage alone includes every article.

Validation:

- 247 unit/regression tests passed; content validation verified all 320
  article renditions and original content hashes. TypeScript and the isolated
  Next production build passed. Targeted ESLint had no errors, only three
  existing warnings. No stylesheet changed.
- 244 D-21 HTTP checks passed, including old id/name forms, all locale
  redirects, invalid selectors, complete HTML links, metadata and Next data
  navigation. Forty visible page/Subject states matched the pre-D21 build
  after normalizing only the approved Hub href changes and removing the
  inactive filter cards. No visible text, class, style, image or card order
  differences were ignored.
- The metadata suite checked 481 responses, including all 320 article
  renditions. The analytics suite checked 365 current KB pages and 18 search
  cases. Earlier routing suites still passed: 171 D-19 responses, 72 old
  listing redirects, 23 archive checks, 400 D-18 redirects, 474 D-01 historical
  requests, 320 current article URLs, 455 asset responses, 80 old asset
  redirects and 21 genuine 404s.
- Browser acceptance confirmed the Quantum Hub starts with its original
  four cards; View all shows 14; Quantum-Resistant Blockchains shows its four
  articles; Related hubs navigates to the new Architecture path and resets
  to its original first Subject. The screenshot retained the existing layout.

Repeat Hub acceptance with
`node scripts/check-kb-hubs-http.mjs <local-origin> [pre-D21-baseline-origin]`.
The optional baseline comparison in the older metadata/analytics scripts
still requires matching route/link behavior; use the dedicated Hub suite for
pre-migration comparisons.

Launch dependencies were added to [the release checklist](./kb-release-checklist.md).
No commit, push, deployment, shared-sheet update or content-repository change
was made for D-21. The temporary validation server/build are separate from the
user's development server and retained D-13 baseline. The temporary server
has been stopped and its recoverable build moved to
`/private/tmp/kb-d21-validation.bSu23i/.next-d21-production`.

## October 23, 2026: D-03 build-time sitemap

D-03 code and local acceptance are complete. Project `build` and `dev`
commands now generate `public/sitemap.xml` from the reviewed content catalog
and actual translation files before Next starts. The generated XML is ignored
by Git; content changes require a publishing build. Direct `next build`
invocations must first run `pnpm sitemap:generate`.

The current snapshot contains 390 unique production canonical URLs: 320 article
renditions, 48 core-page language versions, 14 archive pages (9 English, 3
Chinese, 2 Spanish), the English KB home and Start Here, and six English Hubs.
Core language detection and Hub IDs are shared with the page metadata/routing
code; empty translation namespaces do not become language alternatives.
Article hreflang sets are reciprocal and include only real published versions,
plus x-default when English exists. Archive pages do not falsely declare
page N in another language to be the same article selection.

Compared with `10_dev_Sitemap_Include`, all 346 explicitly listed addresses
are represented except the currently nonexistent English archive page 10.
The additional 45 URLs are 38 translated core pages, five Chinese/Spanish
archive pages and two newer English articles. The earlier D-07 clarification
and tabs 10/10b govern pagination: valid new `/articles?page=N` URLs remain,
while retired root filters and query-form Hubs are excluded. Search, `/home`,
`/en`, draft/future articles, missing translations and D-18 redirect sources
are also excluded. No new URL migration was introduced.

Article `lastmod` uses the normalized frontmatter date requested by D-03.
Core pages, Hubs and archives have no reliable modification timestamp, so
their optional lastmod is omitted rather than set to every build's date.
This follows the existing release checklist and avoids presenting deployment
as a content update; [Google's sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
requires lastmod to reflect meaningful page changes. No article dates were
edited. Missing, new or changed Markdown files without matching reviewed
catalog metadata fail generation before the old XML is replaced.

Validation:

- All 390 generated URLs directly returned 200 on the isolated production-mode
  local server; XML content type, parsing, unique locations, canonical equality,
  matching HTML/XML hreflang, reciprocity and robots declaration passed.
- All 320 article source/body hashes passed existing content validation.
  TypeScript and the isolated Next build passed (413 generated static pages).
- All 253 unit/regression tests passed, including stale/missing sources,
  invalid dates, publication filtering, dynamic pagination, XML serialization
  and build-command integration. Targeted ESLint passed without errors or warnings.
- The D-21 HTTP suite passed all 244 checks after extracting its unchanged Hub
  constants into shared configuration. No component markup or stylesheet was
  changed for D-03.
- Existing metadata checks passed 481 responses; domain/English-alias routing
  passed 171 responses; old query redirects and archive validation passed
  72 and 23 cases respectively.

Repeat local acceptance with `node scripts/check-sitemap-http.mjs <local-origin>`.
The validator intentionally refuses non-local hosts, so it cannot accidentally
test or submit to production. Production access, firewall checks and search
engine submission remain launch tasks in [the release checklist](./kb-release-checklist.md).
Dele / an authorized operator submits the deployed sitemap in Google Search
Console and Bing Webmaster Tools. No submission, commit, push, deployment,
shared-sheet edit or article-repository change was made this round.
The temporary server has been stopped; its recoverable build is stored at
`/private/tmp/kb-d03-validation.jiujSV/.next-d03-production`. The user's dev
server and the retained D-13 baseline were not stopped or reconfigured.

## October 23, 2026: D-17 responsive image delivery

D-17's KB image-delivery implementation is complete locally; the whole task
remains open for source-image compression and Lighthouse acceptance. This
round preserves the approved UI, all original image URLs and bytes, Markdown,
article URLs and OG image URLs.

Article static props now supply trusted local image dimensions using the
existing image-size dependency. Directory discovery covers Markdown inline
and reference images plus sanitized raw HTML, without parsing images with a
fragile regular expression. The helper uses bounded header reads and rejects
path traversal and symlink escapes; missing, external and corrupt images
retain the original fallback rather than hiding the article.

Article heroes use responsive Next images with preload/high fetch priority.
Body images remain lazy. Original width, height and explicit aspect ratio
preserve layout, including fractional pixel rounding in resized variants.
Animated GIFs and unknown/external body images are served directly. D-13's
description/title fallback and HTML sanitization remain intact.

Home recommendations, archive/Hub grid cards and More from CKB now optimize
local PNG/JPEG covers inside the same wrappers and original crop. Responsive
sizes follow the existing density and breakpoint rules; cards remain lazy,
including hidden Hub cards. Other cover formats and external covers retain
the original background fallback. No stylesheet, text or design was changed.
Next's image configuration enables AVIF/WebP negotiation and appropriate
small-image widths; sharp 0.33.5 is declared and locked for encoding.

Validation:

- All 270 unit/regression tests passed, including eight server-image tests,
  seven card-image tests and two added full-render article-image tests.
- All 320 article source/body hashes and content checks passed. The server
  helper covers 320 covers and 429 local body references, leaving one external
  body reference unchanged; tests verify that all 451 local image hashes remain
  unchanged. The shared 360-frame GIF remains animated.
- TypeScript and the final isolated Next build passed, producing 413 static
  pages. Targeted lint found no errors; the intentional raw-image fallback and
  an existing non-null assertion produce warnings.
- Browser checks at 390px and 1440px compared the retained D-13 baseline with
  this build. Home/archive card geometry and the sampled article's heading,
  hero, body block and related-cover positions/dimensions match exactly. Mobile
  has no new horizontal overflow; lazy-loaded card images display correctly.
- The local HTTP image validator passed 36 requests across seven pages,
  including three DAO article languages and hidden Hub cards. Eight actual
  AVIF/WebP variants passed format, dimensions, aspect-ratio rounding, byte-size
  and refreshed-cache HIT checks. A 4,360,169-byte sample hero becomes 91,197
  bytes in AVIF / 89,024 in WebP at 640px, and 360,557 / 355,500 bytes at 1440px.
  These are sample measurements, not a site-wide reduction claim. Four original
  image URLs remain byte-identical, including the animated GIF. Repeat with
  `node scripts/check-kb-images-http.mjs <local-origin>`; the script refuses
  non-loopback hosts.
- The existing page SEO HTTP validator passed 481 responses, including 320
  article language renditions, canonical and reciprocal language links.

The source originals are deliberately retained pending the separate tab 18
compression/visual review. A Lighthouse attempt could not launch an isolated
Chrome process; no Lighthouse score or “properly size images” pass is claimed.
Production native dependencies, CDN negotiation/cache, source compression and
Lighthouse checks are recorded in [the release checklist](./kb-release-checklist.md).
No commit, push, deployment, shared-sheet update or content-repository write
was made for D-17.
The temporary verification server was stopped and its recoverable build is
stored at `/private/tmp/kb-d17-validation.dxBiUq/.next-d17-production`. The user's
development server and retained D-13 baseline were left running unchanged;
temporary browser viewport overrides were reset and the test tab was closed.

## October 23, 2026: D-16 shared scripts and game startup

D-16 is in progress. This increment removes the homepage game from unrelated
pages' initial JavaScript and defers the homepage game's automatic seeding and
simulation. It does not change JSX layout, stylesheets, copy, article data or URLs.

Header, Footer and the presentational home Card now import the game opt-out
class from a dependency-free constants module. The original game-control
exports remain compatible. The homepage retains its game and interactjs; KB,
CKB and Mining pages no longer include those modules in their initial bundles.

The game leaves a paint opportunity before scheduling automatic initialization
with requestIdleCallback and a one-second timeout. Browsers without that API
use a cancellable timer after the same animation-frame boundary. Explicit
game input can start immediately. Initialization is idempotent, cancelled on
unmount and safe under Strict Mode effect replay. A first mouse stroke retains
its original coordinate mapping instead of moving the camera underneath it.
The existing server-rendered hero text is not gated on game startup.

Validation against the preceding D-17 production-mode build:

| Initial route JS | Before gzip bytes | After gzip bytes |
| ---------------- | ----------------: | ---------------: |
| KB homepage      |           271,054 |          234,741 |
| Article template |           375,332 |          339,018 |
| CKB page         |           257,712 |          221,398 |
| Mining           |           258,759 |          222,445 |

These are the summed gzip sizes of unique initial JS files from build-manifest
(`/_app` plus the route), not measured network traffic or a Lighthouse score.
Each sampled non-game page removes about 36.3 KB gzip / 124.8 KB uncompressed.
The homepage retains its game: 272,900 → 273,009 gzip bytes, including the new
scheduler. No dependency was uninstalled or analytics integration changed.

- All 284 tests passed, including 14 new startup/boundary tests. They cover idle
  and timer paths, cancellation, Strict Mode, early drawing with a non-zero
  camera target, clear/pause and backwards-compatible exports.
- TypeScript, targeted ESLint and the isolated Next production-mode build
  passed; 413 static pages were generated. All 320 content/hash checks passed.
- The English KB homepage, quantum-resistance article, CKB and Mining pages
  have byte-identical main HTML to the preceding D-17 build. The HTTP SEO
  validator also passed 481 responses.
- Browser checks at 1280px and 390px confirmed homepage text/canvas rendering,
  desktop pause/clear and the mobile KB menu open/close. The unchanged live
  metrics API timed out locally; live metrics delivery is not part of this
  validation result. No hydration error was observed during these checks.

The whole D-16 task is not closed: mobile Lighthouse/Web Vitals acceptance,
the reported Mining shift, Wallets/Media Kit SVG weight and third-party-script
policy remain separate follow-ups in [the release checklist](./kb-release-checklist.md).
No commit, push, deployment, shared-sheet edit or content-repository write
was made this round. Browser viewport overrides were reset and the temporary
test tab was closed.
The tool permission policy rejected stopping the agent-created validation
server on port 3003, so it and `.next-d16-production` remain available locally.
The user's port 3001 development server and retained D-13 baseline were not
stopped or reconfigured. Stop the temporary server before archiving its build.

## October 23, 2026: D-16 Wallets and Media Kit SVG delivery

The table 17 inline-SVG item is implemented locally. Thirteen Wallets icons,
two Wallets decorations and two Media Kit decorations now load as separate,
content-hashed SVG files. The original SVG source files, stylesheets, page
copy, links and responsive layout rules are unchanged. Ordinary SVG imports
remain React components; hover/currentColor-dependent shared icons are untouched.

The opt-in `?url` loader reuses Next's static-image delivery and the existing
SVGR optimization stage. Keeping that stage is important: the prior inline
version rounds Media Kit's pattern scales. Serving the higher-precision source
directly changes the pattern's position, even with identical element dimensions.
The new loader preserves the existing optimized coordinates instead. Media Kit
retains its outer `mix-blend-mode: difference`; wallet decoration dimensions
and transforms remain explicit. Gate and CoinEx wordmarks have useful alt text;
decorations and icons next to their visible names use empty alt text.

Final production-mode build measurements against the retained D-16 baseline:

| Route     | HTML before / after, bytes | Initial JS gzip before / after, bytes |
| --------- | -------------------------: | ------------------------------------: |
| Wallets   |           765,095 / 66,911 |                     713,048 / 217,978 |
| Media Kit |           681,115 / 47,982 |                     430,813 / 207,841 |

HTML values are uncompressed file sizes. Initial JS is the sum of unique
`/_app` and route files from build-manifest, not measured network traffic.
SVGs are still downloaded separately; this removes duplicated embedded data
and makes it independently cacheable, rather than eliminating image transfer.
KB homepage initial JS remains 234,741 gzip bytes.

- All 292 tests passed, including eight SVG tests for loader routing, sizing,
  optimization precision and Media Kit blending. TypeScript, targeted ESLint
  (no errors) and the final isolated production build passed.
- All 320 content/source checks passed. No article repository edits were made.
- The SVG validator checked 17 assets against the previous inline geometry,
  plus 19 local HTTP responses for the two pages and their SVG files. Assets
  return `image/svg+xml`, exact expected optimized content and one-year
  immutable caching. The existing SEO validator passed 481 HTTP responses.
- Wallets browser measurements at 390px and 1280px preserve all 29 sampled
  heading/icon/decorative rectangles. All 15 external SVGs loaded and no
  browser errors were observed. The first Media Kit comparison exposed the
  precision issue above; regression tests now verify both corrected geometries.
  A final Media Kit desktop/mobile visual recheck remains on the release list:
  browser navigation calls returned after unusually long delays this round.
- Final artifact `.next-d16-svg-verified` includes Gate's alt label. HTTP/browser
  checks used `.next-d16-svg-final`, before that nonvisual label addition; the
  17 emitted SVG asset files are identical in both builds.

D-16 remains in progress pending mobile performance acceptance, Mining shift
investigation and third-party-script policy. These remain in the release
checklist. No commit, push, deployment or shared-sheet update was made.
Browser tabs were closed and viewport overrides reset. Tool policy rejected
Ctrl-C for this round's temporary servers on ports 3004 and 3005, including
after the network permission request. Their build directories
`.next-d16-svg-production` and `.next-d16-svg-final` are retained until the
servers can be stopped. Do not commit temporary `.next-*` build artifacts.
The user's port 3001 service and preceding baselines were not stopped.

## October 23, 2026 D-16 Mining initial layout stability

Mining's two decorative SVGs now use CSS media queries for their existing
mobile sizes and positions. Previously, `useIsMobile` rendered desktop geometry
first and changed it after hydration. The header already reserves its height;
this fix adds no space and changes no copy, imagery or final layout.

`BaseSeparatePage` accepts an optional decoration class. Its five other callers
retain their existing inline positioning. Mining keeps the same 750px breakpoint,
SVG source files, rotation and desktop/mobile coordinates.

- In the retained local production baseline, a 390×844 initial load recorded a
  non-interaction layout-shift entry of 0.5737, attributed to the decorative
  SVGs and wrappers. The corrected production build recorded no layout-shift
  entries in the corresponding mobile load, using a buffered PerformanceObserver.
  This is a local, unthrottled sample, not a Lighthouse or real-user result.
- Browser comparisons at 390, 750, 751 and 1280px matched all 24 sampled final
  rectangles and transforms: both SVGs, the title, description, information and
  functions sections. No browser warning or error was recorded in the corrected
  verification tab. The mobile screenshot was inspected; desktop equivalence
  was checked through the final rendered geometry.
- Five new tests cover stable server/client markup, the compiled responsive CSS
  and compatibility with the other shared-page callers. All 297 tests passed,
  as did TypeScript, targeted ESLint, Stylelint and the isolated production build.
- The 320 source/content checks and 481 real HTTP SEO responses passed. Article
  URLs, content, metadata rules and the article repository are unchanged by this
  increment.

The Mining hydration-shift fix is implemented locally. D-16 remains in progress
for final mobile performance acceptance and the other release-checklist items.
No commit, push, deployment or shared-sheet update was made.

The successful verification tab was closed and the viewport reset. The earlier
failed temporary tab could not be closed through the browser tool's URL policy.
The port 3006 verifier has a two-hour automatic shutdown; an early stdin shutdown
was rejected by tool policy. Existing services, including port 3001, were untouched.

## October 23, 2026 D-05 IndexNow verification and notification tooling

D-05's public verification file and opt-in notification command are implemented
locally. The supplied table 16 key is served at its exact root path with a
`text/plain; charset=utf-8` header. No UI, article, canonical URL or indexing
policy changes are included in this increment.

`pnpm indexnow --urls <JSON file>` defaults to an offline plan. It validates and
deduplicates production-domain URLs, preserves deleted URLs and splits requests
into at most 10,000 URLs per batch. Sending requires both `--submit` and an
explicit `--production-deployed` assertion. Before any POST, it verifies that
the live key returns 200, plain text and only the expected key. Requests reject
redirects and have timeouts; failures retain partial receipts without automatic
retry. HTTP 202 remains pending validation, not indexed or fully verified.

- Thirteen new offline tests cover the key/header contract, strict URL and flag
  validation, batch limits, empty and dry runs, key failures, 202, partial POST
  failures and the actual CLI with network access replaced by a failing stub.
  All 310 existing/new tests and all 320 article-source checks passed.
- Targeted ESLint, Prettier and the isolated production build passed. The build
  retains existing warnings; none was introduced by the IndexNow files.
- A temporary production-mode Next server returned the exact key plus LF with
  HTTP 200, `text/plain; charset=utf-8` and no redirect. It was closed immediately
  after this local HTTP check; existing development servers were untouched.

D-05 remains in progress: there is no confirmed production-completion hook in
the website repository. The article workflow only requests a deployment, so it
is not a safe notification trigger. Production event wiring, changed-URL
collection, persisted notification baseline/receipts, external D-04 access and
the first approved live submission remain release prerequisites. The tool does
not claim to detect changes automatically or prove the deployed revision.
Integration and retry instructions are in [the D-05 handoff](./kb-indexnow.md),
with release gates in [the release checklist](./kb-release-checklist.md).

No live IndexNow submission, commit, push, deployment or shared-sheet update was
made. The validation build is under the ignored `.next-kb-validation` directory.

## October 24, 2026 D-16 CKB initial decoration stability

The CKB page now uses CSS media queries for its two decorative SVGs instead of
switching from desktop to mobile geometry after hydration. It reuses Mining's
existing optional decoration class support. Only CKB's page and stylesheet
changed in production code; the shared component, other pages, SVG sources,
copy, links and section layout are unchanged.

The original 750px breakpoint, desktop/mobile offsets and sizes, SVG ordering
and first image's `rotateX(180deg)` are preserved. No extra height, placeholder
or redesigned element was added. The regression suite now checks both Mining
and CKB, plus compatibility with the four remaining inline-positioned callers.

- All 312 tests, 320 article-source checks, targeted ESLint/Stylelint/Prettier
  and the isolated production build passed.
- Production HTTP checks passed for seven CKB language routes and their three
  initial CSS assets. Actual optimized SVG markup matches the prior build;
  served CSS retains the exact original geometry at 320, 390, 750, 751 and
  1280px. The existing SEO suite passed all 481 HTTP responses.
- The seven generated pages' non-GitHub props and UI outside the decorations
  and contributor block match the retained D-05 build. The old build had author
  and contributor data; this build used the existing `null`/empty fallback when
  GitHub data was unavailable. No contributor-fetching or display code changed.
- Two browser connection attempts timed out before a page could be inspected.
  Browser visual/resize and CLS acceptance remain in the release checklist;
  this increment does not claim a measured CLS result or completion of D-16.

The temporary HTTP server was closed after verification; the user's development
server was untouched. The isolated build is `.next-kb-validation/d16-ckb`.
No commit, push, deployment or shared-sheet update was made.

## October 26, 2026 D-16 Developers initial decoration stability

Developers now uses CSS media queries for its two decorative SVGs, removing the
desktop-to-mobile geometry switch after hydration. The original 750px breakpoint,
sizes, coordinates and both 180-degree rotations are preserved. Its dark-theme
hook, SVG sources, copy, links, icons and section layout are unchanged. Production
changes are limited to the Developers page and its stylesheet; the existing
shared decoration-class support is reused.

- All 314 tests, 320 article-source checks and the isolated production build
  passed. Targeted ESLint, Stylelint, Prettier and diff checks passed. Existing
  unrelated build warnings remain.
- Two added regression tests cover identical server/client-environment markup,
  retention of the dark-theme hook and compiled CSS geometry at 320, 390, 750,
  751 and 1280px. Existing Mining, CKB and shared-caller coverage is retained.
- Seven Developers language routes and all three initial CSS assets returned
  HTTP 200. Optimized SVG markup matches the retained CKB-increment build;
  served CSS preserves all original sizes and positions at the five widths.
  The existing SEO suite passed all 481 HTTP response checks.
- All seven generated pages' non-GitHub props and UI outside the decorations
  and contributor block match the prior build. External author/contributor
  data differed between builds; fetching and display logic were not changed.
- The browser connection timed out before inspection. Actual dark-theme
  appearance, visual/resize checks and CLS measurement remain release gates;
  CSS and HTML checks do not establish a measured performance improvement.

This increment is implemented locally; D-16 remains in progress. The three other
inline-positioned shared callers (Community, Wallets and Learn) are unchanged.
Remaining acceptance is recorded in [the release checklist](./kb-release-checklist.md).
The temporary HTTP server closed after verification, without touching existing
development servers. The build is `.next-kb-validation/d16-developers`.
No commit, push, deployment or shared-sheet update was made.

## October 26, 2026 D-16 Community initial decoration stability

Community's two decorative SVGs now use CSS for their existing responsive sizes
and offsets instead of switching geometry after hydration. The 750px breakpoint,
original SVGs, right image's 180-degree rotation and dark-theme hook are retained.
Only the Community page and its stylesheet changed in production code; its
content, links, icons, DOM hierarchy and final layout are preserved.

- All 316 tests, 320 article-source checks and the isolated production build
  passed. Targeted ESLint, Stylelint, Prettier and diff checks passed; unrelated
  pre-existing build warnings remain.
- Two new regression tests cover identical server/client-environment decoration
  markup, the existing dark-theme hook and compiled CSS at 320, 390, 750, 751
  and 1280px. The other pages' regression coverage remains in place.
- Seven Community language routes and three initial CSS assets returned HTTP 200. Optimized SVG markup is identical to the previous Developers-increment
  build, and production CSS preserves the original geometry at all five widths.
  The SEO regression suite passed all 481 HTTP response checks.
- All seven pages' non-GitHub props and output outside the decorative container
  match the prior build. Five language versions had changed external GitHub
  data, so their contributor display was excluded from the UI comparison;
  contributor fetching and rendering were not modified.
- The browser connection timed out before inspection. Actual theme appearance,
  visual/resize checks and CLS remain pending in the release checklist. These
  code and HTTP checks do not establish a measured CLS improvement.

D-16 remains in progress. Learn and Wallets still use their existing
inline-positioned responsive decorations; neither was changed this round.
The temporary verification server closed after the HTTP checks, without
touching existing development servers. The isolated build is
`.next-kb-validation/d16-community`. No commit, push, deployment or shared-sheet
update was made.

## October 26, 2026 D-16 Learn initial decoration stability

Learn's two decorative SVGs now use CSS media queries instead of changing from
desktop to mobile geometry after hydration. All original sizes, offsets and the
750px breakpoint are preserved; neither image gains a transform. Production
changes are limited to the Learn page and its stylesheet. Its content, links,
icons, SVG sources, DOM hierarchy and final layout remain unchanged.

- All 318 tests, 320 article-source checks and the isolated production build
  passed. Targeted ESLint, Stylelint, Prettier and diff checks passed; unrelated
  existing build warnings remain.
- Two new regression tests check stable server/client-environment decoration
  markup and every original size and offset at 320, 390, 750, 751 and 1280px.
  Tests also retain the absence of image transforms and inline wrapper offsets.
- Seven Learn language routes and three initial CSS assets returned HTTP 200.
  Optimized SVG markup matches the prior Community-increment build, and served
  CSS retains all original geometry at the five widths. The existing SEO suite
  passed all 481 HTTP response checks.
- All seven pages' output outside the decorative container matches the previous
  build exactly. Their page props also match, including author/contributor data;
  no contributor block needed to be excluded from this comparison.
- A browser connection attempt timed out before inspection. Visual/resize and
  CLS acceptance remain in the release checklist; these code and HTTP checks
  do not establish a measured performance improvement.

D-16 remains in progress. Wallets is the remaining shared-page caller with the
existing post-hydration decoration switch and is unchanged this round. The
temporary verification server closed after the checks; existing development
servers were untouched. The isolated build is `.next-kb-validation/d16-learn`.
No commit, push, deployment or shared-sheet update was made.

## October 26, 2026 D-16 Wallets initial decoration stability

Wallets' two decorative images now use CSS media queries for their responsive
geometry instead of switching after hydration. All original sizes, offsets and
the 750px breakpoint are preserved. The left image retains its fixed inline
rotation and origin. The right image's mobile flip/rotation order and top-left
origin move into CSS, with its original desktop flip and center origin restored
above the breakpoint. Production changes are limited to the Wallets page and
its stylesheet; content, links, icons, DOM hierarchy and final layout are unchanged.
The existing external SVG sources, empty alt text and loading behavior are retained.

- All 319 tests, 320 article-source checks and the isolated production build
  passed. Targeted Prettier, Stylelint and diff checks passed. ESLint reported
  no errors and the existing unused `title` parameter warning; unrelated
  pre-existing build warnings remain.
- The old Wallets inline-positioning test was replaced with actual-page SSR
  coverage, and a compiled-CSS test was added. They check stable markup at
  320, 390, 750, 751 and 1280px, all original geometry, and both mobile and
  desktop transforms/origins. Repeated CSS width evaluation is not a browser
  resize test. The other five pages' regression coverage remains in place.
- Seven Wallets language routes and three initial CSS assets returned HTTP 200. Served CSS preserves the original geometry at all five widths. Image
  markup matches the retained Learn-increment build except for moving the
  right image's transform from inline style into responsive CSS.
- All seven pages' non-GitHub props and output outside the decorations and
  contributor block match the previous build. External author/contributor data
  differed for all seven versions; fetching and rendering were not changed.
- The SEO suite passed all 481 HTTP response checks. Static SVG acceptance
  passed 19 HTTP checks and verified that all 17 Wallets/Media Kit assets retain
  the pre-externalization geometry, correct response type and immutable cache.
- No browser acceptance was performed this round. Actual mobile/desktop
  appearance, resizing and CLS remain release gates; code and HTTP checks do
  not establish a measured performance improvement.

All six shared-page callers now use first-paint responsive CSS for their
decorations. D-16 remains in progress pending performance/visual acceptance
and the separate third-party script decisions in
[the release checklist](./kb-release-checklist.md). The temporary HTTP server
closed after verification without touching existing development servers.
The isolated build is `.next-kb-validation/d16-wallets`. No commit, push,
deployment or shared-sheet update was made.

## October 26, 2026 D-18 article folder naming checks

This completes the local repository-check portion of
`01_all_Task_List!G22`: enforce the approved naming convention for new articles.
It does not add another migration or change existing article URLs or UI.

- The content repository now has a dependency-free, read-only
  `scripts/check-slugs.mjs`. It scans immediate article folders directly rather
  than relying on a possibly stale catalog. Names must contain lowercase ASCII
  letters and digits separated by single underscores. Translation-only folders
  are checked too; unrelated metadata and tooling folders are not articles.
- Invalid names, empty/missing content roots and unsafe symlink inputs fail
  clearly. The checker never renames files or regenerates metadata. Its CLI
  also works when invoked through a symlinked parent path such as macOS `/tmp`.
- `Check article slugs` runs the checker tests and source check on PRs, pushes
  and manual dispatch, using Node 22 and read-only repository permissions.
  It installs no dependencies and uses no deployment secrets. The existing
  production webhook workflow is unchanged and does not wait for this job.
- The website exposes `kb:check-slugs`; `kb:validate` and `build` now run the
  check before their existing commands. A failing name check stops before the
  article generator. The content README explains the rule, local commands and
  the requirement for approval and redirects before renaming a published URL.

Local verification passed: 213 current article folders, all 331 tests across
44 test files (including 26 new checker/integration tests), and all 320
source/body-hash and route checks. Fixtures cover valid/invalid names, translated
indexes, CLI invocation, symlinks, unchanged file snapshots, and build failure
before generation. Workflow YAML parsing, targeted formatting and diff checks
passed. This tooling-only increment does not change frontend runtime code;
GitHub-hosted CI and a deployed build remain release checks.

The content commit must include the checker before the website references it.
Ship the strict rule with the approved 50-folder migration, not separately
against the old mixed-case content tree. A repository administrator must make
`check-slugs` a required status and review bypass permissions to enforce it on
merges; adding a workflow does not itself block merges or direct pushes.
These gates are recorded in [the release checklist](./kb-release-checklist.md).
No commit, push, deployment, remote settings or shared-sheet update was made.

## October 28, 2026 D-06 article language entry

Implemented the newly confirmed article-only language control from Figma
`fQNfZujKFpRMvLgKVtiIAe`, using the EN/CN toggle components `3359:877` and
`3359:879`, desktop controls `3462:2097`, and mobile navigation `3382:4552`.
The existing article body, typography, images and general layout are unchanged.

- Desktop: the control sits beside Write an article. At the article layout's
  existing 900px breakpoint, it moves to the main header before Menu.
- Only actually published English and Chinese translations appear. A page with
  no Chinese translation shows EN only; selecting EN can reset a prior Chinese
  preference. Existing Spanish article routes and SEO alternates remain intact.
- Explicit choices are stored under `kb-article-language`, independently of
  Next's site locale. Storage failures fall back to a current-tab preference;
  server rendering and the first hydration render do not read browser storage.
- Cards, reading lists, search suggestions, recent/related articles and known
  Nervos article links inside Markdown use the saved language in their actual
  anchor URL. Missing Chinese translations go directly to English without
  overwriting the saved preference. External links remain external.
- Article brand, logo/menu, Discover CKB and footer navigation return to English
  destinations. KB landing pages have no switch. Existing directly addressed
  legacy localized listing routes and the older site's language UI are not
  removed by this article-entry change.

Verification: all 348 tests pass, TypeScript passes, targeted lint/style checks
pass (the existing raw-image fallback warning remains), the isolated production
build succeeds, all 320 content renditions validate, and 481 HTTP/SEO checks pass.
The browser confirmed Chinese article → English KB home without a switch → a
different Chinese article; an English-only article did not erase the preference.
Switch placement was checked at 320px, 375px and 1440px. The inspected browser
console reported no warnings/errors. The build is
`.next-kb-validation/article-language`; final deployment still needs the checks
recorded in the release checklist. No commit, push, deployment or shared-sheet
update was made.

## October 28, 2026 D-17 cover source optimization / D-11 size follow-up

At Sonny's request, optimized the actual cover assets on the local article fork
checkout `EducationHubArticles-cleanup`, branch `feat/kb-metadata-cleanup`, and
synchronized exactly the same replacements into the website's content copy.
This changes image files, not UI components, article text, routes or taxonomy.

- Inventoried 218 unique covers shared by 320 article renditions. Replaced 207
  covers; left 11 unchanged (five already-small files and six whose existing
  encoding was smaller than the proposed resize).
- Total cover bytes: 415,915,312 before, 131,645,795 after (68.35% reduction).
  Every cover is below 1,000,000 bytes; the largest is 999,270 bytes.
- Retained filenames, paths, actual PNG/JPEG formats and image composition.
  No cropping or upscaling. Most resized covers are 1200×675; 36 use widths of
  960–1120px to preserve alpha while meeting the byte budget. PNG palette
  compression is accepted only with identical resized alpha and a bounded
  average RGB difference; representative text, fine-line and colorful covers
  were visually inspected. This is not a claim of lossless resizing or universal
  editorial approval.
- The new manual `scripts/optimize-kb-covers.mjs` prepares candidates and original
  backups first. Applying requires matching source, backup and candidate hashes
  for every target, including the local preview mirror, before the first write.
  It is not a deploy hook and is not a fully transactional multi-file operation.
  The prepared report and recoverable originals are in the parent workspace at
  `work/kb-cover-resize-final.sM8Z7j/manifest.json` and `originals/`.
- Verified all 218 output hashes in both checkouts. All 564 non-cover files in
  the fork and 567 in the website copy retain their pre-operation hashes. This
  preserves existing dirty Markdown, metadata and slug-migration work.

The optimizer's 13 tests cover source selection/path safety, proportional
geometry, small-image idempotence, format and alpha preservation, palette
acceptance/rejection, backups and all-target preflight failures. Related image,
card and sharing-URL tests pass, as do the 320 content-hash/route checks.

Scope remains partial D-17: inline article images/GIFs were not optimized.
For D-11 the article cover byte budget is met, but exact 1200×630 output is not:
forcing that ratio would change visible article heroes. A separate share-image
derivative remains the safe follow-up if that exact size is required. Final
deployment must include the article commit and refresh cached image derivatives
and social previews as necessary. No commit, push, deployment or shared-sheet
update was made.

## October 29, 2026 D-08 approved description import

Imported the 91 written English descriptions from content worklist
`02_Meta_Descriptions`, rows 5–95, into the matching English frontmatter in
both local article checkouts. Matching uses the supplied source URL and the
existing approved slug mapping (17 matches use a previously approved rename).
This increment does not authorize or add another URL migration.

- Only the new `description` line was added to each selected Markdown file.
  Original titles, subtitles, dates, bodies, paths and LF/CRLF line endings are
  preserved byte-for-byte after removing that line. The other 229 Markdown
  files, including every translation, remain unchanged.
- Regenerated and checked both catalogs. The import provenance is recorded in
  content `metadata/description-import.json`, including the workbook SHA-256,
  sheet/row, source URL, approved mapping and preservation hashes.
- `scripts/check-kb-description-import.mjs` is an explicit one-time acceptance
  check, not a build/CI gate: later legitimate article edits may invalidate its
  snapshot hashes. Existing generic description tests remain the ongoing gate.
- All 91 actual production-mode HTTP responses have matching description,
  Open Graph and Twitter copy. This does not fill all remaining editorial copy:
  122 other English articles still use their subtitle, and 37 translations
  (19 Chinese, 18 Spanish) have neither a dedicated description nor a subtitle.
  English copy was not copied onto those translated URLs.

The source workbook and its Uploaded column were not edited. Local import and
HTTP verification are not a claim of publication. Both article commits, the
website's pinned content version and deployed metadata still need coordinated
delivery.

The final whole-website regression run passes all 345 tests. D-18's historical
preservation check now verifies the exact workbook/import fingerprint before
excluding only these approved descriptions for comparison; generated inventories
are compared in their former source order. Its original metadata, taxonomy,
featured and reconciliation expected hashes are unchanged. Negative tests still
reject unapproved copy, other fields and editorial reordering. Actual catalog
order and runtime data are not changed by this test normalization.

## October 29, 2026 D-12 basic structured data

At Sonny's explicit approval, added head-only JSON-LD: Organization and WebSite
on the existing homepage; Article and BreadcrumbList on published article
renditions. No visible UI, typography, body, title or language control changed.

- Organization details come from handoff tab 13. Unconfirmed contact details
  are omitted. Article publisher is a self-contained Organization with the same
  stable ID, name and URL; no author type is inferred from display-name strings.
- Article title, image, publication date, actual language and canonical come
  from existing content. D-08 description wins over the same-language subtitle.
  No deployment timestamp is substituted for `dateModified`.
- Real Hub paths form the middle breadcrumb where available: 248 renditions
  have three items and 72 have KB → article. Categories are not inserted into
  article addresses.
- JSON-LD escapes HTML delimiters, ampersands and Unicode line separators.
  Tests include a malicious `</script>` value. The client head renderer does
  not import the article catalog or server filesystem modules.
- All 320 actual article renditions were rendered in tests; removing only the
  added script leaves their rendered HTML unchanged. An isolated normal
  production build also passed 387 HTTP checks: 320 articles, eight homepage
  variants, 44 non-article pages, six 404s and nine redirects, with zero failures.

This is the approved basic subset, not full D-12 closure. FAQPage, verified
author identities, modification dates and missing contact details are not
invented. External Google/schema validation and deployed checks remain release
tasks. Neither shared statuses nor production have been changed.

## October 29, 2026 D-16 browser performance acceptance — not passed

Created a fresh normal production-mode build with the D-08/D-12 changes:
`NEXT_DIST_DIR=.next-kb-validation/d08-d12-d16-20261029 SKIP_ENV_VALIDATION=true pnpm build`.
Build ID: `he5vAMV3hORwIjIpLPIgh`. Served only for local validation on port 3002,
without disturbing the user's port 3001 development server.

Used the actual Chrome DevTools Lighthouse panel in a separate incognito
window: Lighthouse 13.5.0 / Chrome 156, Navigation, Mobile Moto G Power,
simulated Slow 4G, CPU ×4, storage reset, Performance category. No headless
browser or old build was substituted. These are individual laboratory samples,
not medians or real-user Web Vitals. The handoff references Lighthouse 13.4,
so this is not a strict same-version comparison to its earlier baseline.

| Route                               | Performance | LCP (seconds) | CLS | TBT (ms) | Acceptance         |
| ----------------------------------- | ----------: | ------------: | --: | -------: | ------------------ |
| `/`                                 |          86 |         3.549 |   0 |      7.5 | LCP fails          |
| `/ckbpage`                          |          92 |         3.321 |   0 |       54 | LCP fails          |
| `/knowledge-base`                   |          75 |        10.364 |   0 |       10 | Score and LCP fail |
| `/knowledge-base/what_is_secp256r1` |          83 |         4.744 |   0 |       33 | Score and LCP fail |
| `/mining`                           |          92 |         3.317 |   0 |       48 | LCP fails          |

Targets are performance ≥85, LCP <2.5 seconds and CLS <0.1. All five samples
meet the CLS target, but none meet LCP. INP was not measured; TBT is not INP.
The first KB diagnostic run overlapped a content check and was excluded;
the table uses the independent KB run 2. No report has a Lighthouse runtime
error or run warning. Do not mark D-16 complete based on these scores.

Main findings, without changing UI or deleting existing behavior:

- KB's LCP is the Start Here guide-card CSS background,
  `/images/knowledge-hub/guide-background.jpg`: 2400×680, 1,314,053 source bytes,
  about 70% of the page's measured transfer. Lighthouse estimates roughly 1MB
  avoidable image bytes and flags CSS discovery / missing priority. A follow-up
  can assess equivalent image delivery while preserving the existing geometry,
  center/cover crop and appearance. Estimated savings are not measured gains.
- Home and CKB have text LCP elements, not images. Render-blocking CSS, shared
  fonts and unused/early JS are follow-up leads, not proof that one particular
  animation caused all delay. Do not remove animation to improve a score.
- The article hero optimization is active: discoverable in HTML, preloaded,
  high priority, non-lazy, and served as a 750px AVIF of 9,729 resource bytes
  (10,289 transferred). It is not transmitting the original large cover.
  Two below-fold Discover CSS backgrounds still transfer about 615KB early;
  optimizing those may reduce bytes, but the report estimates no direct LCP
  saving for them. The article's 4.744s LCP still needs targeted investigation.
- Lighthouse's unthrottled observed-LCP breakdown and its simulated scoring
  LCP are different measurements. Their individual timings must not be mixed.
- Home's existing local live-metrics endpoint still returns an error/loading;
  it is an already identified difference from the online site, not a new fix
  in this increment.

Environment limits: `NEXT_PUBLIC_VERCEL_ENV` and both GA property overrides
were unset; actual HTML confirms no production GA, Umami or Twitter loaders
and no development/react-refresh scripts. This avoids polluting production
analytics but does not measure production third-party scripts. Local HTTP,
machine speed and caches also differ from a deployed HTTPS/CDN environment.
No UI/CSS/animation change was made as part of this performance acceptance.

Raw Lighthouse JSON and screenshots, the 387-request D-08/D-12 HTTP report,
and build/profile evidence are retained in the parent workspace directory
`work/d08-d12-d16-acceptance.8EsRZl/`. Report inputs are
`home-mobile-run1.json`, `ckb-mobile-run1.json`, `kb-mobile-run2.json`,
`article-mobile-run1.json` and `mining-mobile-run1.json`.
The temporary Chrome windows/tabs were closed and the original article tab
and its 110% zoom restored. The port 3002 validation server was stopped;
the user's original port 3001 process remains running and returns HTTP 200.
Production/deployed acceptance remains pending.

## October 29, 2026 D-16 / D-17 KB guide background delivery

At Sonny's approval, implemented only the first follow-up: the KB homepage
Start Here background. The article Discover backgrounds, shared font/prefetch
work and standalone article-fork tooling remain separate next steps.

- Retained the original 2400×680 JPEG and its SHA-256 unchanged. Added a
  275,237-byte AVIF (quality 65, 4:4:4) and a 495,382-byte WebP (quality 90),
  also 2400×680 with explicit sRGB ICC. Neither is cropped or resized.
  Encoding is lossy, not a claim of identical pixels. The source was
  1,314,053 bytes, so the preferred AVIF reduces image bytes by about 79%.
- Kept the existing CSS background, color, center/cover crop, clipping and
  stacking. A typed AVIF → WebP → JPEG `image-set` chooses the format;
  browsers without that syntax retain the original JPEG declaration.
- Added one typed high-priority AVIF preload in Home's existing Head, matching
  the exact CSS URL. It does not preload both modern formats or affect a shared
  layout. The lowercase native `fetchpriority` output is compatible with the
  project's React 18 renderer without adding an unknown-property warning.
- Did not change GuideLife, its random cells, timing, breakpoints, hierarchy,
  button, copy or existing layout values. The source and derived-asset evidence
  is in `scripts/fixtures/kb-guide-background-assets.json`.

Verification so far: all 350 website tests pass, the isolated normal production
build succeeds, and targeted lint/style/format checks pass. Actual HTTP
comparison against the previous production-mode build finds byte-identical
visible main HTML and byte-identical compiled page CSS after removing only the
new background-image candidate declarations. All three assets return correct
image MIME types and exact hashes. Five unrelated routes do not preload this
image. The before/after builds are `he5vAMV3hORwIjIpLPIgh` and
`WYsB5Ff-IFgfYAgxVuSh0`.

Chrome browser comparison covers 320, 390, 750, 950, 951 and 1440px, including
the unchanged animation visibility breakpoint. Screenshot viewport extents
match, and manual inspection found no layout/crop change; the generated mobile
side-by-side shows before on the left and after on the right. Screenshot
channel differences are not an accessibility or universal perceptual-quality
guarantee. Take the guide still navigates to the original Start Here page and
Back returns to KB Home.

Chrome DevTools Lighthouse 13.5 mobile Navigation, Moto G Power, simulated
Slow 4G and 4× CPU, with no concurrent build/test/HTTP workload:

| Metric                  | Fresh baseline | Optimized run 1 | Optimized run 2 |
| ----------------------- | -------------- | --------------- | --------------- |
| Performance             | 75             | 81              | 81              |
| Simulated LCP           | 10.139s        | 5.109s          | 5.111s          |
| TBT                     | 12ms           | 8ms             | 10ms            |
| CLS                     | 0              | 0               | 0               |
| Total transferred bytes | 1,869,645      | 831,139         | 831,139         |

All three reports have identical `configSettings`, no runtime error and no run
warning. These are individual samples, not medians. Both optimized reports
request only the AVIF background: HTTP 200, image/avif, High priority,
`isLinkPreload: true`, 275,237 resource bytes / 275,751 transferred bytes, and
no cached response. Neither also downloads the JPEG or WebP. LCP discovery's
three checks pass. The LCP element remains the same guide banner and its
reported rectangle remains top 384 / left 20 / 372×383. The original request
was 1,314,053 resource bytes / 1,314,569 transferred bytes.

This demonstrates about 79% less background resource data, 55.5% less page
transfer and roughly halved simulated LCP for this profile. **D-16 is still
in progress:** both 81-point scores remain below 85, and LCP remains above
2.5 seconds. INP was not measured; TBT is not INP. Do not conflate the simulated
LCP with unthrottled observed LCP or claim a five-second local wall-clock gain.
Production analytics loaders were absent, so deployed third-party scripts,
HTTPS/CDN, supported-browser behavior and real-user metrics still need separate
acceptance. Further font/shared-JS investigation is a separate increment;
do not lower image quality or change UI merely to reach a score.

Release both hashed assets together with their CSS/preload references and
verify their final HTTP MIME types and bodies. `image-set` is format selection,
not a reliable fallback after a selected asset returns 404. Modern Chrome's
single-request result does not prove the same behavior in legacy browsers:
an AVIF-capable browser without typed `image-set` support may preload the AVIF
but use the original JPEG declaration. Keep the original JPEG available.
The single-format preload follows the guidance in
[MDN's preload reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/rel/preload);
see also [Chrome's decorative-image guidance](https://developer.chrome.com/docs/modern-web-guidance/guides/performance/deliver-optimized-decorative-images).

Evidence is retained in the parent workspace `work/d16-guide-image.UKvEAn/`,
including original/candidate assets, encoding settings, HTTP results, six
before/after screenshot pairs, visual comparison results and the raw reports
`baseline-mobile.json`, `after-mobile-run1.json` and `after-mobile-run2.json`.
No commit, push, deployment, shared-sheet edit or original-asset deletion was
performed.
The temporary incognito validation window was closed, restoring the user's
original Chinese article and 110% zoom. Both temporary production servers
(ports 3002 and 3003) were stopped; the original port 3001 process remains
running, and a direct no-proxy request to its KB homepage returns HTTP 200.

## October 29, 2026 D-16 / D-17 article Discover background delivery

This next approved increment changes only the two image-delivery declarations
in `article-v2.module.scss`, with four hashed derived assets. Shared,
ContentArticle, Article and GuideLife components are unchanged in this
increment; no preload, script, animation or new wrapper is added. Original
center/cover positioning, colors, dimensions, clipping, stacking, breakpoints,
copy, CTA destinations and analytics remain unchanged.

| Background    | Original JPEG | Preferred AVIF | WebP fallback | Dimensions retained |
| ------------- | ------------- | -------------- | ------------- | ------------------- |
| Bottom banner | 351,298 B     | 92,567 B       | 126,210 B     | 1380×344            |
| Sidebar card  | 262,624 B     | 63,308 B       | 87,340 B      | 612×578             |

Combined AVIF source bytes are 155,875 instead of 613,922, about 74.6% less.
The AVIFs use quality 75, effort 6 and 4:4:4; WebPs use quality 90 and effort 6.
Both retain explicit sRGB ICC, with no resize or crop. This is lossy encoding,
not pixel identity. Original JPEGs are retained byte-identically for older
browsers. Provenance, source/output hashes, sizes and decoded-pixel difference
measurements are in `scripts/fixtures/kb-discover-background-assets.json`.

The page template and complete compiled CSS were compared over actual HTTP
for an English article, a Chinese article and KB Home. All visible main HTML
is byte-identical; CSS is identical after removing only the new Discover
image-set declarations. No Discover preload exists. Six image responses
(two original, four derived) return HTTP 200 with exact hashes, sizes and MIME
types. Baseline build is `WYsB5Ff-IFgfYAgxVuSh0`; optimized build is
`Vg4HNSfnk9w495qHfEPeM`. Production build, stylelint/format checks and all
369 tests from 54 test files pass, including five new Discover regressions.

Browser screenshot pairs cover 320, 390, 900, 901 and 1440 CSS-pixel widths,
both bottom and sidebar variants. Discover CKB still navigates to Start Here;
the browser Back button returns to the article. Manual inspection of the
mobile and desktop comparisons found the original texture, crop and layout
preserved. Native Chrome Find was used to reach both banners: its text
selection and scroll offsets can differ between captures, and GuideLife cells
are intentionally random. The viewport extents match, but these are visual
comparisons, not a pixel-identity assertion or an animation-timing measurement.

Actual Chrome DevTools Lighthouse 13.5 mobile Navigation, Moto G Power,
simulated Slow 4G and 4× CPU, without concurrent build/test/HTTP workloads:

| Metric                  | Fresh baseline | Optimized run 1 | Optimized run 2 |
| ----------------------- | -------------- | --------------- | --------------- |
| Performance             | 82             | 82              | 82              |
| Simulated LCP           | 4.822s         | 4.823s          | 4.823s          |
| TBT                     | 32ms           | 35ms            | 29ms            |
| CLS                     | 0              | 0               | 0               |
| Total transferred bytes | 1,394,849      | 937,050         | 937,051         |

All three `configSettings` match exactly; no runtime errors, run warnings,
audit errors or HTTP ≥400 requests occur. Both optimized runs fetch each
Discover AVIF exactly once, with correct image/avif MIME, HTTP 200, Low priority
and no cached response; no JPEG/WebP double download or preload occurs.
Combined image transfer drops from 614,950 to 156,900 bytes, about 74.5%; page
transfer drops about 32.8%. **LCP and performance score do not improve:** the
<2ms difference is not meaningful. This increment reduces image delivery bytes,
not a claim of improved first paint, interaction latency or D-16 completion.
The article remains below the ≥85 performance target and above the <2.5s LCP
target. INP was not measured; TBT is not INP. These are individual samples, not
medians. The analytics-safe local production-mode build has no GA / Umami /
Twitter loaders; deployed scripts, HTTPS/CDN, other supported browsers and
real-user behavior require separate acceptance.

Deploy the four hashed resources and their CSS references together, retain
the source JPEGs, and verify the final MIME types and response bodies.
`image-set` is format selection, not a guarantee of fallback if the selected
resource returns 404. Safari / Firefox and deployed high-DPI quality still
need release verification; modern Chrome's single-format result is not a
universal compatibility claim.

Evidence directory in the parent workspace is `work/d16-discover-image.XXhsdP/`.
No commit, push, deployment, shared-sheet edit, article content change or
original-asset deletion is included in this increment.
Final cleanup closed only this increment's incognito window and stopped its
port 3002 / 3003 servers. The original Chinese article and 110% browser zoom
were restored. The user's original port 3001 process remains running and a
direct no-proxy article request returns HTTP 200. An additional unselected-text
mobile screenshot confirms normal white banner titles; Find selection in the
comparison captures is a browser artifact, not a stylesheet change.

## October 29, 2026 D-18 standalone article-fork tooling sync

Completed the missing local tooling sync to the independent content checkout,
`../EducationHubArticles-cleanup`, branch `feat/kb-metadata-cleanup`, remote
`HappySonnyDev/EducationHubArticles`. The website's article submodule already
contained this tooling; the independent checkout did not. Added byte-identical
copies of `scripts/check-slugs.mjs`, `scripts/check-slugs.test.mjs` and
`.github/workflows/check-slugs.yml`. Updated only the root README's folder-name
rule and appended the checker commands and rollout requirements.

Validation:

- Independent-fork checker passes for all 213 local article directories.
- Its 23 checker tests pass, plus all three website build-hook integration
  tests. YAML parses and contains the expected PR/push/manual triggers,
  Node 22, `contents: read`, two local Node commands and no deployment secrets.
- All three synced files are byte-identical to the website's submodule copy;
  formatting checks use the source project's explicit Prettier config.
- The complete 782-file set outside the four scoped tool/README files retains
  the same paths, modes and SHA-256 aggregate before and after. This includes
  article Markdown, images, metadata and the original deployment workflow.
  Aggregate is `d9b1f79db0161e4c0565be9af59cc8b97d1697b620f5b2750497d69fe7210e24`;
  `deploy.yaml` hash remains
  `4df4187a58e7612426a295e15a6a4a02f7ffd9888e4201ce4837f72489082948`.
- Scoped diff/format checks pass. Existing article whitespace/CRLF warnings in
  the already-dirty fork are outside this change and were not rewritten.

This does not rename articles, modify content, change the UI, stage files,
commit, push or run hosted CI. The committed HEAD still has 50 nonconforming
names among 213 article directories; the local working tree's approved
migrations have not been committed. Therefore a local pass is not proof that
a fresh checkout or hosted CI passes. Deliver the checker together with the
approved migration and coordinate the corresponding website redirects/content
pointer. Do not merge this strict checker alone onto the unmigrated main tree.

The existing production webhook workflow remains independent; the new check
does not automatically delay or cancel deployment. A repository administrator
still needs to require `check-slugs` before merge and review bypass permissions.
The release checklist retains these gates. No new browser/build acceptance is
claimed for this tooling-only increment; website runtime and port 3001 were
not changed or restarted.

## October 29, 2026 D-16 KB Logo prefetch experiment — rejected and reverted

Investigated a confirmed cross-route loading path before changing fonts. The
KB Header's visible Logo points to the official homepage; Next's viewport
prefetch pulls homepage-only JavaScript absent from the KB/Article initial
route manifest. These are the homepage's Swiper / interaction dependencies
and page implementation, not missing KB dependencies. All five font weights
and their existing display/loading behavior were deliberately left unchanged.

Tested only `prefetch={variant === 'knowledgeHub' ? false : undefined}` on
the Logo Link. Installed Next 14.2.23 Pages Router code confirms this disables
automatic visibility prefetch while retaining intent-based hover/touch
prefetch and click navigation; ordinary headers retain their default. Fonts,
game startup/animation, tRPC and all visible templates/styles were unchanged.
An on-demand destination fetch would be a navigation tradeoff, not a free gain.

The candidate built successfully; 374 tests in 55 files passed without React
warnings, including five Header regressions and 24 render-equivalence cases.
Six actual production-mode routes (KB Home, English/Chinese articles, Start
Here, Hub and archive) retained byte-identical visible main HTML, compiled CSS
and five font preload links; actual font response bodies were identical.
Baseline build is `Vg4HNSfnk9w495qHfEPeM`; rejected candidate build is
`-iIHvHGpALaiOAC8IdrnW` in `.next-kb-validation/d16-kb-prefetch-20261029`.
The HTTP report and 390/1440px KB/article screenshots are retained as experiment
evidence, not release approval or completed homepage navigation acceptance.

Actual Chrome DevTools Lighthouse 13.5 mobile Navigation, Moto G Power,
simulated Slow 4G and 4× CPU, with builds/tests/HTTP validation finished before
measurement. All seven reports have identical configSettings, no runtime error
or run warning. All samples, including the unfavorable ones, are retained:

| Page / sample       | Score | FCP    | Simulated LCP | TBT     | CLS | Transferred bytes |
| ------------------- | ----- | ------ | ------------- | ------- | --- | ----------------- |
| KB baseline 1       | 81    | 1.060s | 5.110s        | 8ms     | 0   | 750,582           |
| KB candidate 1      | 73    | 1.061s | 5.111s        | 343.3ms | 0   | 673,674           |
| KB baseline 2       | 81    | 1.057s | 5.107s        | 10ms    | 0   | 750,582           |
| Article baseline 1  | 84    | 1.211s | 4.452s        | 31ms    | 0   | 839,685           |
| Article candidate 1 | 78    | 2.673s | 4.905s        | 63ms    | 0   | 762,773           |
| Article baseline 2  | 83    | 1.208s | 4.745s        | 33ms    | 0   | 839,685           |
| Article candidate 2 | 71    | 1.210s | 4.751s        | 464.9ms | 0   | 762,776           |

Request reduction was real: all three candidate runs eliminated eight homepage
requests and about 76.9KB transfer. For this Chrome profile the repeated script
records are disk-cache hits with zero transferred bytes: do not count them
twice or reuse another profile's 139KB estimate. Initial JS parse/evaluation
also declined in the KB sample, but the candidate repeatedly measured higher
blocking time. Unattributable long tasks are prominent; these JSON reports do
not fully identify their origin or prove a specific causal mechanism. The
observed unthrottled paint and simulated LCP are different measurements.

**Rejected this candidate and restored the original behavior.** Fewer bytes
alone do not justify claiming a performance improvement or retaining a failed
candidate. The Logo prop, its experimental test and temporary test-double
adjustment were removed/restored. Header, App, ConwayGameOfLife and GuideLife
match this increment's pre-change snapshots byte-for-byte; no production or
permanent test-code change remains from this experiment. After restoration all
369 tests in 54 files pass with no warnings. The candidate test is preserved
only in the evidence folder for investigation.

D-16 is still in progress. Further work should profile the long tasks with
trace evidence and controlled repeated comparisons before retrying this or
another loading policy; do not change fonts, remove features or alter UI to
chase a score. Samples are not medians, TBT is not INP, and the analytics-safe
local production-mode builds omit production GA / Umami / Twitter. Production
scripts, CDN/HTTPS and real-user acceptance remain separate release gates.

Evidence is retained in the parent workspace `work/d16-kb-prefetch.6PsfF0/`,
including all seven Lighthouse JSON reports/screenshots, candidate and original
sources, the HTTP report and viewport captures. No commit, push, deployment,
shared-sheet change or content/URL migration occurred.
After restoration, all four source snapshots compare byte-identically. The
temporary servers on ports 3002/3003 were stopped, the incognito validation
window was closed, and the original Chrome window was restored. Audit-category
preferences, device toolbar and Lighthouse settings visibility were returned
to their initial states. The user's original port 3001 process remains running
and the direct no-proxy KB homepage request returns HTTP 200.

## October 29, 2026 development-branch delivery

At Sonny's explicit request, committed and pushed the approved content changes
to `HappySonnyDev/EducationHubArticles`, branch `feat/kb-metadata-cleanup`,
commit `1a621879f26c8aaa30ed787bd3894f12b9c4575a`. This includes the 50 approved
folder migrations, updated links/catalog, 91 approved descriptions, optimized
covers, naming checker, tests and workflow. Previously merged upstream link
fixes are retained; deferred PR #320 is not in this branch's new history.

Before committing, removed only the approved old path entries from the Git
index (not the working files), then staged the actual lowercase directory
names. Verified every indexed path and Git blob against the reviewed files:
786 files, 213 article folders, 320 language versions and all 50 mapped
destinations. Both content checkouts have identical file paths and bytes,
including the README rollout notes. The website submodule now points at the
same exact content commit rather than relying on dirty local content.

The independent checker and its 23 tests pass. Website validation includes all
369 tests, TypeScript and content/hash checks. Minimal lint corrections in
test doubles and validation scripts preserve their behavior; runtime and UI
are not changed as part of those corrections. The standard commit hook also
checks/formats staged source files. Existing article Markdown whitespace and
line endings are retained rather than rewritten for cosmetic cleanup.

This is development-branch delivery, not production acceptance. No main
branch merge, manual production deployment, Search Console/Bing submission,
real IndexNow ping or shared-sheet update is part of this request. Hosted CI,
production configuration and outstanding performance/image/SEO acceptance
remain release gates in `docs/kb-release-checklist.md`.
