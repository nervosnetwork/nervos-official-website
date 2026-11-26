import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { after, test } from 'node:test'
import ts from 'typescript'
import { informationPages } from '../config/information-pages.mjs'

const require = createRequire(import.meta.url)
const { NextRequest, NextResponse } = require('next/server')
const { getPageStaticInfo } = require('next/dist/build/analysis/get-page-static-info')
const { getMiddlewareRouteMatcher } = require('next/dist/shared/lib/router/utils/middleware-route-matcher')
const { i18n } = require('../next-i18next.config.js')
const previousNormalization = process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE
process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE = 'true'
after(() => {
  if (previousNormalization === undefined) delete process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE
  else process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE = previousNormalization
})

const compiled = ts.transpileModule(fs.readFileSync('src/middleware.page.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText
const dependencies = {
  'next/server': { NextResponse },
  '../public/education_hub_articles/metadata/slug-migrations.json': { renames: [] },
  '../public/education_hub_articles/metadata/catalog.json': { articles: [] },
  './utils/kb-hubs': {},
  './utils/markdown-accept': { prefersMarkdown: () => false },
}
const module = { exports: {} }
new Function('require', 'module', 'exports', compiled)(
  name => {
    assert.ok(Object.hasOwn(dependencies, name), name)
    return dependencies[name]
  },
  module,
  module.exports,
)
const { informationPageDestination, middleware } = module.exports
const request = (path, origin = 'https://www.nervos.org') =>
  new NextRequest(origin + path, { nextConfig: { i18n }, headers: { 'x-nextjs-data': '1' } })

test('information locale aliases redirect HTML and raw Next data to the canonical English document in one hop', () => {
  for (const origin of ['https://www.nervos.org', 'http://localhost:3001']) {
    for (const locale of i18n.locales) {
      for (const page of Object.values(informationPages)) {
        for (const path of [`/${locale}${page.path}`, `/_next/data/build/${locale}${page.path}.json`]) {
          const incoming = request(path + '?utm_source=test&tag=one&tag=two', origin)
          const before = incoming.url
          const destination = informationPageDestination(incoming)
          if (locale === 'en') {
            assert.equal(destination, null)
            assert.equal(middleware(incoming).headers.get('location'), null)
          } else {
            assert.equal(destination.origin, origin)
            assert.equal(destination.pathname, page.path)
            assert.equal(destination.search, incoming.nextUrl.search)
            const result = middleware(incoming)
            assert.equal(result.status, 308)
            assert.equal(result.headers.get('location'), destination.href)
            const english = request(destination.pathname + destination.search, origin)
            assert.equal(informationPageDestination(english), null, 'The destination cannot redirect again')
            assert.equal(middleware(english).headers.get('location'), null)
          }
          assert.equal(incoming.url, before, 'Do not mutate the incoming request')
        }
      }
    }
  }
  for (const path of ['/about', '/privacy', '/contact', '/zh/about/team', '/zh/privacy-extra', '/zh/contact-us'])
    assert.equal(informationPageDestination(request(path)), null)
})

test('Next compiles information route matchers for both HTML and client data requests', async () => {
  const info = await getPageStaticInfo({
    pageFilePath: 'src/middleware.page.ts',
    nextConfig: { i18n },
    isDev: false,
    page: '/middleware',
    pageType: 'pages',
  })
  const matches = getMiddlewareRouteMatcher(info.middleware.matchers)
  for (const locale of i18n.locales) {
    for (const page of Object.values(informationPages)) {
      assert.equal(matches(`/${locale}${page.path}`, request(`/${locale}${page.path}`), {}), true)
      const dataPath = `/_next/data/build/${locale}${page.path}.json`
      assert.equal(matches(dataPath, request(dataPath), {}), true, dataPath)
    }
  }
})
