import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

// Reads only local HTTP responses. It does not run browser scripts, send GA
// events, submit newsletter forms or inspect service credentials.
// node scripts/check-kb-analytics-http.mjs <local-origin> [unchanged-UI-baseline]
const require = createRequire(import.meta.url)
const { i18n } = require('../next-i18next.config.js')

const origin = process.argv[2] || 'http://localhost:3003'
const baseline = process.argv[3]
for (const target of [origin, baseline].filter(Boolean)) {
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(target).hostname), 'Use a local validation server')
}
const catalog = JSON.parse(fs.readFileSync('public/education_hub_articles/metadata/catalog.json', 'utf8'))
const articles = catalog.articles.filter(
  article => !article.draft && (!article.date || Date.parse(article.date) <= Date.now()),
)
const localized = (path, language) => `${language === 'en' ? '' : `/${language}`}${path}`
const main = html => {
  const value = html.match(/<main(?:\s[^>]*)?>[\s\S]*<\/main>/)?.[0]
  assert.ok(value, 'Visible main exists')
  return value
}
const response = (base, path) => fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(45000) })
const pageProps = html => {
  const data = html.match(/<script\b[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1]
  assert.ok(data, 'Next page props exist')
  return JSON.parse(data).props.pageProps
}

let searchChecks = 0
for (const language of ['en', 'zh', 'es']) {
  for (const query of ['', 'ckb', 'quantum', 'payment', 'unlikely-d20-no-match-xyz', 'x'.repeat(220)]) {
    const searchPath = localized('/knowledge-base/search', language) + `?q=${encodeURIComponent(query)}`
    const api = await response(origin, `/api/kb-search?q=${encodeURIComponent(query)}&locale=${language}`)
    const page = await response(origin, searchPath)
    assert.equal(api.status, 200)
    assert.equal(page.status, 200, searchPath)
    const suggestions = await api.json()
    const props = pageProps(await page.text())
    assert.equal(api.headers.get('X-Total-Count'), String(props.total), `${language}: full total for ${query}`)
    assert.deepEqual(
      suggestions.map(article => article.id),
      props.catalog.articles.slice(0, 5).map(article => article.id),
    )
    assert.ok(suggestions.length <= 5)
    assert.ok(suggestions.every(article => !Object.hasOwn(article, 'text')))
    searchChecks++
  }
}
assert.equal(
  (await fetch(origin + '/api/kb-search', { method: 'POST', signal: AbortSignal.timeout(5000) })).status,
  405,
)
console.log(
  `${searchChecks} actual search API totals match SSR search totals; five-card JSON and GET-only behavior preserved`,
)

const paths = new Set(articles.map(article => article.canonicalPath))
for (const hub of catalog.hubs) paths.add(`/knowledge-base/topic/${hub.id}`)
for (const language of i18n.locales) {
  for (const route of ['/knowledge-base', '/knowledge-base/start-here', '/knowledge-base/search'])
    paths.add(localized(route, language))
  const count = articles.filter(article => article.language === language).length
  for (let page = 1; page <= Math.max(1, Math.ceil(count / 24)); page++) {
    paths.add(localized('/knowledge-base/articles', language) + (page > 1 ? `?page=${page}` : ''))
  }
}
let checked = 0
for (const path of paths) {
  const result = await response(origin, path)
  assert.equal(result.status, 200, path)
  const html = await result.text()
  if (baseline) {
    const before = await response(baseline, path)
    assert.equal(before.status, 200, `Baseline ${path}`)
    const actual = main(html)
    const previous = main(await before.text())
    if (actual !== previous) {
      let index = 0
      while (index < Math.min(actual.length, previous.length) && actual[index] === previous[index]) index++
      assert.fail(
        `${path}: UI differs at ${index}\nActual: ${actual.slice(index, index + 160)}\nBaseline: ${previous.slice(index, index + 160)}`,
      )
    }
  }
  checked++
}
console.log(
  `${checked} current KB pages return 200${baseline ? ' with byte-identical visible main markup against the baseline' : ''}`,
)
