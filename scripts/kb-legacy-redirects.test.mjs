import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'
import { remark } from 'remark'
import { kbLegacyRedirects, currentKBLegacyRedirects } from '../config/kb-legacy-redirects.mjs'

const require = createRequire(import.meta.url)
const { defaultConfig } = require('next/dist/server/config-shared')
const loadCustomRoutes = require('next/dist/lib/load-custom-routes').default
const { buildCustomRoute } = require('next/dist/server/lib/router-utils/filesystem')
const { getResolveRoutes } = require('next/dist/server/lib/router-utils/resolve-routes')
const { normalizeLocalePath } = require('next/dist/shared/lib/i18n/normalize-locale-path')
const { formatUrl } = require('next/dist/shared/lib/router/utils/format-url')
const { i18n } = require('../next-i18next.config.js')

const catalog = JSON.parse(
  fs.readFileSync(new URL('../public/education_hub_articles/metadata/catalog.json', import.meta.url), 'utf8'),
)
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/kb-legacy-urls.json', import.meta.url), 'utf8'))
const { renames } = JSON.parse(
  fs.readFileSync(new URL('../public/education_hub_articles/metadata/slug-migrations.json', import.meta.url), 'utf8'),
)
const now = Date.now()
const isPublished = article => !article.draft && (!article.date || Date.parse(article.date) <= now)
const publishedPaths = new Set(catalog.articles.filter(isPublished).map(article => encodeURI(article.canonicalPath)))
const currentRules = currentKBLegacyRedirects(i18n)

// Exercise Next's own config expansion, matching, i18n normalization and
// destination construction. There is no HTTP listener or filesystem route mock
// claiming to return 200; the separate article loader verifies page outcomes.
async function routerFor(rules) {
  const config = { ...defaultConfig, i18n, redirects: async () => rules.map(rule => ({ ...rule })) }
  const custom = await loadCustomRoutes(config)
  const fsChecker = {
    headers: [],
    redirects: custom.redirects.map(rule => buildCustomRoute('redirect', rule, '', false)),
    rewrites: { beforeFiles: [], afterFiles: [], fallback: [] },
    buildId: 'legacy-redirect-test',
    getMiddlewareMatchers: () => () => false,
    getItem: async () => null,
    getDynamicRoutes: () => [],
    handleLocale: pathname => normalizeLocalePath(pathname, i18n.locales),
  }
  const resolve = getResolveRoutes(fsChecker, config, { dev: false, hostname: 'localhost', port: 3999 }, {}, {})
  return async url => {
    const result = await resolve({
      req: { url, headers: { host: 'localhost:3999' }, socket: {} },
      res: {},
      isUpgradeReq: true,
    })
    return { status: result.statusCode, location: result.statusCode ? formatUrl(result.parsedUrl) : undefined }
  }
}
const route = await routerFor(currentRules)

function loadServerModule(filename, dependencies = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(
    id => (Object.hasOwn(dependencies, id) ? dependencies[id] : require(id)),
    loaded,
    loaded.exports,
  )
  return loaded.exports
}

const content = loadServerModule('src/components/KnowledgeHub/content.ts')
const headings = loadServerModule('src/components/KnowledgeHub/markdown-headings.ts')
function articleLoader(articles = catalog.articles) {
  const source = loadServerModule('src/server/kb-content.ts', {
    'node:fs': {
      ...fs,
      readFileSync: (filename, ...args) =>
        String(filename).endsWith('/metadata/catalog.json')
          ? JSON.stringify({ ...catalog, articles })
          : fs.readFileSync(filename, ...args),
    },
  })
  const catalogs = new Map()
  const cachedSource = {
    ...source,
    getKBCatalog: (language = 'en') => {
      if (!catalogs.has(language)) catalogs.set(language, source.getKBCatalog(language))
      return catalogs.get(language)
    },
  }
  const { articleStaticProps } = loadServerModule('src/server/kb-article-page.ts', {
    '../components/KnowledgeHub/content': content,
    '../components/KnowledgeHub/markdown-headings': headings,
    './kb-content': cachedSource,
    './kb-images': { getKBImageDimensions: () => ({}) },
    remark: { remark },
    'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
  })
  return async (pathname, kind = 'canonical') => {
    const normalized = normalizeLocalePath(new URL(pathname, 'https://www.nervos.org').pathname, i18n.locales)
    const match = /^\/knowledge-base\/([^/]+)$/.exec(normalized.pathname)
    assert.ok(match, `Expected an article path: ${pathname}`)
    return articleStaticProps(kind)({
      params: { slug: decodeURIComponent(match[1]) },
      locale: normalized.detectedLocale ?? i18n.defaultLocale,
    })
  }
}
const loadArticle = articleLoader()

