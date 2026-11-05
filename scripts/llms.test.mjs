import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { loadSitemapEntries } from './generate-sitemap.mjs'

const llms = readFileSync(new URL('../public/llms.txt', import.meta.url), 'utf8')
const links = [...llms.matchAll(/^- \[([^\]]+)\]\((https:\/\/[^\s)]+)\): (.+)$/gm)].map(
  ([, title, href, description]) => ({ title, href, description }),
)

test('llms.txt is a concise Markdown overview with a title, summary, and resource sections', () => {
  assert.ok(llms.startsWith('# Nervos Network\n\n> '))
  assert.equal((llms.match(/^# /gm) ?? []).length, 1)
  assert.ok(/^## Start here$/m.test(llms))
  assert.ok(/^## Key concepts$/m.test(llms))
  assert.ok(/^## Build and explore$/m.test(llms))
  assert.ok(/^## Site index$/m.test(llms))
  assert.ok(llms.endsWith('\n'))
  assert.ok(Buffer.byteLength(llms, 'utf8') < 8_192)
  assert.ok(!llms.includes('\uFFFD'), 'The file must contain valid UTF-8 text')
  assert.equal(links.length, llms.split('\n').filter(line => line.startsWith('- ')).length)
  assert.ok(links.length > 0)
})

test('llms.txt links only to unique, absolute official HTTPS resources', () => {
  const seen = new Set()
  for (const { href } of links) {
    const url = new URL(href)
    assert.equal(url.protocol, 'https:')
    assert.ok(['https://www.nervos.org', 'https://docs.nervos.org'].includes(url.origin), href)
    assert.equal(url.username, '')
    assert.equal(url.password, '')
    assert.equal(url.search, '')
    assert.equal(url.hash, '')
    assert.ok(!seen.has(href), `Duplicate resource: ${href}`)
    seen.add(href)
  }
  assert.ok(seen.has('https://www.nervos.org/knowledge-base'))
  assert.ok(seen.has('https://docs.nervos.org/'))
  assert.ok(seen.has('https://www.nervos.org/sitemap.xml'))
})

test('llms.txt website links identify published canonical pages rather than legacy aliases', () => {
  const canonical = new Set(loadSitemapEntries().map(entry => entry.loc))
  for (const { href } of links) {
    if (href === 'https://docs.nervos.org/' || href === 'https://www.nervos.org/sitemap.xml') continue
    assert.ok(canonical.has(href), `Resource is missing from the published canonical sitemap: ${href}`)
  }
})
