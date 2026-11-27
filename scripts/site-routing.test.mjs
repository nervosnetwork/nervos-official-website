import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

process.env.SKIP_ENV_VALIDATION = '1'
const { default: settings } = await import('../next.config.mjs')
const require = createRequire(import.meta.url)
const { defaultConfig } = require('next/dist/server/config-shared')
const loadCustomRoutes = require('next/dist/lib/load-custom-routes').default
const { buildCustomRoute } = require('next/dist/server/lib/router-utils/filesystem')
const { getResolveRoutes } = require('next/dist/server/lib/router-utils/resolve-routes')
const { normalizeLocalePath } = require('next/dist/shared/lib/i18n/normalize-locale-path')
const { formatUrl } = require('next/dist/shared/lib/router/utils/format-url')

const config = { ...defaultConfig, ...settings }
const custom = await loadCustomRoutes(config)
const fsChecker = {
  headers: custom.headers.map(rule => buildCustomRoute('header', rule, '', false)),
  redirects: custom.redirects.map(rule => buildCustomRoute('redirect', rule, '', false)),
  rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
  buildId: 'd19-test',
  getMiddlewareMatchers: () => () => false,
  getItem: async () => null,
  getDynamicRoutes: () => [],
  handleLocale: pathname => normalizeLocalePath(pathname, config.i18n.locales),
}
const resolve = getResolveRoutes(fsChecker, config, { dev: false, hostname: 'localhost', port: 3999 }, {}, {})
const route = (url, host = 'localhost:3999') =>
  resolve({ req: { url, headers: { host }, socket: {} }, res: {}, isUpgradeReq: true })

test('D-19 CKB aliases redirect directly to the correct final language, preserving query values', async () => {
  for (const locale of ['', ...config.i18n.locales]) {
    const prefix = locale ? `/${locale}` : ''
    const finalPrefix = locale && locale !== 'en' ? prefix : ''
    const result = await route(`${prefix}/ckb?tag=one&tag=two&utm_source=d19`)
    assert.equal(result.statusCode, 308)
    assert.equal(formatUrl(result.parsedUrl), `${finalPrefix}/ckbpage?tag=one&tag=two&utm_source=d19`)
    assert.equal((await route(`${finalPrefix}/ckbpage`)).statusCode, undefined)
  }
})

test('D-19 default-English aliases never add a looping default-locale config redirect', async () => {
  assert.equal(config.skipMiddlewareUrlNormalize, true)
  for (const path of ['/', '/en', '/en/mining', '/mining', '/knowledge-base', '/en/knowledge-base']) {
    assert.equal((await route(path)).statusCode, undefined, path)
  }
  assert.equal((await route('/knowledge-base/BFT_consensus_mechanisms_(explainCKBot)')).statusCode, 308)
})

test('B6 retired archive routes fall through without redirecting to the removed site or another page', async () => {
  for (const locale of ['', ...config.i18n.locales]) {
    const prefix = locale ? `/${locale}` : ''
    for (const pathname of ['/blog', '/blog/b6-retired-post', '/trailblazer', '/developer/grants', '/godwoken']) {
      const url = `${prefix}${pathname}?utm_source=b6&tag=one&tag=two`
      const result = await route(url)
      // This fixture resolves redirects only; Next then returns the normal 404
      // because no page exists at these retired paths.
      assert.equal(result.statusCode, undefined, url)
      assert.equal(result.resHeaders.Location, undefined, url)
    }
  }
  const roadmap = await route('/about/roadmap?utm_source=b6')
  assert.equal(roadmap.statusCode, 308)
  assert.equal(formatUrl(roadmap.parsedUrl), '/journey?utm_source=b6')
})

test('llms.txt has a plain-text header on its canonical root URL without a redirect', async () => {
  for (const host of ['localhost:3999', 'preview.vercel.app', 'www.nervos.org']) {
    const result = await route('/llms.txt', host)
    assert.equal(result.statusCode, undefined, host)
    assert.equal(result.resHeaders['Content-Type'], 'text/plain; charset=utf-8', host)
  }
  const rules = await settings.headers()
  const llms = rules.filter(rule => rule.source === '/llms.txt')
  assert.equal(llms.length, 1)
  assert.equal(llms[0].locale, undefined, 'Next must match its internally inferred default locale')
})

test('the API description and its RFC 9727 catalog get their media types on the root URLs without a redirect', async () => {
  for (const host of ['localhost:3999', 'preview.vercel.app', 'www.nervos.org']) {
    const description = await route('/openapi.json', host)
    assert.equal(description.statusCode, undefined, host)
    assert.equal(description.resHeaders['Content-Type'], 'application/json; charset=utf-8', host)
    assert.equal(description.resHeaders['Access-Control-Allow-Origin'], '*', host)
    const catalog = await route('/.well-known/api-catalog', host)
    assert.equal(catalog.statusCode, undefined, host)
    assert.equal(
      catalog.resHeaders['Content-Type'],
      'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
      host,
    )
    assert.equal(catalog.resHeaders.Link, '</.well-known/api-catalog>; rel="api-catalog"', host)
    assert.equal(catalog.resHeaders['Access-Control-Allow-Origin'], '*', host)
  }
  // Ordinary pages and other public files do not acquire the API headers.
  for (const path of ['/', '/knowledge-base', '/llms.txt', '/api/kb-search']) {
    const { resHeaders } = await route(path)
    assert.equal(resHeaders['Access-Control-Allow-Origin'], undefined, path)
    assert.equal(resHeaders.Link, undefined, path)
  }
})

test('D-19 baseline security headers cover pages/assets; HSTS is scoped to the exact production hostname', async () => {
  for (const path of [
    '/',
    '/zh/mining',
    '/knowledge-base/articles?page=2',
    '/robots.txt',
    '/llms.txt',
    '/_next/static/test.js',
  ]) {
    for (const host of [
      'localhost:3999',
      'preview.vercel.app',
      'nervos.org',
      'www.nervos.org',
      'www.nervos.org.evil.test',
    ]) {
      const { resHeaders: headers } = await route(path, host)
      assert.equal(headers['X-Content-Type-Options'], 'nosniff')
      assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin')
      assert.equal(headers['Permissions-Policy'], 'camera=(), microphone=(), geolocation=()')
      assert.equal(headers['Content-Security-Policy'], "object-src 'none'; base-uri 'self'; frame-ancestors 'self'")
      assert.equal(
        headers['Strict-Transport-Security'],
        host === 'www.nervos.org' ? 'max-age=31536000; includeSubDomains; preload' : undefined,
        host,
      )
    }
  }
})
