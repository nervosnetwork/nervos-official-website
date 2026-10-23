# Homepage Most read

The homepage's existing four-card layout now uses a reviewed GA4 snapshot, not
the previous one-article-per-Hub editorial fallback. Hub cards, article routes,
Start Here and More from CKB are unchanged.

## Snapshot and scope

- Source: **nervos.org - GA4**, property `415662865`, account `127036856`.
  The live site's measurement ID is `G-WVH440CNZ3`. The newer property
  `545722131` is not the source for this ranking.
- Period: **2025-09-28 through 2026-09-27**, inclusive; exported 2026-09-28.
  This is the past 12 months, not calendar-year-to-date. At the user's request,
  the heading follows the design copy **Most read this year**; this copy change
  does not change the snapshot period. The heading tooltip records the exact dates.
- Metric: **Views**, not unique readers, likes, completed reads or engagement.
- Export: Pages and screens, Page title and screen class + Page path and screen
  class; all 2,550 rows, totaling 95,087 site-wide Views. This site-wide total
  is not the KB total.
- Export SHA-256:
  `4362a5d474ebb532456c3c74f26a37b43763de151463d164a1f6e2558c4d8356`.
  Raw analytics exports are not committed or served to browsers.

Article paths were reconciled against the current catalog. Historical path
variants were associated only with a unique matching article title; equivalent
locale paths were then grouped under the same article identity. The aggregation
includes localized and English-fallback URLs. It excludes 404 titles, the KB
homepage, lists and non-article pages. Unresolved paths were reviewed separately;
they do not displace the verified top ten. This is analytics reconciliation
only: it does **not** add redirects, normalize public slugs or change canonical
article addresses.

The first four global article identities are:

| Rank | Article                                                      | Views |
| ---- | ------------------------------------------------------------ | ----: |
| 1    | Unbreakable SHA-256: Why Even Quantum Computers Cannot Do It | 1,852 |
| 2    | What is Block Time in Blockchain? A Complete Guide           | 1,820 |
| 3    | What is Secp256k1? Cryptocurrency’s Key Elliptic Curve       | 1,651 |
| 4    | ZK-Rollups vs. Optimistic Rollups: What’s The Difference?    | 1,438 |

These totals differ from a title-only report because the latter splits title
variants/translations. The snapshot stores the verified top ten so a localized
homepage can select up to four articles with real translations. Localized homepages
use the **global ranking**, not a separately claimed per-language ranking.
Articles absent from the locale catalog or excluded from recommendations are
skipped. No synthetic popularity counts are added. The page receives articles
and the date range, not raw GA counts. Existing analytics placement identifiers
`recommended_reading` and `home_recommended` are retained for continuity.

## Refresh and archive behavior

The snapshot in `src/server/kb-most-read.ts` is deliberately manual. Deploying
again does not fetch GA or move the date range forward. Before refreshing,
export the same report for the new agreed period, recheck aliases/404s, review
the ranking and update the snapshot, dates and regression tests together.
Automated GA API refresh is not implemented in this change.

**See all articles** still opens `/knowledge-base/articles`, sorted by
publication date descending, 24 articles per page, with article ID as a stable
tie-breaker. In its existing Filter menu, Latest to oldest is active; Most
popular and Must reads remain disabled. No archive sort UI has been changed.
