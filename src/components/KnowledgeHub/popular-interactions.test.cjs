/* eslint-disable @typescript-eslint/no-var-requires */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const component = fs.readFileSync(path.join(__dirname, 'Home.tsx'), 'utf8')
const styles = fs.readFileSync(path.join(__dirname, 'home-v2.module.scss'), 'utf8')
const sharedStyles = fs.readFileSync(path.join(__dirname, 'components.module.scss'), 'utf8')

test('reader favourites interactions match the requested behavior', () => {
  assert.match(component, /className=\{styles\.clearSearch\}/)
  assert.match(component, /setQuery\(''\)/)
  assert.match(styles, /\.popularCard[\s\S]*?translateY\(-4px\)/)
  assert.match(component, /<ArrowButton\s+className=\{styles\.allArticles\}/)
  assert.match(sharedStyles, /\.arrowButton:is\(:hover, :focus-visible\)[\s\S]*?background:\s*var\(--kbDark\)/)
  assert.match(sharedStyles, /\.arrowButton:is\(:hover, :focus-visible\) \.arrowButtonIcon[\s\S]*?translateX\(8px\)/)
  assert.match(styles, /\.clearSearch[\s\S]*?color:\s*var\(--kbMuted\)/)
  assert.match(styles, /\.popularHeader \.eyebrow[\s\S]*?align-items:\s*center/)
  assert.match(styles, /\.newsletterCopy form button span[\s\S]*?transition:\s*transform/)
  assert.match(styles, /\.newsletterCopy form button:is\(:hover, :focus-visible\) span[\s\S]*?translateX\(8px\)/)
})
