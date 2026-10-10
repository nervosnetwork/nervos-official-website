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