async function assertSingleRedirect(router, source, destination, message = source) {
  assert.deepEqual(await router(source), { status: 308, location: destination }, message)
  assert.equal((await router(destination)).status, undefined, `Unexpected second redirect: ${message}`)
}

test('D-01 fixture accounts for every audited URL and all main destinations are current published paths', () => {
  assert.ok(fixture.sourceWorkbook)
  assert.ok(fixture.sourceSheet)
  assert.equal(fixture.redirects.length, 474)
  assert.equal(fixture.unmapped.length, 25)
  const sources = [...fixture.redirects, ...fixture.unmapped].map(([, source]) => source)
  assert.equal(new Set(sources).size, 499)
  for (const [row, source, destination] of fixture.redirects) {
    assert.ok(publishedPaths.has(destination), `Row ${row}: ${source} targets an unavailable path ${destination}`)
  }
})

test('all 474 audited main URLs resolve in one permanent Next redirect to the current destination', async () => {
  for (const [row, source, destination] of fixture.redirects) {
    await assertSingleRedirect(route, source, destination, `Workbook row ${row}: ${source}`)
  }
})

test('all 50 bare D-18 old slugs resolve exactly once for every locale and explicit English; previews stay 404', async () => {
  assert.equal(renames.length, 50)
  for (const { from, to } of renames) {
    const english = catalog.articles.find(article => article.id === to && article.language === 'en')
    assert.ok(english, `Missing migrated English article: ${to}`)
    for (const locale of i18n.locales) {
      const article = catalog.articles.find(article => article.id === to && article.language === locale) ?? english
      const destination = encodeURI(article.canonicalPath)
      const prefixes = locale === 'en' ? ['', '/en'] : [`/${locale}`]
      for (const prefix of prefixes) {
        const oldPath = encodeURI(`${prefix}/knowledge-base/${from}`)
        assert.equal((await route(oldPath)).status, undefined, 'Bare migrations must not use case-insensitive rules')
        assert.deepEqual(
          await loadArticle(oldPath),
          {
            redirect: { destination, permanent: true },
          },
          oldPath,
        )
        assert.deepEqual(await loadArticle(oldPath, 'preview'), { notFound: true }, oldPath)
      }
      assert.equal((await route(destination)).status, undefined, `Redirect loop: ${destination}`)
      const final = await loadArticle(destination)
      assert.ok('props' in final && !('redirect' in final), `Final article must serve directly: ${destination}`)
      assert.equal(final.props.article.id, to)
      assert.equal(final.props.article.language, article.language)
    }
  }
})

test('all 50 old suffix slugs bypass the bare migration and missing-translation redirects', async () => {
  for (const { from, to } of renames) {
    const english = catalog.articles.find(article => article.id === to && article.language === 'en')
    for (const locale of i18n.locales) {
      const article = catalog.articles.find(article => article.id === to && article.language === locale) ?? english
      const destination = encodeURI(article.canonicalPath)
      for (const suffix of ['_(explainCKBot)', '_%28explainCKBot%29']) {
        await assertSingleRedirect(route, `/${locale}/knowledge-base/${encodeURIComponent(from)}${suffix}`, destination)
      }
    }
  }
})

test('every current canonical article address stays untouched after D-18, including explicit English', async () => {
  for (const article of catalog.articles) {
    const canonical = encodeURI(article.canonicalPath)
    assert.equal((await route(canonical)).status, undefined, canonical)
    if (article.language === 'en') {
      assert.equal((await route(`/en${canonical}`)).status, undefined, `Explicit English canonical: ${canonical}`)
    }
  }
})

test('literal and encoded suffixes, explicit English and every locale resolve without translation chains', async () => {
  const english = catalog.articles.find(
    article => article.language === 'en' && article.id === 'bft_consensus_mechanisms',
  )
  assert.ok(english)
  for (const locale of i18n.locales) {
    const translated = catalog.articles.find(article => article.id === english.id && article.language === locale)
    const destination = encodeURI((translated ?? english).canonicalPath)
    for (const suffix of ['_(explainCKBot)', '_%28explainCKBot%29']) {
      await assertSingleRedirect(route, `/${locale}/knowledge-base/${english.id}${suffix}`, destination)
      if (locale === 'en') await assertSingleRedirect(route, `/knowledge-base/${english.id}${suffix}`, destination)
    }
  }
  const translated = catalog.articles.find(article => article.id === english.id && article.language === 'zh')
  assert.ok(translated)
  assert.ok('props' in (await loadArticle(translated.canonicalPath)))
  assert.ok('props' in (await loadArticle(english.canonicalPath)))
})

