import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'
import { DOMParser } from '@xmldom/xmldom'
import { createSitemapEntries, loadSitemapEntries, renderSitemap, escapeXml } from './generate-sitemap.mjs'
import hubs from './fixtures/load-kb-hubs.mjs'
import * as siteIndexing from '../config/site-indexing.mjs'
import i18nConfig from '../next-i18next.config.js'

const origin = 'https://www.nervos.org'
const catalog = JSON.parse(fs.readFileSync('public/education_hub_articles/metadata/catalog.json', 'utf8'))
const require = createRequire(import.meta.url)
function load(filename, dependencies = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(
    name => dependencies[name] ?? require(name),
    loaded,
    loaded.exports,
  )
  return loaded.exports
}
const content = load('src/server/kb-content.ts')
const seo = load('src/server/page-seo.ts', {
  '../utils/sharing-urls': load('src/utils/sharing-urls.ts'),
  '../utils/kb-hubs': hubs,
  '../../config/site-indexing.mjs': siteIndexing,
  '../../next-i18next.config': i18nConfig,
  './kb-content': content,
  './structured-data': load('src/server/structured-data.ts', {
    '../utils/sharing-urls': load('src/utils/sharing-urls.ts'),
    '../utils/meta-description': load('src/utils/meta-description.ts'),
    '../utils/kb-hubs': hubs,
  }),
})
const entries = loadSitemapEntries()
const fixture = (id, language = 'en', extra = {}) => ({
  id,
  language,
  date: '2020-01-01T00:00:00Z',
  draft: false,
  canonicalPath: `${language === 'en' ? '' : `/${language}`}/knowledge-base/${id}`,
  ...extra,
})

test('every generated URL and alternate matches the real page SEO policy', () => {
  const paths = new Set(entries.map(entry => new URL(entry.loc).pathname + new URL(entry.loc).search))
  assert.equal(paths.size, entries.length)
  let articles = 0
  for (const entry of entries) {
    const url = new URL(entry.loc)
    assert.equal(url.origin, origin)
    assert.equal(url.hash, '')
    assert.doesNotMatch(url.pathname, /^\/(en|kb)(\/|$)/)
    let route = url.pathname
    const language =
      i18nConfig.i18n.locales.find(locale => route === `/${locale}` || route.startsWith(`/${locale}/`)) ?? 'en'
    if (language !== 'en') route = route.slice(language.length + 1) || '/'
    const article = catalog.articles.find(item => item.canonicalPath === url.pathname)
    let props = {}
    if (article) {
      props = { article }
      articles++
      assert.equal(entry.lastmod, article.date)
    } else if (route === '/knowledge-base/articles') {
      props = { catalog: content.getKBCatalog(language), page: Number(url.searchParams.get('page') ?? 1) }
    } else if (route.startsWith('/knowledge-base/topic/')) {
      props = { hubId: route.split('/').at(-1) }
      route = '/knowledge-base/topic'
    }
    const actual = seo.getPageSEO(route, language, props)
    assert.equal(entry.loc, actual.canonical, entry.loc)
    assert.deepEqual(entry.alternates, actual.alternates, entry.loc)
    for (const alternate of entry.alternates) {
      const counterpart = entries.find(item => item.loc === alternate.url)
      assert(counterpart, `Missing alternate target: ${alternate.url}`)
      assert.deepEqual(counterpart.alternates, entry.alternates)
    }
  }
  const published = i18nConfig.i18n.locales.flatMap(locale => content.getKBCatalog(locale).articles)
  assert.equal(articles, published.length)
  assert.equal(entries.length, 390, 'Current reviewed snapshot; re-audit after a content update')
  for (const hub of hubs.KB_HUBS) assert(paths.has(hubs.kbHubPath(hub.id)))
  for (const excluded of [
    '/home',
    '/kb',
    '/knowledge-base/search',
    '/knowledge-base?sort_by=latest',
    '/knowledge-base?page=2',
    '/knowledge-base/articles?page=1',
    '/knowledge-base/articles?page=10',
    '/zh/knowledge-base/topic/nervos-ckb',
    '/fr/knowledge-base/articles',
    '/ko',
    '/tr',
    '/zh/media-kit',
  ])
    assert(!paths.has(excluded), excluded)
  for (const included of [
    '/knowledge-base/articles?page=9',
    '/zh/knowledge-base/articles?page=3',
    '/es/knowledge-base/articles?page=2',
    '/ko/journey',
    '/tr/journey',
  ])
    assert(paths.has(included), included)
})

