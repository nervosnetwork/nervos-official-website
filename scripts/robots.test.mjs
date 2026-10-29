import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const robots = readFileSync(new URL('../public/robots.txt', import.meta.url), 'utf8')
const directives = robots
  .split(/\r?\n/)
  .map(line => line.replace(/#.*/, '').trim())
  .filter(Boolean)

test('D-02 allows general crawlers and the explicitly requested AI crawlers', () => {
  const groups = []
  for (const directive of directives) {
    if (directive.startsWith('User-agent:')) {
      groups.push({ agent: directive.slice('User-agent:'.length).trim(), rules: [] })
    } else if (!directive.startsWith('Sitemap:')) {
      assert.ok(groups.length, 'Crawl rules must belong to a user-agent group')
      groups.at(-1).rules.push(directive)
    }
  }

  assert.deepEqual(
    groups.map(group => group.agent),
    ['*', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'Google-Extended'],
  )
  for (const group of groups) assert.deepEqual(group.rules, ['Allow: /'], group.agent)
})

test('D-02 keeps old listing URLs and Next.js assets crawlable', () => {
  // Crawlers must reach old ?page= / ?sort_by= URLs to observe D-07 redirects.
  assert.equal(
    directives.some(directive => /^Disallow\s*:/i.test(directive)),
    false,
  )
})

test('D-02 declares the production sitemap that D-03 will generate', () => {
  assert.deepEqual(
    directives.filter(directive => directive.startsWith('Sitemap:')),
    ['Sitemap: https://www.nervos.org/sitemap.xml'],
  )
})
