import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'

// Run against a started local build: node scripts/check-kb-query-redirects-http.mjs [origin]
const require = createRequire(import.meta.url)
const { i18n } = require('../next-i18next.config.js')

const origin = process.argv[2] ?? 'http://localhost:3002'
const catalog = JSON.parse(fs.readFileSync('public/education_hub_articles/metadata/catalog.json', 'utf8'))
const cases = [
  ['?sort_by=popular', ''],
  ['?sort_by=oldest%20post', ''],
  ['?sort_by=', ''],
  ['?page=2', '/articles'],
  ['?page=999', '/articles'],
  ['?page=', '/articles'],
  ['?page=broken', '/articles'],
  ['?page=2&sort_by=popular', '/articles'],
  ['?sort_by=scaling&page=2&page=3&sort_by=all', '/articles'],
]
async function response(pathname) {
  return fetch(origin + pathname, { redirect: 'manual', signal: AbortSignal.timeout(45000) })
}
let redirects = 0
for (const locale of ['', ...i18n.locales]) {
  const prefix = locale ? `/${locale}` : ''
  const targetPrefix = locale && locale !== i18n.defaultLocale ? prefix : ''
  for (const [query, destination] of cases) {
    const source = `${prefix}/knowledge-base${query}&utm_source=d07&tag=first&tag=second`
    const result = await response(source)
    assert.equal(result.status, 308, source)
    const target = new URL(result.headers.get('location'), origin)
    assert.equal(target.origin, origin, source)
    assert.equal(target.pathname, `${targetPrefix}/knowledge-base${destination}`, source)
    assert.deepEqual(
      [...target.searchParams],
      [
        ['utm_source', 'd07'],
        ['tag', 'first'],
        ['tag', 'second'],
      ],
      source,
    )
    await result.arrayBuffer()
    const final = await response(target.pathname + target.search)
    assert.equal(final.status, 200, target.href)
    assert.equal(final.headers.get('location'), null, target.href)
    await final.arrayBuffer()
    redirects++
  }
}
console.log(`${redirects} old listing requests redirect once, preserve locale/tracking, and finish at HTTP 200`)

let pages = 0
for (const locale of ['', 'en', 'zh', 'es']) {
  const language = locale || 'en'
  const prefix = locale ? `/${locale}` : ''
  const canonicalPrefix = language === 'en' ? '' : `/${language}`
  const articles = catalog.articles.filter(
    a => a.language === language && !a.draft && (!a.date || Date.parse(a.date) <= Date.now()),
  )
  const count = Math.max(1, Math.ceil(articles.length / 24))
  for (let page = 1; page <= count; page++) {
    const path = `${prefix}/knowledge-base/articles?page=${page}&utm_source=d07`
    const result = await response(path)
    assert.equal(result.status, 200, path)
    assert.equal(result.headers.get('location'), null, path)
    const html = await result.text()
    const canonicals = [...html.matchAll(/<link\b[^>]*rel="canonical"[^>]*href="([^"]+)"[^>]*>/g)]
    assert.equal(canonicals.length, 1, path)
    assert.equal(
      canonicals[0][1],
      `https://www.nervos.org${canonicalPrefix}/knowledge-base/articles${page > 1 ? `?page=${page}` : ''}`,
      path,
    )
    assert.equal(
      html.match(/<title>([^<]+)<\/title>/)?.[1],
      page > 1 ? `All articles — Page ${page}` : 'All articles',
      path,
    )
    assert.match(html, /<h1\b[^>]*>All articles<\/h1>/, path)
    assert.doesNotMatch(html, /<a\b[^>]*href="[^"]*sort_by=/, path)
    const data = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '{}')
    assert.equal(data.props.pageProps.page, page, path)
    assert.equal(data.props.pageProps.catalog.articles.length, Math.min(24, articles.length - (page - 1) * 24), path)
    pages++
  }
  for (const page of ['0', 'broken', String(count + 1)]) {
    const result = await response(`${prefix}/knowledge-base/articles?page=${page}`)
    assert.equal(result.status, 404, `${locale} invalid archive page ${page}`)
    await result.arrayBuffer()
  }
}
console.log(
  `${pages} real archive pages retain pagination, distinct head metadata and unchanged visible H1; invalid pages stay 404`,
)

for (const locale of ['fr', 'ko', 'tr', 'pt']) {
  const result = await response(`/${locale}/knowledge-base/articles`)
  assert.equal(result.status, 200)
  assert.match(await result.text(), /rel="canonical" href="https:\/\/www\.nervos\.org\/knowledge-base\/articles"/)
}
console.log('Untranslated empty archive locales canonicalize to English without adding a UI language switcher')
