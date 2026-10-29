import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { DOMParser } from '@xmldom/xmldom'

// node scripts/check-page-seo-http.mjs [local origin] [optional unchanged-UI baseline origin]
const require = createRequire(import.meta.url)
const { i18n } = require('../next-i18next.config.js')

const origin = process.argv[2] ?? 'http://localhost:3003'
const baseline = process.argv[3]
const production = 'https://www.nervos.org'
const catalog = JSON.parse(fs.readFileSync('public/education_hub_articles/metadata/catalog.json', 'utf8'))
const articles = catalog.articles.filter(a => !a.draft && (!a.date || Date.parse(a.date) <= Date.now()))
const pathFor = (route, language) =>
  `${language === 'en' ? '' : `/${language}`}${route === '/' && language !== 'en' ? '' : route}`
const alternatesFor = (route, languages) => [
  ...languages.map(language => [language, production + pathFor(route, language)]),
  ...(languages.includes('en') ? [['x-default', production + route]] : []),
]
const sorted = entries => entries.slice().sort(([a], [b]) => a.localeCompare(b))
const attr = (node, name) => Array.from(node.attributes).find(attribute => attribute.name.toLowerCase() === name)?.value
const mainHTML = html => {
  const main = html.match(/<main(?:\s[^>]*)?>[\s\S]*<\/main>/)?.[0]
  assert.ok(main, 'Visible main element exists')
  return main
}
async function response(base, pathname) {
  return fetch(base + pathname, { redirect: 'manual', signal: AbortSignal.timeout(45000) })
}
let checked = 0
let compared = 0
async function check(pathname, expected) {
  let result = await response(origin, pathname)
  // D-19: explicit English aliases now redirect instead of serving duplicates.
  if (expected.redirectTo || pathname.startsWith('/en/')) {
    assert.equal(result.status, 308, pathname)
    const target = new URL(result.headers.get('location'), origin)
    assert.equal(target.href, origin + (expected.redirectTo ?? pathname.slice(3)), pathname)
    await result.arrayBuffer()
    result = await response(origin, target.pathname + target.search)
  }
  assert.equal(result.status, 200, pathname)
  assert.equal(result.headers.get('location'), null, pathname)
  const html = await result.text()
  const headHTML = html.match(/<head>[\s\S]*?<\/head>/)?.[0]
  assert.ok(headHTML, `${pathname}: head exists`)
  const head = new DOMParser().parseFromString(headHTML, 'text/html')
  const links = Array.from(head.getElementsByTagName('link'))
  assert.equal(html.match(/<html\b[^>]*\blang="([^"]+)"/)?.[1], expected.language, `${pathname}: lang`)
  const canonicals = links.filter(node => attr(node, 'rel') === 'canonical')
  assert.equal(canonicals.length, 1, `${pathname}: single canonical`)
  assert.equal(attr(canonicals[0], 'href'), expected.canonical, `${pathname}: canonical`)
  const alternates = links
    .filter(node => attr(node, 'rel') === 'alternate' && attr(node, 'hreflang'))
    .map(node => [attr(node, 'hreflang'), attr(node, 'href')])
  assert.deepEqual(sorted(alternates), sorted(expected.alternates), `${pathname}: real reciprocal alternatives`)
  assert.equal(new Set(alternates.map(([language]) => language)).size, alternates.length, `${pathname}: no duplicates`)
  for (const url of [expected.canonical, ...alternates.map(([, url]) => url)]) {
    const parsed = new URL(url)
    assert.equal(parsed.origin, production)
    assert.doesNotMatch(parsed.pathname, /^\/en(?:\/|$)/)
    assert.equal(parsed.hash, '')
  }
  if (baseline) {
    const before = await response(baseline, pathname)
    assert.equal(before.status, 200, `${pathname}: baseline`)
    const actual = mainHTML(html)
    const previous = mainHTML(await before.text())
    if (actual !== previous) {
      let index = 0
      while (index < Math.min(actual.length, previous.length) && actual[index] === previous[index]) index++
      assert.fail(
        `${pathname}: visible main differs at ${index}\nActual: ${actual.slice(index, index + 200)}\nBaseline: ${previous.slice(index, index + 200)}`,
      )
    }
    compared++
  }
  checked++
}

