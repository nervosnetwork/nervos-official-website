/* eslint-disable @typescript-eslint/no-var-requires */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const page = fs.readFileSync(path.join(__dirname, 'StartHere.tsx'), 'utf8')
const pageStyles = fs.readFileSync(path.join(__dirname, 'pages-v2.module.scss'), 'utf8')
const guideStyles = fs.readFileSync(path.join(__dirname, 'start-here.module.scss'), 'utf8')
const components = fs.readFileSync(path.join(__dirname, 'Components.tsx'), 'utf8')
const componentStyles = fs.readFileSync(path.join(__dirname, 'components.module.scss'), 'utf8')
const shared = fs.readFileSync(path.join(__dirname, 'Shared.tsx'), 'utf8')
const home = fs.readFileSync(path.join(__dirname, 'Home.tsx'), 'utf8')
const guideData = fs.readFileSync(path.join(__dirname, 'guide-data.ts'), 'utf8')

test('Start Here preserves the five guide sections and five-minute title', () => {
  assert.match(page, /Understand CKB in/)
  assert.match(page, /5 minutes/)
  assert.deepEqual(
    [...guideData.matchAll(/id: 'step-(\d+)'/g)].map(match => Number(match[1])),
    [1, 2, 3, 4, 5],
  )
  assert.match(guideData, /id: 'step-5',\s+title: 'Make your next move',\s+navTitle: 'Try it & build'/)
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

test('guide pairs its reading column with an article-style TOC without numbered steps', () => {
  const section = fs.readFileSync(path.join(__dirname, 'GuideSection.tsx'), 'utf8')
  assert.match(page, /className=\{guideStyles\.layout\}/)
  assert.match(page, /<GuideSection\s+key=\{step\.id\}/)
  assert.match(page, /<GuideContents/)
  assert.match(guideStyles, /\.sidebar\s*\{[^}]*position:\s*sticky/)
  assert.doesNotMatch(guideStyles, /\.stepNav|\.stepCircle|\.stepLabel|\.stepLink|\.chapterNumber/)
  assert.doesNotMatch(section, /chapterNumber/)
  assert.doesNotMatch(guideStyles, /44px minmax\(0, 1fr\)/)
})

test('the navbar and breadcrumbs scroll normally and section anchors remain available', () => {
  assert.match(page, /headerClassName=\{styles\.scrollingHeader\}/)
  assert.match(pageStyles, /\.page \.scrollingHeader\s*\{[^}]*position:\s*relative/)
  assert.match(guideStyles, /\.page \.breadcrumb\s*\{[^}]*position:\s*static/)
  assert.match(guideStyles, /scroll-margin-top:\s*32px/)
  assert.doesNotMatch(page, /useHeroScroll|--heroFade|--stepsRailHeight/)
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
