import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { after, test } from 'node:test'
import ts from 'typescript'
import { KB_HUBS as configuredKBHubs } from '../config/kb-hubs.mjs'

const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const { getPageStaticInfo } = require('next/dist/build/analysis/get-page-static-info')
const { getMiddlewareRouteMatcher } = require('next/dist/shared/lib/router/utils/middleware-route-matcher')
const { i18n } = require('../next-i18next.config.js')
// Exercise the production raw-URL setting, including the distinction between
// an explicit /en HTML alias and the required /en in a Next data endpoint.
const previousNormalization = process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE
process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE = 'true'
after(() => {
  if (previousNormalization === undefined) delete process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE
  else process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE = previousNormalization
})

const catalog = JSON.parse(fs.readFileSync('public/education_hub_articles/metadata/catalog.json', 'utf8'))
const migrations = JSON.parse(fs.readFileSync('public/education_hub_articles/metadata/slug-migrations.json', 'utf8'))
function loadTypeScript(filename, imports = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(
    name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency in ${filename}: ${name}`)
      return imports[name]
    },
    loaded,
    loaded.exports,
  )
  return loaded.exports
}
const hubModule = loadTypeScript('src/utils/kb-hubs.ts', {
  '../../config/kb-hubs.mjs': { KB_HUBS: configuredKBHubs },
})
const { KB_HUBS, resolveKBHub, kbHubPath } = hubModule
const { hubDestination, middleware, requestPagePath } = loadTypeScript('src/middleware.page.ts', {
  'next/server': {
    NextResponse: {
      next: () => ({ kind: 'next' }),
      redirect: (url, status) => ({ kind: 'redirect', location: url.href, status }),
    },
  },
  '../public/education_hub_articles/metadata/slug-migrations.json': migrations,
  '../public/education_hub_articles/metadata/catalog.json': catalog,
  './utils/kb-hubs': hubModule,
})
const prefixes = ['', ...i18n.locales.map(locale => `/${locale}`)]
const request = (pathname, origin = 'https://www.nervos.org') =>
  new NextRequest(`${origin}${pathname}`, { nextConfig: { i18n } })

function assertHubRedirect(incoming, pathname, removeHub = false) {
  const originalUrl = incoming.url
  const originalSearch = incoming.nextUrl.search
  const expectedQuery = [...incoming.nextUrl.searchParams].filter(([name]) => !removeHub || name !== 'hub')
  const destination = hubDestination(incoming)
  assert.ok(destination instanceof URL, incoming.url)
  assert.equal(destination.origin, new URL(incoming.url).origin)
  assert.equal(destination.pathname, pathname)
  assert.deepEqual([...destination.searchParams], expectedQuery)
  if (!removeHub) assert.equal(destination.search, originalSearch, 'Unchanged queries retain their encoding')
  assert.deepEqual(middleware(incoming), { kind: 'redirect', location: destination.href, status: 308 })
  const finalRequest = new NextRequest(destination, { nextConfig: { i18n } })
  assert.equal(hubDestination(finalRequest), null, 'The final URL must not enter another Hub redirect')
  assert.equal(incoming.url, originalUrl, 'The incoming request URL must not be mutated')
  assert.equal(incoming.nextUrl.search, originalSearch, 'The incoming query must not be mutated')
  return finalRequest
}

function assertHubUnchanged(pathname, prefix = '') {
  const incoming = request(`${prefix}${pathname}`)
  assert.equal(hubDestination(incoming), null, incoming.url)
  if (prefix === '/en') {
    // D-19 remains responsible for explicit English aliases, including invalid
    // Hub paths. D-21 must not guess a different Hub for those requests.
    assert.deepEqual(middleware(incoming), {
      kind: 'redirect',
      location: `https://www.nervos.org${pathname}`,
      status: 308,
    })
    assert.deepEqual(middleware(request(pathname)), { kind: 'next' })
  } else assert.deepEqual(middleware(incoming), { kind: 'next' }, incoming.url)
}

