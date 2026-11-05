import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { after, test } from 'node:test'
import ts from 'typescript'
import { KB_HUBS } from '../config/kb-hubs.mjs'

const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const { getPageStaticInfo } = require('next/dist/build/analysis/get-page-static-info')
const { getMiddlewareRouteMatcher } = require('next/dist/shared/lib/router/utils/middleware-route-matcher')
const { i18n } = require('../next-i18next.config.js')
// Match the production skipMiddlewareUrlNormalize setting: request.url may
// contain an explicit or inferred /en prefix and retains Next data paths.
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
const loaded = { exports: {} }
const imports = {
  'next/server': {
    NextResponse: {
      next: () => ({ kind: 'next' }),
      redirect: (url, status) => ({ kind: 'redirect', location: url.href, status }),
    },
  },
  '../public/education_hub_articles/metadata/slug-migrations.json': migrations,
  '../public/education_hub_articles/metadata/catalog.json': catalog,
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
const { legacyListingDestination, middleware, requestPagePath } = loaded.exports
const prefixes = ['', ...i18n.locales.map(locale => `/${locale}`)]
const request = (pathname, origin = 'https://www.nervos.org') =>
  new NextRequest(`${origin}${pathname}`, { nextConfig: { i18n } })
const finalPrefix = prefix => (prefix === '/en' ? '' : prefix)

function assertListingRedirect(incoming, pathname) {
  const originalUrl = incoming.url
  const originalSearch = incoming.nextUrl.search
  const expectedQuery = [...incoming.nextUrl.searchParams].filter(([name]) => name !== 'page' && name !== 'sort_by')
  const destination = legacyListingDestination(incoming)
  assert.ok(destination instanceof URL)
  assert.equal(destination.origin, new URL(incoming.url).origin)
  assert.equal(destination.pathname, pathname)
  assert.deepEqual([...destination.searchParams], expectedQuery)
  assert.equal(destination.searchParams.has('page'), false)
  assert.equal(destination.searchParams.has('sort_by'), false)
  assert.deepEqual(middleware(incoming), { kind: 'redirect', location: destination.href, status: 308 })
  const finalRequest = new NextRequest(destination, { nextConfig: { i18n } })
  assert.equal(legacyListingDestination(finalRequest), null, 'Final URL must not trigger another query redirect')
  assert.deepEqual(middleware(finalRequest), { kind: 'next' }, 'Final URL must not enter any redirect loop')
  assert.equal(incoming.url, originalUrl, 'The incoming request must not be mutated')
  assert.equal(incoming.nextUrl.search, originalSearch, 'The incoming query must not be mutated')
}

test('D-07 sort_by presence redirects every locale and explicit English directly to the clean KB home', () => {
  for (const prefix of prefixes) {
    for (const query of [
      '?sort_by=popular',
      '?sort_by=scaling',
      '?sort_by=not-an-approved-value',
      '?sort_by=',
      '?sort_by',
      '?sort_by=popular&sort_by=oldest+post',
      '?sort_by=%2F%2Fevil.example&sort_by=%E4%B8%AD%E6%96%87',
    ])
      assertListingRedirect(request(`${prefix}/knowledge-base${query}`), `${finalPrefix(prefix)}/knowledge-base`)
  }
})

test('D-07 page presence wins over sort_by regardless of order, spelling of values or repeated/empty values', () => {
  for (const prefix of prefixes) {
    for (const query of [
      '?page=2',
      '?page=1',
      '?page=0',
      '?page=-1',
      '?page=NaN',
      '?page=2.5',
      '?page=',
      '?page',
      '?page=2&page=999',
      '?page=&page=invalid',
      '?sort_by=popular&page=2',
      '?page=2&sort_by=popular',
      '?sort_by=&page=&sort_by=oldest&page=-1',
      '?%70age=2',
    ])
      assertListingRedirect(
        request(`${prefix}/knowledge-base${query}`),
        `${finalPrefix(prefix)}/knowledge-base/articles`,
      )
  }
})

test('D-07 removes every legacy parameter while retaining other names, values, duplicate keys and ordering', () => {
  const tracking = 'utm_source=d07&tag=first&term=a%20b&tag=second&plus=a%2Bb&plus=a+b&empty=&Page=kept&SORT_BY=kept'
  for (const prefix of prefixes) {
    assertListingRedirect(
      request(`${prefix}/knowledge-base?sort_by=popular&${tracking}&sort_by=&page=2&page=invalid&last=kept`),
      `${finalPrefix(prefix)}/knowledge-base/articles`,
    )
    assertListingRedirect(
      request(`${prefix}/knowledge-base?${tracking}&sort_by=popular&sort_by=`),
      `${finalPrefix(prefix)}/knowledge-base`,
    )
  }
  assertListingRedirect(
    request('/en/knowledge-base?page=2&tag=first&tag=second', 'http://localhost:3002'),
    '/knowledge-base/articles',
  )
})

test('D-07 matches only the exact KB root and exact legacy parameter names; current archive pagination is untouched', () => {
  for (const prefix of prefixes) {
    for (const pathname of [
      '/knowledge-base',
      '/knowledge-base?utm_source=test',
      '/knowledge-base?Page=2',
      '/knowledge-base?SORT_BY=popular',
      '/knowledge-base?sort_by_extra=popular&pages=2',
      '/knowledge-base/articles?page=2&sort_by=popular',
      '/knowledge-base/articles?page=1',
      '/knowledge-base/search?q=CKB&page=2',
      '/knowledge-base/start-here?page=2',
      '/knowledge-base/unknown?page=2',
      '/knowledge-base/bft_consensus_mechanisms?page=2&sort_by=popular',
      '/Knowledge-base?page=2',
      '/knowledge-Base?sort_by=popular',
      '/knowledge%2Dbase?page=2',
      '/knowledge-base/extra/path?page=2',
      '/unrelated?page=2&sort_by=popular',
    ]) {
      const incoming = request(`${prefix}${pathname}`)
      assert.equal(legacyListingDestination(incoming), null, incoming.url)
      assert.deepEqual(middleware(incoming), { kind: 'next' }, incoming.url)
    }
  }
})

test('D-07 leaves current Hub queries to D-21 without removing their page or sort_by values', () => {
  for (const prefix of prefixes) {
    const incoming = request(`${prefix}/knowledge-base/topic?hub=blockchain-scalability&page=2&sort_by=popular`)
    assert.equal(legacyListingDestination(incoming), null)
    assert.deepEqual(middleware(incoming), {
      kind: 'redirect',
      status: 308,
      location: 'https://www.nervos.org/knowledge-base/topic/blockchain-scalability?page=2&sort_by=popular',
    })
  }
})

test('Next 14 actually compiles the middleware config to match KB root HTML requests in every locale', async () => {
  const info = await getPageStaticInfo({
    pageFilePath: 'src/middleware.page.ts',
    nextConfig: { i18n },
    isDev: false,
    page: '/middleware',
    pageType: 'pages',
  })
  const matches = getMiddlewareRouteMatcher(info.middleware.matchers)
  // Next's internal matcher path always carries the detected/default locale,
  // even though the public English URL omits /en.
  for (const prefix of prefixes) {
    const incoming = request(`${prefix}/knowledge-base?page=2&sort_by=popular`)
    assert.equal(matches(`/${incoming.nextUrl.locale}${incoming.nextUrl.pathname}`, incoming, {}), true, incoming.url)
    assert.equal(middleware(incoming).kind, 'redirect')
  }
  for (const pathname of ['/blog', '/api/example', '/kb/read/BFT_consensus_mechanisms', '/unrelated']) {
    for (const prefix of prefixes) {
      const incoming = request(`${prefix}${pathname}?page=2`)
      assert.equal(
        matches(`/${incoming.nextUrl.locale}${incoming.nextUrl.pathname}`, incoming, {}),
        false,
        incoming.url,
      )
      assert.deepEqual(middleware(incoming), { kind: 'next' })
    }
  }
})

test('D-07 leaves all 50 D-18 old article migrations in control, preserving even page and sort_by article queries', () => {
  const query = '?page=2&sort_by=popular&tag=first&tag=second&sort_by=oldest&page=3&term=a%20b'
  for (const { from, to } of migrations.renames) {
    const english = catalog.articles.find(article => article.id === to && article.language === 'en')
    assert.ok(english)
    for (const prefix of prefixes) {
      const incoming = request(`${prefix}/knowledge-base/${encodeURIComponent(from)}${query}`)
      assert.equal(legacyListingDestination(incoming), null)
      const article =
        catalog.articles.find(article => article.id === to && article.language === incoming.nextUrl.locale) ?? english
      const result = middleware(incoming)
      assert.equal(result.kind, 'redirect')
      assert.equal(result.status, 308)
      const destination = new URL(result.location)
      assert.equal(destination.pathname, article.canonicalPath)
      assert.deepEqual([...destination.searchParams], [...incoming.nextUrl.searchParams])
      assert.deepEqual(middleware(new NextRequest(destination, { nextConfig: { i18n } })), { kind: 'next' })
    }
  }
})

test('D-07 does not take over D-18 asset migrations or D-01 suffix paths', () => {
  const query = '?page=2&sort_by=popular&tag=first&tag=second'
  const incoming = request(`/education_hub_articles/BFT_consensus_mechanisms/cover.png${query}`)
  assert.equal(legacyListingDestination(incoming), null)
  assert.deepEqual(middleware(incoming), {
    kind: 'redirect',
    status: 308,
    location: `https://www.nervos.org/education_hub_articles/bft_consensus_mechanisms/cover.png${query}`,
  })
  const legacySuffix = request(`/knowledge-base/BFT_consensus_mechanisms_(explainCKBot)${query}`)
  assert.equal(legacyListingDestination(legacySuffix), null)
  // Config redirects own this request; the middleware must not redirect it to
  // a listing page if invoked independently of the earlier config phase.
  assert.deepEqual(middleware(legacySuffix), { kind: 'next' })
})

test('D-07 still redirects raw Next data requests directly and preserves current archive data pagination', () => {
  for (const locale of i18n.locales) {
    const targetPrefix = locale === 'en' ? '' : `/${locale}`
    for (const [query, destination] of [
      ['?sort_by=popular', '/knowledge-base'],
      ['?page=2', '/knowledge-base/articles'],
      ['?sort_by=popular&page=2&sort_by=oldest&page=3', '/knowledge-base/articles'],
    ]) {
      const incoming = request(
        `/_next/data/d19-build/${locale}/knowledge-base.json${query}&tag=first&tag=second&term=a%20b`,
      )
      assert.equal(incoming.nextUrl.pathname, `/_next/data/d19-build/${locale}/knowledge-base.json`)
      assert.equal(requestPagePath(incoming), '/knowledge-base')
      assertListingRedirect(incoming, `${targetPrefix}${destination}`)
    }
    for (const page of [1, 2, 9]) {
      const pathname = `/_next/data/d19-build/${locale}/knowledge-base/articles.json?page=${page}&sort_by=popular`
      const incoming = request(pathname)
      assert.equal(requestPagePath(incoming), '/knowledge-base/articles')
      assert.equal(legacyListingDestination(incoming), null)
      assert.deepEqual(middleware(incoming), { kind: 'next' }, pathname)
      assert.equal(incoming.url, `https://www.nervos.org${pathname}`, 'Next data locale and build path stay intact')
    }
    const home = request(`/_next/data/d19-build/${locale}/index.json`)
    assert.equal(requestPagePath(home), '/')
    assert.deepEqual(middleware(home), { kind: 'next' })
  }
})
