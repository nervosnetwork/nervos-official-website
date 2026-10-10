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

test('start page keeps its navigation rails sticky and lifts step cards', () => {
  assert.match(page, /className=\{styles\.breadcrumbDock\}/)
  assert.match(page, /className=\{styles\.stepsRail\}/)
  assert.match(page, /--heroFade/)
  assert.match(pageStyles, /\.page \.scrollingHeader[\s\S]*?position:\s*relative/)
  assert.match(pageStyles, /\.breadcrumbDock[\s\S]*?position:\s*sticky/)
  assert.match(pageStyles, /\.stepsRail[\s\S]*?position:\s*sticky/)
  assert.match(componentStyles, /\.subject:is\(:hover, :focus-visible\)[\s\S]*?translateY\(-4px\)/)
})

test('desktop sticky breadcrumb and rail keep their existing measured offsets', () => {
  assert.match(pageStyles, /\.breadcrumbDock\s*\{[\s\S]*?top:\s*0/)
  assert.match(pageStyles, /\.stepsRail\s*\{[\s\S]*?top:\s*var\(--breadcrumbHeight, 55px\)/)
  assert.doesNotMatch(pageStyles, /\.breadcrumbDock\s*\{[^}]*padding-top:\s*(?:[2-9]\d|\d{3,})px/)
})

test('mobile steps use the measured rail for anchor offsets and keep the selected step visible', () => {
  assert.match(pageStyles, /\.breadcrumbDock\s*\{\s*position:\s*static/)
  assert.match(pageStyles, /\.stepsRail\s*\{\s*top:\s*0/)
  assert.match(pageStyles, /scroll-margin-top:\s*calc\(var\(--stepsRailHeight, 152px\) \+ 16px\)/)
  assert.match(page, /--stepsRailHeight/)
  assert.match(page, /nav\.scrollTo/)
  assert.match(shared, /getComputedStyle\(node\)\.scrollMarginTop/)
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
  assert.doesNotMatch(componentStyles, /\.readingList a:is\(:hover, :focus-visible\) small[\s\S]*?display:\s*none/)
})