test('D-21 routing helpers exactly match the six catalog IDs and legacy full names', () => {
  assert.equal(KB_HUBS.length, 6)
  assert.deepEqual(
    KB_HUBS,
    catalog.hubs.map(({ id, name }) => ({ id, name })),
  )
  assert.equal(new Set(KB_HUBS.map(hub => hub.id)).size, 6)
  assert.equal(new Set(KB_HUBS.map(hub => hub.name)).size, 6)
  for (const { id, name } of catalog.hubs) {
    for (const selector of [id, name]) {
      assert.deepEqual(resolveKBHub(selector), { id, name })
      assert.equal(kbHubPath(selector), `/knowledge-base/topic/${id}`)
    }
  }
  for (const selector of [
    undefined,
    null,
    '',
    false,
    0,
    [],
    ['blockchain-scalability'],
    ['blockchain-scalability', 'nervos-ckb'],
    { id: 'blockchain-scalability' },
    ' blockchain-scalability',
    'blockchain-scalability ',
    'Blockchain Scalability ',
    'BLOCKCHAIN-SCALABILITY',
    'blockchain scalability',
    'Blockchain Virtual Machines & RISC-V',
    'blockchain-vms-and-risc-v',
    '__proto__',
    'constructor',
    'https://evil.example',
    '//evil.example',
  ]) {
    assert.equal(resolveKBHub(selector), null, JSON.stringify(selector))
    assert.equal(kbHubPath(selector), null, JSON.stringify(selector))
  }
})

test('D-21 redirects every legacy ID and full name in every locale directly to the English path', () => {
  for (const { id, name } of catalog.hubs) {
    for (const selector of [id, name]) {
      for (const prefix of prefixes) {
        const incoming = request(`${prefix}/knowledge-base/topic?hub=${encodeURIComponent(selector)}`)
        const finalRequest = assertHubRedirect(incoming, `/knowledge-base/topic/${id}`, true)
        assert.deepEqual(middleware(finalRequest), { kind: 'next' }, 'Known Hub migrations finish in one hop')
      }
    }
  }
})

test('D-21 removes only the legacy hub selector, retaining subjects, tracking, duplicate keys and origin', () => {
  const retained =
    'subject=state-and-storage&tag=first&term=a%20b&tag=second&plus=a%2Bb&plus=a+b&empty=&page=2&sort_by=popular&Hub=kept'
  for (const { id, name } of catalog.hubs) {
    for (const prefix of prefixes) {
      for (const query of [
        `hub=${encodeURIComponent(name)}&${retained}`,
        `${retained}&hub=${id}`,
        `tag=before&%68ub=${id}&${retained}&tag=after`,
      ]) {
        const finalRequest = assertHubRedirect(
          request(`${prefix}/knowledge-base/topic?${query}`),
          `/knowledge-base/topic/${id}`,
          true,
        )
        assert.equal(finalRequest.nextUrl.searchParams.has('hub'), false)
        assert.deepEqual(middleware(finalRequest), { kind: 'next' })
      }
    }
  }
  assertHubRedirect(
    request('/zh/knowledge-base/topic?hub=Nervos+CKB&tag=a&tag=b', 'http://localhost:3002'),
    '/knowledge-base/topic/nervos-ckb',
    true,
  )
})

test('D-21 legacy topic without a hub returns to the English KB root and preserves all parameters', () => {
  for (const prefix of prefixes) {
    for (const query of [
      '',
      '?subject=state-and-storage&tag=a&tag=b&term=a%20b&plus=a%2Bb',
      '?Hub=nervos-ckb&empty=&page=2&sort_by=popular',
    ]) {
      const incoming = request(`${prefix}/knowledge-base/topic${query}`)
      assertHubRedirect(incoming, '/knowledge-base')
    }
  }
})