test('space encoding and special historical aliases resolve directly to migrated destinations', async () => {
  const migration = renames.find(({ from }) => from === 'What_is_a_digital_signature_ in_Blockchain')
  assert.ok(migration)
  const article = catalog.articles.find(article => article.language === 'en' && article.id === migration.to)
  assert.ok(article, 'Expected the migrated digital-signature article')
  const destination = encodeURI(article.canonicalPath)
  for (const slug of [migration.from, encodeURIComponent(migration.from)]) {
    for (const suffix of ['_(explainCKBot)', '_%28explainCKBot%29']) {
      await assertSingleRedirect(route, `/knowledge-base/${slug}${suffix}`, destination)
    }
  }
  for (const suffix of ['', '_(explainCKBot)', '_%28explainCKBot%29']) {
    await assertSingleRedirect(
      route,
      `/knowledge-base/secp256k1_a_key%20algorithm${suffix}`,
      '/knowledge-base/secp256k1_a_key_algorithm',
    )
  }
})

test('redirects retain incoming query parameters and do not leak internal routing parameters', async () => {
  const query = '?utm_source=legacy&term=a%20b&tag=first&tag=second'
  const result = await route(`/fr/knowledge-base/BFT_consensus_mechanisms_%28explainCKBot%29${query}`)
  assert.equal(result.status, 308)
  const location = new URL(result.location, 'https://www.nervos.org')
  assert.equal(location.pathname, '/knowledge-base/bft_consensus_mechanisms')
  assert.deepEqual([...location.searchParams], [...new URL(`https://www.nervos.org/${query}`).searchParams])
  assert.equal(
    [...location.searchParams.keys()].some(key => /^__next|^(locale|oldSlug|legacy)$/.test(key)),
    false,
  )
})

test('unknown complete legacy suffixes strip once and the existing article loader returns notFound', async () => {
  for (const locale of i18n.locales) {
    const destination = `${locale === 'en' ? '' : `/${locale}`}/knowledge-base/d01_unknown_article`
    for (const suffix of ['_(explainCKBot)', '_%28explainCKBot%29']) {
      await assertSingleRedirect(route, `/${locale}/knowledge-base/d01_unknown_article${suffix}`, destination)
    }
    assert.deepEqual(await loadArticle(destination), { notFound: true })
  }
})

test('excluded malformed URLs are not guessed into published articles', async () => {
  const normalizationExceptions = new Set(fixture.trailingSlashNormalization)
  for (const [row, source] of fixture.unmapped) {
    if (normalizationExceptions.has(source)) continue
    let destination = source
    for (let count = 0; count < 3; count++) {
      const result = await route(destination)
      if (!result.status) break
      assert.equal(result.status, 308, `Excluded row ${row}`)
      destination = result.location
      assert.ok(count < 2, `Unexpected redirect chain for excluded row ${row}`)
    }
    assert.equal(publishedPaths.has(destination), false, `Excluded row ${row} was guessed into ${destination}`)
    const { pathname } = normalizeLocalePath(destination, i18n.locales)
    if (/^\/knowledge-base\/[^/]+$/.test(pathname)) {
      assert.deepEqual(await loadArticle(destination), { notFound: true }, `Excluded row ${row}: ${destination}`)
    }
  }
})

test('four excluded complete suffixes with trailing slashes retain Next built-in normalization first', async () => {
  assert.equal(fixture.trailingSlashNormalization.length, 4)
  const excluded = new Set(fixture.unmapped.map(([, source]) => source))
  for (const source of fixture.trailingSlashNormalization) {
    assert.ok(excluded.has(source))
    assert.ok(source.endsWith('/'))
    const normalized = source.slice(0, -1)
    assert.deepEqual(await route(source), { status: 308, location: normalized })
    const final = await route(normalized)
    assert.equal(final.status, 308)
    assert.ok(publishedPaths.has(final.location), source)
    assert.equal((await route(final.location)).status, undefined)
  }
})

