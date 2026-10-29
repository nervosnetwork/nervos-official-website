import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { after, test } from 'node:test'
import ts from 'typescript'
import { KB_HUBS } from '../config/kb-hubs.mjs'

const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const { getMiddlewareMatchers, getPageStaticInfo } = require('next/dist/build/analysis/get-page-static-info')
const { getMiddlewareRouteMatcher } = require('next/dist/shared/lib/router/utils/middleware-route-matcher')
const { i18n } = require('../next-i18next.config.js')
// Use the same raw-request behavior enabled by skipMiddlewareUrlNormalize in
// next.config; explicit English HTML and required data locales are different.
const previousNormalization = process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE
process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE = 'true'
after(() => {
  if (previousNormalization === undefined) delete process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE
  else process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE = previousNormalization
})
const migrations = JSON.parse(fs.readFileSync('public/education_hub_articles/metadata/slug-migrations.json', 'utf8'))
const catalog = JSON.parse(fs.readFileSync('public/education_hub_articles/metadata/catalog.json', 'utf8'))
const hubs = { exports: {} }
new Function(
  'require',
  'module',
  'exports',
  ts.transpileModule(fs.readFileSync('src/utils/kb-hubs.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText,
)(
  name => {
    assert.equal(name, '../../config/kb-hubs.mjs', `Unexpected Hub helper dependency: ${name}`)
    return { KB_HUBS }
  },
  hubs,
  hubs.exports,
)
const compiled = ts.transpileModule(fs.readFileSync('src/middleware.page.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText
function loadMiddleware(articles = catalog.articles) {
  const loaded = { exports: {} }
  const imports = {
    'next/server': {
      NextResponse: {
        next: () => ({ kind: 'next' }),
        redirect: (url, status) => ({ kind: 'redirect', location: url.href, status }),
      },
    },
    '../public/education_hub_articles/metadata/slug-migrations.json': migrations,
    '../public/education_hub_articles/metadata/catalog.json': { ...catalog, articles },
    './utils/kb-hubs': hubs.exports,
  }
  new Function('require', 'module', 'exports', compiled)(
    name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected middleware dependency: ${name}`)
      return imports[name]
    },
    loaded,
    loaded.exports,
  )
  return loaded.exports
}
const { migratedArticlePath, migratedAssetPath, middleware, requestPagePath, config } = loadMiddleware()
const request = pathname => new NextRequest(`https://www.nervos.org${pathname}`, { nextConfig: { i18n } })

test('Next 14 extracts and compiles middleware matchers that reach real HTML article requests, not only JSON routes', async () => {
  const info = await getPageStaticInfo({
    pageFilePath: 'src/middleware.page.ts',
    nextConfig: { i18n },
    isDev: false,
    page: '/middleware',
    pageType: 'pages',
  })
  // Next mutates object matcher sources while expanding data-route patterns.
  assert.deepEqual(info.middleware.matchers, getMiddlewareMatchers(structuredClone(config.matcher), { i18n }))
  assert.deepEqual(
    info.middleware.matchers.map(matcher => matcher.originalSource),
    ['/education_hub_articles/:path*', '/knowledge-base/:path*', '/en/:path*'],
  )
  const matches = getMiddlewareRouteMatcher(info.middleware.matchers)
  // Next's router prefixes the internally matched path with the detected or
  // default locale, including /en for a public URL with no locale prefix.
  const isMatched = incoming =>
    matches(
      `/${incoming.nextUrl.locale}${incoming.nextUrl.pathname}`,
      incoming,
      Object.fromEntries(incoming.nextUrl.searchParams),
    )
  for (const { from } of migrations.renames) {
    for (const prefix of ['', ...i18n.locales.map(locale => `/${locale}`)]) {
      const incoming = request(`${prefix}/knowledge-base/${encodeURIComponent(from)}?keep=yes`)
      assert.equal(isMatched(incoming), true, `Next would skip middleware for ${incoming.url}`)
      assert.equal(middleware(incoming).kind, 'redirect')
    }
    assert.equal(isMatched(request(`/education_hub_articles/${encodeURIComponent(from)}/nested/image.png`)), true)
  }
  assert.equal(matches('/_next/data/build/en/knowledge-base/BFT_consensus_mechanisms.json', request('/'), {}), true)
  for (const pathname of [
    '/',
    '/zh',
    '/blog',
    '/api/example',
    '/kb/read/BFT_consensus_mechanisms',
    '/zh/kb/read/BFT_consensus_mechanisms',
    '/unrelated/BFT_consensus_mechanisms',
  ]) {
    const incoming = request(pathname)
    assert.equal(isMatched(incoming), incoming.nextUrl.locale === 'en', pathname)
    assert.deepEqual(middleware(incoming), { kind: 'next' }, pathname)
  }
  // The catch-all matcher must not broaden the handler's exact article rule.
  for (const pathname of [
    '/knowledge-base',
    '/knowledge-base/hubs/example',
    '/knowledge-base/BFT_consensus_mechanisms/extra',
  ]) {
    const incoming = request(pathname)
    assert.equal(isMatched(incoming), true)
    assert.deepEqual(middleware(incoming), { kind: 'next' }, pathname)
  }
})

test('all 50 bare old paths use the final translated or English URL through real Next locale normalization', () => {
  const query = '?utm_source=d18&tag=first&tag=second&term=a%20b&locale=custom&oldSlug=kept'
  for (const { from, to } of migrations.renames) {
    const english = catalog.articles.find(article => article.id === to && article.language === 'en')
    assert.ok(english)
    for (const locale of i18n.locales) {
      const article = catalog.articles.find(article => article.id === to && article.language === locale) ?? english
      assert.equal(migratedArticlePath(`/knowledge-base/${encodeURIComponent(from)}`, locale), article.canonicalPath)
      assert.equal(migratedArticlePath(`/knowledge-base/${from}`, locale), article.canonicalPath)
      const prefixes = locale === 'en' ? ['', '/en'] : [`/${locale}`]
      for (const prefix of prefixes) {
        const incoming = request(`${prefix}/knowledge-base/${encodeURIComponent(from)}${query}`)
        const result = middleware(incoming)
        assert.equal(result.kind, 'redirect')
        assert.equal(result.status, 308)
        const destination = new URL(result.location)
        assert.equal(destination.origin, 'https://www.nervos.org')
        assert.equal(destination.pathname, article.canonicalPath)
        assert.equal(destination.search, query, 'Query spelling and repeated parameters must survive unchanged')
        assert.deepEqual([...destination.searchParams], [...incoming.nextUrl.searchParams])
        assert.deepEqual(middleware(request(destination.pathname + destination.search)), { kind: 'next' })
      }
    }
  }
})

test('new canonical addresses, previews, typo rows and unrelated/malformed IDs never enter the migration', () => {
  assert.deepEqual(config.matcher, [
    '/education_hub_articles/:path*',
    '/knowledge-base/:path*',
    { source: '/en/:path*', locale: false },
  ])
  for (const article of catalog.articles) {
    assert.equal(migratedArticlePath(`/knowledge-base/${article.id}`, article.language), null)
    assert.deepEqual(middleware(request(encodeURI(article.canonicalPath))), { kind: 'next' })
  }
  for (const { from } of migrations.renames) {
    assert.equal(migratedArticlePath(`/knowledge-base/${from.toUpperCase()}`), null)
    for (const pathname of [
      `/kb/read/${encodeURIComponent(from)}`,
      `/knowledge-base/${encodeURIComponent(from)}_(explainCKBot)`,
      `/knowledge-base/${encodeURIComponent(from)}_extra`,
      `/unrelated/${encodeURIComponent(from)}`,
    ])
      assert.deepEqual(middleware(request(pathname)), { kind: 'next' }, pathname)
  }
  for (const pathname of [
    '/knowledge-base/Unlocking_CKB_Liquid_iCKB',
    '/knowledge-base/unknown',
    '/knowledge-base/%broken',
    '/knowledge-base/%2e%2e%2findex',
    '/knowledge-base/',
    '/knowledge-base/BFT_consensus_mechanisms/extra',
  ])
    assert.equal(migratedArticlePath(pathname), null, pathname)
})

test('draft/future targets and translations do not redirect, while a truly absent translation falls back once', () => {
  const { from, to } = migrations.renames.find(({ from }) => from === 'BFT_consensus_mechanisms')
  const oldPath = `/knowledge-base/${from}`
  for (const state of [{ draft: true }, { date: '2999-01-01T00:00:00Z' }]) {
    const allUnavailable = loadMiddleware(
      catalog.articles.map(article => (article.id === to ? { ...article, ...state } : article)),
    )
    for (const locale of i18n.locales) {
      assert.equal(allUnavailable.migratedArticlePath(oldPath, locale), null)
      const incoming = request(`/${locale}${oldPath}?keep=yes`)
      if (locale === 'en') {
        // D-19 may remove /en, but must never redirect to an unpublished D-18
        // target. The remaining old path is still unavailable.
        assert.deepEqual(allUnavailable.middleware(incoming), {
          kind: 'redirect',
          location: `https://www.nervos.org${oldPath}?keep=yes`,
          status: 308,
        })
        assert.deepEqual(allUnavailable.middleware(request(`${oldPath}?keep=yes`)), { kind: 'next' })
      } else assert.deepEqual(allUnavailable.middleware(incoming), { kind: 'next' })
      const data = request(`/_next/data/d19-build/${locale}${oldPath}.json?keep=yes`)
      assert.deepEqual(allUnavailable.middleware(data), { kind: 'next' }, 'Unpublished data targets stay unavailable')
    }
    const translatedUnavailable = loadMiddleware(
      catalog.articles.map(article =>
        article.id === to && article.language === 'zh' ? { ...article, ...state } : article,
      ),
    )
    assert.equal(translatedUnavailable.migratedArticlePath(oldPath, 'zh'), null)
    assert.equal(translatedUnavailable.migratedArticlePath(oldPath, 'fr'), `/knowledge-base/${to}`)
  }
  const missing = loadMiddleware(catalog.articles.filter(article => article.id !== to))
  assert.equal(missing.migratedArticlePath(oldPath), null)
  const dated = loadMiddleware(
    catalog.articles.map(article =>
      article.id === to ? { ...article, draft: false, date: '2030-01-01T00:00:00Z' } : article,
    ),
  )
  assert.equal(dated.migratedArticlePath(oldPath, 'en', Date.parse('2029-12-31T23:59:59Z')), null)
  assert.equal(dated.migratedArticlePath(oldPath, 'en', Date.parse('2030-01-01T00:00:00Z')), `/knowledge-base/${to}`)
})

test('old asset folders migrate exactly once and preserve nested names, encoding and query values', () => {
  for (const { from, to } of migrations.renames) {
    const destination = `/education_hub_articles/${to}/nested/image%20name.png`
    for (const folder of [from, encodeURIComponent(from)]) {
      const pathname = `/education_hub_articles/${folder}/nested/image%20name.png`
      assert.equal(migratedAssetPath(pathname), destination)
      const result = middleware(request(`${pathname}?width=1200&tag=a&tag=b`))
      assert.deepEqual(result, {
        kind: 'redirect',
        location: `https://www.nervos.org${destination}?width=1200&tag=a&tag=b`,
        status: 308,
      })
    }
    assert.equal(migratedAssetPath(destination), null)
    assert.deepEqual(middleware(request(destination)), { kind: 'next' })
    assert.equal(migratedAssetPath(`/education_hub_articles/${encodeURIComponent(from)}`), null)
    assert.equal(migratedAssetPath(`/education_hub_articles/${encodeURIComponent(from)}_extra/file.png`), null)
    assert.equal(migratedAssetPath(`/education_hub_articles/${from.toUpperCase()}/file.png`), null)
  }
  for (const pathname of ['/unrelated/BFT_consensus_mechanisms/file.png', '/education_hub_articles/%broken/file.png']) {
    assert.equal(migratedAssetPath(pathname), null)
  }
})

test('D-18 handles all old article data paths once while keeping current Next data endpoints unchanged', () => {
  const query = '?utm_source=d18&tag=first&tag=second&term=a%20b&page=2&sort_by=popular'
  for (const { from, to } of migrations.renames) {
    const english = catalog.articles.find(article => article.id === to && article.language === 'en')
    assert.ok(english)
    for (const locale of i18n.locales) {
      const article = catalog.articles.find(article => article.id === to && article.language === locale) ?? english
      const pathname = `/_next/data/d19-build/${locale}/knowledge-base/${encodeURIComponent(from)}.json`
      const incoming = request(`${pathname}${query}`)
      assert.equal(incoming.nextUrl.pathname, pathname, 'Fixture must use unnormalized Next data paths')
      assert.equal(requestPagePath(incoming), `/knowledge-base/${encodeURIComponent(from)}`)
      assert.deepEqual(middleware(incoming), {
        kind: 'redirect',
        location: `https://www.nervos.org${article.canonicalPath}${query}`,
        status: 308,
      })
      assert.deepEqual(middleware(request(`${article.canonicalPath}${query}`)), { kind: 'next' })
    }
  }
  for (const article of catalog.articles) {
    const pathname = `/_next/data/d19-build/${article.language}/knowledge-base/${encodeURIComponent(article.id)}.json`
    const incoming = request(`${pathname}${query}`)
    assert.deepEqual(middleware(incoming), { kind: 'next' }, pathname)
    assert.equal(
      incoming.url,
      `https://www.nervos.org${pathname}${query}`,
      'The data locale segment must not be stripped',
    )
  }
  for (const pathname of [
    '/_next/data/d19-build/en/index.json',
    '/_next/data/d19-build/en/mining.json',
    '/_next/data/d19-build/en/knowledge-base/unknown.json',
    '/_next/data/d19-build/en/knowledge-base/%broken.json',
  ])
    assert.deepEqual(middleware(request(pathname)), { kind: 'next' }, pathname)
})