test('D-21 rejects empty, repeated, malformed and unknown legacy hub selectors without guessing', () => {
  for (const query of [
    '?hub',
    '?hub=',
    '?hub=unknown',
    '?hub=blockchain-scalability&hub=blockchain-scalability',
    '?hub=blockchain-scalability&hub=nervos-ckb',
    '?hub=&hub=blockchain-scalability',
    '?hub=blockchain-scalability&%68ub=nervos-ckb',
    '?hub=Blockchain+Scalability+',
    '?hub=%20blockchain-scalability',
    '?hub=BLOCKCHAIN-SCALABILITY',
    '?hub=blockchain-vms-and-risc-v',
    '?hub=%broken',
    '?hub=%E0%A4%A',
    '?hub=%2F%2Fevil.example&subject=kept',
    '?hub=https%3A%2F%2Fevil.example&tag=a&tag=b',
  ]) {
    for (const prefix of prefixes) assertHubUnchanged(`/knowledge-base/topic${query}`, prefix)
  }
})

test('D-21 canonical Hub paths are English-only and retain every query parameter on locale fallback', () => {
  const query = '?subject=state-and-storage&tag=a&tag=b&hub=unchanged&hub=also-kept&page=2&term=a%20b'
  for (const { id } of catalog.hubs) {
    const pathname = `/knowledge-base/topic/${id}`
    assertHubUnchanged(`${pathname}${query}`)
    for (const prefix of prefixes.filter(Boolean)) {
      const finalRequest = assertHubRedirect(request(`${prefix}${pathname}${query}`), pathname)
      assert.deepEqual(middleware(finalRequest), { kind: 'next' }, 'Locale fallback finishes at a canonical Hub')
    }
  }
})

test('D-21 leaves unknown, malformed, full-name, extra-segment and non-Hub paths alone', () => {
  for (const pathname of [
    '/knowledge-base/topic/unknown',
    '/knowledge-base/topic/BLOCKCHAIN-SCALABILITY',
    '/knowledge-base/topic/Blockchain%20Scalability',
    '/knowledge-base/topic/blockchain-scalability/extra',
    '/knowledge-base/topic/%broken',
    '/knowledge-base/topic/%E0%A4%A',
    '/knowledge-base/topic/%2F%2Fevil.example',
    '/knowledge-base/topic/%2e%2e%2findex',
    '/knowledge-base/topics/blockchain-scalability',
    '/knowledge-base/Topic?hub=blockchain-scalability',
    '/Knowledge-base/topic?hub=blockchain-scalability',
    '/unrelated/topic?hub=blockchain-scalability',
    '/knowledge-base/articles?page=2&hub=blockchain-scalability',
    '/knowledge-base/search?q=CKB&hub=blockchain-scalability',
    '/knowledge-base/start-here?hub=blockchain-scalability',
  ]) {
    for (const prefix of prefixes) assertHubUnchanged(pathname, prefix)
  }
})

test('D-21 resolves legacy Next data requests to final HTML routes without leaking the build path', () => {
  for (const locale of i18n.locales) {
    const pathname = `/_next/data/d21-build/${locale}/knowledge-base/topic.json`
    for (const { id, name } of catalog.hubs) {
      for (const selector of [id, name]) {
        const incoming = request(`${pathname}?hub=${encodeURIComponent(selector)}&subject=kept&tag=a&tag=b`)
        assert.equal(incoming.nextUrl.pathname, pathname, 'Fixture must use unnormalized Next data paths')
        assert.equal(requestPagePath(incoming), '/knowledge-base/topic')
        const finalRequest = assertHubRedirect(incoming, `/knowledge-base/topic/${id}`, true)
        assert.deepEqual(middleware(finalRequest), { kind: 'next' })
      }
    }
    assertHubRedirect(request(`${pathname}?tag=a&tag=b`), '/knowledge-base')
    for (const query of ['?hub=', '?hub=unknown', '?hub=nervos-ckb&hub=nervos-ckb']) {
      const incoming = request(`${pathname}${query}`)
      assert.equal(hubDestination(incoming), null)
      assert.deepEqual(middleware(incoming), { kind: 'next' })
    }
  }
})

