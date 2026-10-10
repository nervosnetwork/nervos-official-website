# Knowledge Base responsive review

The mobile layout adapts the approved desktop visual language; no mobile Figma
frame was supplied. Content selection, classifications, subscription behavior,
and canonical article paths are unchanged.

## Pages

- `/knowledge-base`: responsive hero, Hub cards, recommendations, search suggestions and
  newsletter. Narrow phones stack the email field and its action.
- `/knowledge-base/start-here`: horizontally scrollable step cards and compact sticky Steps
  rail. Anchor offsets use its measured height; the current step stays visible.
- `/knowledge-base/topic?hub=…`: swipeable Subjects, non-sticky mobile topic description,
  touch-sized Filter menu and responsive article cards.
- `/knowledge-base/articles`: responsive grid, article count and wrapping pagination.
- `/knowledge-base/search?q=…`: usable search field, grid/list views and pagination.
- `/knowledge-base/<original-slug>`: single reading column at 900px and below,
  dropdown contents, 16px body text, contained code/tables, stacked related
  articles and sidebar content. Duplicate article preview routes have been removed.
- Shared KB header/footer: bounded scrollable mobile menu, wrapping navigation,
  touch-sized controls, email field and social links.

## Responsive rules

- Article grids use two columns at 1024px and below, one at 540px and below.
  The desktop 3–5-column density control is hidden where it does not apply;
  Filter remains available.
- Steps and Subjects use mobile carousel layouts at 750px and below.
- Existing desktop rules remain in place above the responsive breakpoints.

## Verification

- Browser viewport checks at 320, 360, 390, 768 and 1440px.
- At 360px, Home, Hub, archive, search and article text/form regions stay inside
  the viewport. Intentional horizontal scrolling is confined to navigation and
  wide article content.
- Checked search suggestions and list/grid switching, Subject selection,
  Filter menu, next-page navigation, mobile menu bottom links and footer.
- Step navigation uses measured sticky-rail offsets; the guide now ends at
  Step 4 after the requested removal of "Try it & build". Article contents
  selection lands below its sticky navigation.
- Desktop article keeps its 690px + 306px columns, 14px body and desktop TOC.
- TypeScript, stylesheet lint, component tests and content/URL validation run
  independently of viewport inspection.

Viewport testing is not a physical iOS/Android device test. A final real-device
pass (virtual keyboard, Safari safe areas and touch scrolling) is still useful
before release. Newsletter submission remains the existing preview behavior.
