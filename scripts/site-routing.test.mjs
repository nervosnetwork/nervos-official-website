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
  assert.equal((await route('/blog')).statusCode, 307, 'Existing archive redirect remains unchanged')
})

test('D-19 baseline security headers cover pages/assets; HSTS is scoped to the exact production hostname', async () => {
  for (const path of ['/', '/zh/mining', '/knowledge-base/articles?page=2', '/robots.txt', '/_next/static/test.js']) {
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