for (const article of articles) {
  const route = `/knowledge-base/${article.id}`
  const languages = i18n.locales.filter(language => articles.some(a => a.id === article.id && a.language === language))
  await check(article.canonicalPath, {
    canonical: production + article.canonicalPath,
    language: article.language,
    alternates: alternatesFor(route, languages),
  })
}
console.log(
  `All ${articles.length} published article renditions have one canonical, actual lang and reciprocal translation links`,
)

// These sets are independently audited from real, nonempty primary namespace
// copy. Empty ko/tr home files must not count; Journey really has both locales.
const corePages = [
  '/',
  '/home',
  '/ckbpage',
  '/mining',
  '/wallets',
  '/journey',
  '/developers',
  '/community',
  '/learn',
  '/media-kit',
  '/foundation',
]
for (const route of corePages) {
  const languages =
    route === '/journey' ? i18n.locales : route === '/media-kit' ? ['en'] : ['en', 'zh', 'es', 'fr', 'pt']
  const canonicalRoute = route === '/home' ? '/' : route
  for (const requested of i18n.locales) {
    const language = languages.includes(requested) ? requested : 'en'
    await check(pathFor(route, requested), {
      canonical: production + pathFor(canonicalRoute, language),
      language,
      alternates: alternatesFor(canonicalRoute, languages),
    })
  }
}
console.log('Core pages distinguish genuine translated copy from English fallback, including home aliases')

for (const language of i18n.locales) {
  for (const route of ['/knowledge-base', '/knowledge-base/start-here', '/knowledge-base/search']) {
    await check(pathFor(route, language) + '?utm_source=d10', {
      canonical: production + route,
      language: 'en',
      alternates: route.endsWith('/search') ? [] : alternatesFor(route, ['en']),
    })
  }
  for (const hub of catalog.hubs) {
    const route = `/knowledge-base/topic/${hub.id}`
    await check(pathFor(route, language) + '?utm_source=d10', {
      ...(language !== 'en' ? { redirectTo: route + '?utm_source=d10' } : {}),
      canonical: production + route,
      language: 'en',
      alternates: alternatesFor(route, ['en']),
    })
  }
  const count = articles.filter(a => a.language === language).length
  for (let page = 1; page <= Math.max(1, Math.ceil(count / 24)); page++) {
    const route = `/knowledge-base/articles${page > 1 ? `?page=${page}` : ''}`
    await check(pathFor('/knowledge-base/articles', language) + `?page=${page}&utm_source=d10`, {
      canonical: production + pathFor(route, count ? language : 'en'),
      language: count ? language : 'en',
      alternates: [],
    })
  }
}
console.log('English KB landings, six distinct Hub paths and valid archive pagination retain their canonical policy')

const firstEnglish = articles.find(a => a.language === 'en')
const articleRoute = `/knowledge-base/${firstEnglish.id}`
const languageSet = i18n.locales.filter(language =>
  articles.some(a => a.id === firstEnglish.id && a.language === language),
)
for (const pathname of [articleRoute + '?utm_source=d10', '/en' + articleRoute + '?utm_source=d10']) {
  await check(pathname, {
    canonical: production + articleRoute,
    language: 'en',
    alternates: alternatesFor(articleRoute, languageSet),
  })
}
const firstHub = catalog.hubs[0]
const hubRoute = `/knowledge-base/topic/${firstHub.id}`
await check(`/knowledge-base/topic?hub=${encodeURIComponent(firstHub.name)}&utm_source=d10`, {
  redirectTo: hubRoute + '?utm_source=d10',
  canonical: production + hubRoute,
  language: 'en',
  alternates: alternatesFor(hubRoute, ['en']),
})

const englishOnly = articles.find(a => a.language === 'en' && !articles.some(b => b.id === a.id && b.language === 'zh'))
const missing = await response(origin, `/zh/knowledge-base/${englishOnly.id}`)
assert.equal(missing.status, 308, 'Missing translation still redirects to English')
assert.equal(new URL(missing.headers.get('location'), origin).pathname, englishOnly.canonicalPath)
await missing.arrayBuffer()
const unknown = await response(origin, '/knowledge-base/d10-nonexistent-article')
assert.equal(unknown.status, 404, 'Unknown article remains 404')
await unknown.arrayBuffer()
console.log(
  `${checked} real HTTP responses checked; ${compared} visible main elements identical to baseline. D-06 missing/unknown handling unchanged.`,
)
