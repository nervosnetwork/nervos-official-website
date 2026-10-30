/* eslint-disable @typescript-eslint/no-var-requires */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const page = fs.readFileSync(path.join(__dirname, 'StartHere.tsx'), 'utf8')
const pageStyles = fs.readFileSync(path.join(__dirname, 'pages-v2.module.scss'), 'utf8')
const components = fs.readFileSync(path.join(__dirname, 'Components.tsx'), 'utf8')
const componentStyles = fs.readFileSync(path.join(__dirname, 'components.module.scss'), 'utf8')
const shared = fs.readFileSync(path.join(__dirname, 'Shared.tsx'), 'utf8')
const home = fs.readFileSync(path.join(__dirname, 'Home.tsx'), 'utf8')
const guideData = fs.readFileSync(path.join(__dirname, 'guide-data.ts'), 'utf8')

test('Start Here restores all five steps including Try it & build', () => {
  assert.match(page, /Understand Nervos CKB in/)
  assert.match(page, /five steps\b/)
  assert.doesNotMatch(page, /in four steps/)
  assert.deepEqual(
    [...guideData.matchAll(/id: 'step-(\d+)'/g)].map(match => Number(match[1])),
    [1, 2, 3, 4, 5],
  )
  assert.match(guideData, /id: 'step-5'/)
  assert.match(guideData, /title: 'Make your next move'/)
  assert.match(guideData, /navTitle: 'Try it & build'/)
})

test('hero fade progress is clamped across the scroll range', () => {
  const scrollHelper = path.join(__dirname, 'start-here-scroll.ts')
  assert.ok(fs.existsSync(scrollHelper), 'scroll progress helper should exist')
  const { getHeroFade } = require(scrollHelper)
  assert.equal(getHeroFade(-20), 0)
  assert.equal(getHeroFade(0), 0)
  assert.equal(getHeroFade(120), 0.5)
  assert.equal(getHeroFade(240), 1)
  assert.equal(getHeroFade(500), 1)
})

test('guide uses a two-column layout with compact navigation and unchanged step cards', () => {
  assert.match(page, /className=\{styles\.twoColumnLayout\}/)
  assert.match(page, /<aside className=\{clsx\(styles\.layoutSidebar, styles\.stepSidebar\)\} ref=\{sidebarRef\}>/)
  assert.match(page, /<div className=\{styles\.layoutContent\}>/)
  assert.match(pageStyles, /\.twoColumnLayout\s*\{[^}]*grid-template-columns:\s*280px minmax\(0, 1fr\)/)
  assert.match(page, /<SubjectCard\s+key=\{step\.id\}\s+compact/)
  assert.match(page, /<StepSection\s+key=\{step\.id\}/)
  assert.match(pageStyles, /\.layoutSidebar\.stepSidebar\s*\{[^}]*margin-bottom:\s*80px/)
})

test('selection navigation stays sticky while the navbar, hero and breadcrumbs scroll normally', () => {
  assert.match(page, /headerClassName=\{styles\.scrollingHeader\}/)
  assert.match(pageStyles, /\.page \.scrollingHeader\s*\{[^}]*position:\s*relative/)
  assert.match(pageStyles, /\.twoColumnPage \.breadcrumbDock\s*\{\s*position:\s*static/)
  assert.match(pageStyles, /\.layoutSidebar\s*\{[^}]*position:\s*sticky;[^}]*top:\s*16px/)
  assert.match(pageStyles, /\.breadcrumbDock\s*\{[^}]*padding-top:\s*0/)
  assert.match(pageStyles, /\.twoColumnPage :is\(\.startHeroCopy, \.topicHero\)\s*\{[^}]*opacity:\s*1/)
  assert.doesNotMatch(page, /useHeroScroll|styles\.stepsRail|--heroFade|--stepsRailHeight/)
})

test('mobile navigation scrolls horizontally and step anchors clear the sticky selection row', () => {
  assert.match(pageStyles, /scroll-margin-top:\s*24px/)
  assert.match(
    pageStyles,
    /\.layoutSidebar :is\(\.stepNav, \.subjectNav\)\s*\{[^}]*grid-auto-flow:\s*column;[^}]*overflow-x:\s*auto/,
  )
  assert.match(shared, /getComputedStyle\(node\)\.scrollMarginTop/)
  assert.match(pageStyles, /scroll-margin-top:\s*calc\(var\(--selectionRailHeight, 100px\) \+ 16px\)/)
})

test('related hubs and all-articles use the shared arrow button interaction', () => {
  assert.match(components, /export function ArrowButton/)
  assert.match(shared, /<ArrowButton\s+className=\{design\.pill\}/)
  assert.match(home, /<ArrowButton\s+className=\{styles\.allArticles\}/)
  assert.match(
    componentStyles,
    /\.arrowButton:is\(:hover, :focus-visible\)[\s\S]*?background:\s*var\(--kbDark\)[\s\S]*?color:\s*white/,
  )
  assert.match(componentStyles, /\.arrowButton:is\(:hover, :focus-visible\) \.arrowButtonIcon[\s\S]*?translateX\(8px\)/)
})

test('step-section reading rows use the established arrow-swap hover', () => {
  assert.match(components, /className=\{styles\.readingTitle\}/)
  assert.match(components, /className=\{styles\.readingArrow\}/)
  assert.match(componentStyles, /\.readingList a:is\(:hover, :focus-visible\) \.readingTitle[\s\S]*?translateX\(4px\)/)
  assert.match(componentStyles, /\.readingList a:is\(:hover, :focus-visible\) small[\s\S]*?visibility:\s*hidden/)
})

test('article row metadata keeps its layout slot while swapping to the arrow', () => {
  assert.match(components, /className=\{styles\.readingAction\}/)
  assert.match(componentStyles, /\.readingAction\s*\{[\s\S]*?position:\s*relative/)
  assert.match(componentStyles, /\.readingArrow\s*\{[\s\S]*?position:\s*absolute/)
  assert.match(componentStyles, /\.readingList a:is\(:hover, :focus-visible\) small[\s\S]*?visibility:\s*hidden/)
  assert.doesNotMatch(componentStyles, /\.readingList a:is\(:hover, :focus-visible\) small[^}]*display:\s*none/)
})
