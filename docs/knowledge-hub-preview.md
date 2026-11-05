# Knowledge Hub static preview (historical)

> This document records the original static design review. Its `/kb` URLs are
> retired: the current implementation uses `/knowledge-base` and the existing
> article URLs. Static article/style-guide and duplicate article preview routes
> have been removed. See `kb-data-integration.md` for current behavior.

Branch: `feat/knowledge-base-redesign`, based on updated `origin/main` (upstream has no master branch).

Preview: http://localhost:3001/kb
Routes: `/kb`, `/kb/topic`, `/kb/start-here`, `/kb/style-guide`.
`/kb/article` now implements the finished article design (22:2582), using the new style foundation and shared horizontal ArticleCard.
All preview pages are English-only and marked noindex/nofollow. Production article routes, content loading, analytics, dependencies and lockfile are unchanged.

## Current Figma revision

Source: https://www.figma.com/design/fQNfZujKFpRMvLgKVtiIAe/Knowledge-Base-Hub

Use the **Updated screens** section, not the Original section.

| Reference                                | Node    |
| ---------------------------------------- | ------- |
| Color palette                            | 3:3254  |
| Typography                               | 3:3351  |
| Topic Hub Card                           | 20:147  |
| Subject Card variants                    | 35:754  |
| Step Section                             | 27:500  |
| Article Card (horizontal component only) | 56:778  |
| Homepage                                 | 3:3509  |
| Topic                                    | 22:1794 |
| Start Here                               | 22:1179 |
| Article detail                           | 22:2582 |

Full design contexts and component screenshots were read before implementation. The Figma design-to-code workflow informed token values, typography, component variants, section geometry and spacing. Where guide labels conflict with actual styles (Display sample says 56 but sample renders 42; Body 1 label says Regular while components use Medium), the named style and updated screen/component context take precedence.

## Foundation and components

- `_tokens.scss`: scoped semantic colors, neutral ramp, typography mixins, radius and shadow.
- `Components.tsx`: SubjectCard (icon/step, selected/unselected), ReadingList, HubCard, StepSection, CardMeta, ArticleCard (small/medium/large/horizontal).
- `Icon.tsx`: shared renderer for exact previously exported matching Figma glyph assets.
- `KnowledgeFooter.tsx`: updated footer, reusing repository logo/social icons; isolated from the original site footer.
- `home-v2.module.scss`, `pages-v2.module.scss`, and `article-v2.module.scss`: updated screen styles layered over the legacy base modules.
- `/kb/style-guide`: live color, type and component examples, including selectable subject variants.

Next.js Pages router, React, existing Articulat CF and SCSS modules remain in use. No new runtime dependencies or frontend framework changes.

## Design changes

- Home: Display 56px, H1 40px, H2 32px; 396px Hub cards with 32px grid gaps; purple-tinted neutrals; updated CTA and footer.
- Topic: 40px heading; 116px shared Subject cards; 4/5/5/3 mixed card rows with 16px gaps. Card sizes are 288×312, approximately 227×249 and 389×423.
- Start Here: shared step navigation and four Step Sections, dividing line, updated type/spacing and related Hub links. The fifth "Try it & build" step was removed at the user's request.
- Removed the old bottom Back/Keep reading controls from Topic and Start Here because they are absent in the updated screens.

## Preview assumptions and limitations

- Hero artwork and article images remain placeholders, as previously requested.
- Counts, dates, article titles, Most read data and content associations remain fixtures, not GA or cleaned article data.
- Clicking article titles opens the updated static Article preview, not a real article body.
- Other Hub headings/descriptions reuse Scalability subject/article examples. Subject filtering, search and density controls remain local demonstration behavior, not approved production rules.
- Topic has 17 fixtures; the slider shows uniform 3–5 columns and the grid icon restores the Figma mixed layout.
- Go deeper now uses Stefan's eight approved articles across the four remaining steps; see [data integration](./kb-data-integration.md).
- Figma's first Hub instance repeats the Quantum description; the implementation retains the Cryptography description from its base component.
- The two KB newsletter forms now use the existing SendGrid signup and shared list; see [newsletter integration](./kb-newsletter-integration.md). Initial layouts are unchanged, with validation, pending, accepted-request and error feedback. The original preview-only behavior described here is retired.
- Article uses the new footer, 690px body / 306px sidebar, updated typography, purple token diagram, directory active marker, two Discover CTAs and shared related-article cards. Like remains disabled with an explicit sample-count note; sharing/categories provide preview-only feedback.
- Mobile layout is responsive implementation judgment; no mobile Figma frames were supplied.
- Articulat Light/Thin are not in the repository's font assets; step-number Light falls back to the closest available font weight. No unlicensed font files were fetched.
- This is a static review draft. Full image-based pixel-diff certification and real-data integration remain outstanding.

## Local development

```sh
node .yarn/releases/yarn-3.8.6.cjs install --immutable
SKIP_ENV_VALIDATION=1 node .yarn/releases/yarn-3.8.6.cjs dev -p 3001
```

Skip environment validation only for the local static preview. The old 3000 server returned 503, so this task uses 3001.

## Verification

- Targeted ESLint passes for KnowledgeHub components and KB routes.
- Global TypeScript check reports only the three pre-existing errors in `src/database/articles/index.ts` (ungenerated empty article list); production build not claimed.
- Three revised pages and the style/component gallery render successfully.
- Desktop screenshot inspection and DOM geometry checks at 1440px: homepage heading 56px, Hub cards 396px, topic section starts at y767; Topic toolbar starts y553 and all three card size variants match the design dimensions.
- Topic search empty state/reset, Subject filtering and slider 4→5 work.
- Mobile 390px: homepage, Topic, Start Here and gallery have no horizontal document overflow; step 3 scrolls and selects correctly.
- Article desktop (1440px) and mobile (390px) render without horizontal document overflow; directory clicks select the target section. Original legacy style modules remain unchanged.

Next: team design review, real artwork, cleaned metadata, approved interactions and production content/SEO integration.