test('draft and scheduled translations stay unavailable instead of falling back to English', async () => {
  const original = catalog.articles.find(article => article.language === 'en' && isPublished(article))
  const fixtureArticle = (id, language, overrides = {}) => ({
    ...original,
    id,
    language,
    canonicalPath: `${language === 'en' ? '' : `/${language}`}/knowledge-base/${id}`,
    date: '2020-01-01T00:00:00Z',
    ...overrides,
  })
  const articles = [
    ...catalog.articles,
    fixtureArticle('d01_draft_translation', 'en'),
    fixtureArticle('d01_draft_translation', 'zh', { draft: true }),
    fixtureArticle('d01_future_translation', 'en'),
    fixtureArticle('d01_future_translation', 'zh', { date: '2999-01-01T00:00:00Z' }),
  ]
  const fixtureRoute = await routerFor(kbLegacyRedirects({ articles, ...i18n, now }))
  const fixtureLoader = articleLoader(articles)
  for (const id of ['d01_draft_translation', 'd01_future_translation']) {
    const destination = `/zh/knowledge-base/${id}`
    await assertSingleRedirect(fixtureRoute, `${destination}_(explainCKBot)`, destination)
    assert.deepEqual(await fixtureLoader(destination), { notFound: true })
    await assertSingleRedirect(fixtureRoute, `/fr/knowledge-base/${id}_(explainCKBot)`, `/knowledge-base/${id}`)
  }
})

test('D-18 old slugs do not publish drafts, scheduled articles or scheduled translations', async () => {
  const { from, to } = renames.find(({ from }) => from === 'BFT_consensus_mechanisms')
  for (const state of [{ draft: true }, { date: '2999-01-01T00:00:00Z' }]) {
    const allUnavailable = articleLoader(
      catalog.articles.map(article => (article.id === to ? { ...article, ...state } : article)),
    )
    for (const locale of i18n.locales) {
      assert.deepEqual(await allUnavailable(`/${locale}/knowledge-base/${from}`), { notFound: true })
      assert.deepEqual(await allUnavailable(`/${locale}/knowledge-base/${to}`), { notFound: true })
    }
    const translatedUnavailable = articleLoader(
      catalog.articles.map(article =>
        article.id === to && article.language === 'zh' ? { ...article, ...state } : article,
      ),
    )
    assert.deepEqual(await translatedUnavailable(`/zh/knowledge-base/${from}`), { notFound: true })
    assert.deepEqual(await translatedUnavailable(`/fr/knowledge-base/${from}`), {
      redirect: { destination: `/knowledge-base/${to}`, permanent: true },
    })
  }
})

test('D-18 generator rejects unmigrated sources and missing targets', () => {
  const { from, to } = renames[0]
  const original = catalog.articles.find(article => article.id === to && article.language === 'en')
  assert.throws(
    () =>
      kbLegacyRedirects({
        articles: [...catalog.articles, { ...original, id: from }],
        ...i18n,
        renames,
      }),
    /D-18 source article has not been migrated/,
  )
  assert.throws(
    () =>
      kbLegacyRedirects({
        articles: catalog.articles.filter(article => article.id !== to),
        ...i18n,
        renames,
      }),
    /Missing D-01 redirect target/,
  )
})

test('missing alias targets fail generation instead of shipping redirects to missing pages', () => {
  assert.throws(
    () =>
      kbLegacyRedirects({
        articles: catalog.articles.filter(article => article.id !== 'secp256k1_a_key_algorithm'),
        ...i18n,
        now,
      }),
    /Missing D-01 redirect target: secp256k1_a_key_algorithm/,
  )
})

test('scheduled alias targets are never treated as published redirect destinations', async () => {
  const target = 'secp256k1_a_key_algorithm'
  const articles = catalog.articles.map(article =>
    article.id === target ? { ...article, date: '2999-01-01T00:00:00Z' } : article,
  )
  const fixtureRoute = await routerFor(kbLegacyRedirects({ articles, ...i18n, now }))
  const fixtureLoader = articleLoader(articles)
  // The generic fallback intentionally accepts only ASCII slug characters.
  // A space-containing alias without a published target must remain unavailable.
  for (const suffix of ['', '_(explainCKBot)', '_%28explainCKBot%29']) {
    const source = `/knowledge-base/secp256k1_a_key%20algorithm${suffix}`
    assert.equal((await fixtureRoute(source)).status, undefined)
    assert.deepEqual(await fixtureLoader(source), { notFound: true })
  }
  assert.deepEqual(await fixtureLoader(`/knowledge-base/${target}`), { notFound: true })
})