test('D-21 redirects translated new data paths, but never strips the required English data locale', () => {
  const query = '?subject=kept&tag=a&tag=b&hub=untouched&term=a%20b'
  for (const { id } of catalog.hubs) {
    for (const locale of i18n.locales) {
      const pathname = `/_next/data/d21-build/${locale}/knowledge-base/topic/${id}.json`
      const incoming = request(`${pathname}${query}`)
      assert.equal(requestPagePath(incoming), `/knowledge-base/topic/${id}`)
      if (locale === 'en') {
        assert.equal(hubDestination(incoming), null)
        assert.deepEqual(middleware(incoming), { kind: 'next' })
        assert.equal(incoming.url, `https://www.nervos.org${pathname}${query}`)
      } else {
        const finalRequest = assertHubRedirect(incoming, `/knowledge-base/topic/${id}`)
        assert.deepEqual(middleware(finalRequest), { kind: 'next' })
      }
    }
  }
  for (const locale of i18n.locales) {
    for (const id of ['unknown', '%broken', 'Blockchain%20Scalability', 'blockchain-scalability/extra']) {
      const incoming = request(`/_next/data/d21-build/${locale}/knowledge-base/topic/${id}.json${query}`)
      assert.equal(hubDestination(incoming), null)
      assert.deepEqual(middleware(incoming), { kind: 'next' })
    }
  }
})

test('D-21 does not intercept current article URLs or D-18 legacy article and asset migrations', () => {
  for (const article of catalog.articles) {
    const incoming = request(`${encodeURI(article.canonicalPath)}?hub=blockchain-scalability&tag=a&tag=b`)
    assert.equal(hubDestination(incoming), null)
    assert.deepEqual(middleware(incoming), { kind: 'next' }, article.canonicalPath)
  }
  const query = '?hub=blockchain-scalability&subject=kept&tag=a&tag=b'
  for (const { from, to } of migrations.renames) {
    const english = catalog.articles.find(article => article.id === to && article.language === 'en')
    assert.ok(english)
    for (const prefix of prefixes) {
      const incoming = request(`${prefix}/knowledge-base/${encodeURIComponent(from)}${query}`)
      const article =
        catalog.articles.find(article => article.id === to && article.language === incoming.nextUrl.locale) ?? english
      assert.equal(hubDestination(incoming), null)
      assert.deepEqual(middleware(incoming), {
        kind: 'redirect',
        location: `https://www.nervos.org${encodeURI(article.canonicalPath)}${query}`,
        status: 308,
      })
    }
    const asset = request(`/education_hub_articles/${encodeURIComponent(from)}/cover.png${query}`)
    assert.equal(hubDestination(asset), null)
    assert.deepEqual(middleware(asset), {
      kind: 'redirect',
      location: `https://www.nervos.org/education_hub_articles/${to}/cover.png${query}`,
      status: 308,
    })
  }
})

test('Next 14 compiles matchers that reach legacy and canonical Hub HTML and data routes in every locale', async () => {
  const info = await getPageStaticInfo({
    pageFilePath: 'src/middleware.page.ts',
    nextConfig: { i18n },
    isDev: false,
    page: '/middleware',
    pageType: 'pages',
  })
  const matches = getMiddlewareRouteMatcher(info.middleware.matchers)
  for (const prefix of prefixes) {
    for (const pathname of ['/knowledge-base/topic', ...catalog.hubs.map(hub => `/knowledge-base/topic/${hub.id}`)]) {
      const incoming = request(`${prefix}${pathname}?hub=nervos-ckb`)
      assert.equal(matches(`/${incoming.nextUrl.locale}${incoming.nextUrl.pathname}`, incoming, {}), true, incoming.url)
    }
  }
  for (const locale of i18n.locales) {
    for (const pathname of ['/knowledge-base/topic', ...catalog.hubs.map(hub => `/knowledge-base/topic/${hub.id}`)]) {
      const dataPath = `/_next/data/d21-build/${locale}${pathname}.json`
      const incoming = request(`${dataPath}?hub=nervos-ckb`)
      assert.equal(matches(dataPath, incoming, {}), true, incoming.url)
    }
  }
})