test('build snapshot omits drafts/future/unconfigured translations and never fabricates an English rendition', () => {
  const articles = [
    fixture('published'),
    fixture('published', 'zh'),
    fixture('published', 'es', { draft: true }),
    fixture('future', 'en', { date: '2999-01-01' }),
    fixture('undated', 'en', { date: null }),
    fixture('only-fr', 'fr'),
    fixture('not-configured', 'xx'),
  ]
  const generated = createSitemapEntries({ articles, corePages: [], now: Date.parse('2026-01-01') })
  assert(!generated.some(item => /future|not-configured|\/es\//.test(item.loc)))
  assert.equal(generated.find(item => item.loc.endsWith('/undated')).lastmod, undefined)
  assert.deepEqual(generated.find(item => item.loc.endsWith('/only-fr')).alternates, [
    { language: 'fr', url: `${origin}/fr/knowledge-base/only-fr` },
  ])
  assert.equal(generated.filter(item => item.loc.endsWith('/published')).length, 2)
  assert(generated.some(item => item.loc === `${origin}/fr/knowledge-base/articles`))
  assert(!generated.some(item => item.loc.includes('?page=')))
})

test('pagination is derived from 24 real published articles per page without empty pages or duplicate page 1', () => {
  for (const count of [0, 1, 24, 25, 48, 49]) {
    const articles = Array.from({ length: count }, (_, index) => fixture(`item-${index}`))
    const generated = createSitemapEntries({ articles, corePages: [] })
    const archive = generated.filter(item => /\/articles(?:\?|$)/.test(item.loc))
    assert.equal(archive.length, Math.max(1, Math.ceil(count / 24)))
    assert.equal(archive[0].loc, `${origin}/knowledge-base/articles`)
    assert(archive.every(item => item.alternates.length === 0))
  }
})

test('stable XML is well formed, escaped, namespaced, and never assigns build dates to core pages', () => {
  const xml = renderSitemap(entries)
  const errors = []
  const document = new DOMParser({ errorHandler: message => errors.push(message) }).parseFromString(
    xml,
    'application/xml',
  )
  assert.deepEqual(errors, [])
  assert.equal(document.documentElement.namespaceURI, 'http://www.sitemaps.org/schemas/sitemap/0.9')
  assert.equal(document.getElementsByTagName('url').length, entries.length)
  assert(document.getElementsByTagNameNS('http://www.w3.org/1999/xhtml', 'link').length > 0)
  assert.equal(entries.find(item => item.loc === `${origin}/`).lastmod, undefined)
  assert.equal(xml, renderSitemap(loadSitemapEntries()))
  assert.equal(escapeXml('&<>"\''), '&amp;&lt;&gt;&quot;&apos;')
  assert.throws(() => renderSitemap(Array(50_001).fill(entries[0])), /50,000/)
  assert.throws(
    () => createSitemapEntries({ articles: [fixture('duplicate'), fixture('duplicate')], corePages: [] }),
    /Duplicate/,
  )
  assert.throws(
    () =>
      createSitemapEntries({
        articles: [fixture('wrong', 'en', { canonicalPath: '/en/knowledge-base/wrong' })],
        corePages: [],
      }),
    /Non-canonical/,
  )
})

test('a stale catalog, missing source, or old migration identity fails instead of publishing a broken sitemap', t => {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-sitemap-test-'))
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  const root = path.join(repository, 'public/education_hub_articles')
  fs.mkdirSync(path.join(root, 'metadata'), { recursive: true })
  fs.mkdirSync(path.join(root, 'example'), { recursive: true })
  const raw = '---\ntitle: example\n---\nBody\n'
  fs.writeFileSync(path.join(root, 'example/index.md'), raw)
  const article = {
    ...fixture('example'),
    sourceFile: 'example/index.md',
    sourceSHA256: crypto.createHash('sha256').update(raw).digest('hex'),
  }
  const save = articles => fs.writeFileSync(path.join(root, 'metadata/catalog.json'), JSON.stringify({ articles }))
  fs.writeFileSync(path.join(root, 'metadata/slug-migrations.json'), JSON.stringify({ renames: [] }))
  save([article])
  assert(loadSitemapEntries(repository).some(item => item.loc.endsWith('/example')))
  save([])
  assert.throws(() => loadSitemapEntries(repository), /stale/)
  save([{ ...article, sourceSHA256: 'stale' }])
  assert.throws(() => loadSitemapEntries(repository), /stale/)
  save([{ ...article, date: 'not-a-date' }])
  assert.throws(() => loadSitemapEntries(repository), /Invalid article date/)
  save([article])
  fs.renameSync(path.join(root, 'example/index.md'), path.join(root, 'example/index.md.saved'))
  assert.throws(() => loadSitemapEntries(repository), /stale/)
  fs.renameSync(path.join(root, 'example/index.md.saved'), path.join(root, 'example/index.md'))
  fs.writeFileSync(
    path.join(root, 'metadata/slug-migrations.json'),
    JSON.stringify({ renames: [{ from: 'example', to: 'renamed' }] }),
  )
  assert.throws(() => loadSitemapEntries(repository), /Redirect source/)
})

test('normal build and dev commands generate the snapshot before starting Next', () => {
  const { scripts } = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  for (const name of ['build', 'dev']) {
    assert(scripts[name].includes('node scripts/generate-sitemap.mjs && next '), name)
  }
  assert.equal(scripts['sitemap:generate'], 'node scripts/generate-sitemap.mjs')
})
