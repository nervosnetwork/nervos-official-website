import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import ts from 'typescript'
import hubs from '../../scripts/fixtures/load-kb-hubs.mjs'
import * as siteIndexing from '../../config/site-indexing.mjs'

const repository = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)
const config = require('../../next-i18next.config.js')

const languages = config.i18n.locales
const origin = 'https://www.nervos.org'
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const compiled = new Map()

function load(relative, imports = {}, runtimeProcess = { cwd: () => repository }) {
  if (!compiled.has(relative)) {
    compiled.set(
      relative,
      ts.transpileModule(fs.readFileSync(path.join(repository, relative), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      }).outputText,
    )
  }
  const loadedModule = { exports: {} }
  new Function('require', 'module', 'exports', 'process', compiled.get(relative))(
    name => (Object.hasOwn(imports, name) ? imports[name] : require(name)),
    loadedModule,
    loadedModule.exports,
    runtimeProcess,
  )
  return loadedModule.exports
}

const sharing = load('src/utils/sharing-urls.ts')
const structuredData = load('src/server/structured-data.ts', {
  '../utils/sharing-urls': sharing,
  '../utils/meta-description': load('src/utils/meta-description.ts'),
  '../utils/kb-hubs': hubs,
})
const content = load('src/server/kb-content.ts')
const makeSEO = (articleAPI = content) =>
  load('src/server/page-seo.ts', {
    '../utils/sharing-urls': sharing,
    '../utils/kb-hubs': hubs,
    '../../config/site-indexing.mjs': siteIndexing,
    './kb-content': articleAPI,
    './structured-data': structuredData,
    '../../next-i18next.config': config,
  })
const seo = makeSEO()
const articleURL = (id, language) => `${origin}${language === 'en' ? '' : `/${language}`}/knowledge-base/${id}`
const alternatives = (route, available) => [
  ...available.map(language => ({
    language,
    url: `${origin}${language === 'en' ? '' : `/${language}`}${route === '/' && language !== 'en' ? '' : route}`,
  })),
  ...(available.includes('en') ? [{ language: 'x-default', url: `${origin}${route}` }] : []),
]

test('all 320 real article renditions use actual language, one canonical and reciprocal published translation sets', () => {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(repository, 'public/education_hub_articles/metadata/catalog.json'), 'utf8'),
  )
  const published = catalog.articles.filter(
    article => !article.draft && (!article.date || Date.parse(article.date) <= Date.now()),
  )
  assert.equal(published.length, 320)
  const byID = new Map()
  for (const article of published) {
    const group = byID.get(article.id) ?? []
    group.push(article)
    byID.set(article.id, group)
  }
  let checked = 0
  for (const [id, renditions] of byID) {
    const expectedLanguages = languages.filter(language => renditions.some(article => article.language === language))
    const expectedAlternates = alternatives(`/knowledge-base/${id}`, expectedLanguages)
    let previousAlternates
    for (const article of renditions) {
      const before = JSON.stringify(article)
      const result = seo.getPageSEO('/knowledge-base/[slug]', 'unrelated-request-locale', { article })
      assert.equal(result.language, article.language)
      assert.equal(result.canonical, `${origin}${article.canonicalPath}`)
      assert.deepEqual(result.alternates, expectedAlternates)
      if (previousAlternates) assert.deepEqual(result.alternates, previousAlternates, `Reciprocity: ${id}`)
      previousAlternates = result.alternates
      assert.ok(result.alternates.some(item => item.language === article.language && item.url === result.canonical))
      assert.equal(new Set(result.alternates.map(item => item.language)).size, result.alternates.length)
      for (const url of [result.canonical, ...result.alternates.map(item => item.url)]) {
        const parsed = new URL(url)
        assert.equal(parsed.origin, origin)
        assert.equal(parsed.search, '')
        assert.equal(parsed.hash, '')
        assert.doesNotMatch(parsed.pathname, /^\/en(?:\/|$)/)
      }
      assert.equal(JSON.stringify(article), before, 'Metadata generation must not mutate content')
      checked++
    }
  }
  assert.equal(checked, 320)
})

// Exercise the real publication/hash-aware article loader with an in-memory
// source filesystem. No repository article, catalog or translation is edited.
function fixtureArticleAPI(entries) {
  const root = path.join(repository, 'public/education_hub_articles')
  const files = new Map()
  const articles = entries.map(({ id = 'Original_Article', language, draft = false, date = '2020-01-01' }) => {
    const sourceFile = `${id}/index${language === 'en' ? '' : `_${language}`}.md`
    const raw = `---\ntitle: ${language} title\n---\n\n${language} published article body.\n`
    files.set(path.join(root, sourceFile), raw)
    return {
      id,
      language,
      draft,
      date,
      canonicalPath: `${language === 'en' ? '' : `/${language}`}/knowledge-base/${id}`,
      sourceFile,
      sourceSHA256: hash(raw),
    }
  })
  files.set(path.join(root, 'metadata/catalog.json'), JSON.stringify({ articles }))
  const readonlyFS = {
    readFileSync(filename, encoding) {
      assert.equal(encoding, 'utf8')
      assert.ok(files.has(filename), `Unexpected fixture filesystem read: ${filename}`)
      return files.get(filename)
    },
  }
  return { articles, api: load('src/server/kb-content.ts', { 'node:fs': readonlyFS }) }
}

test('draft, future and missing translations stay out while newly published configured languages become reciprocal', () => {
  const fixture = fixtureArticleAPI([
    { language: 'en' },
    { language: 'zh' },
    { language: 'es', draft: true },
    { language: 'fr' },
    { language: 'tr', date: '2999-01-01' },
  ])
  assert.equal(fixture.api.getKBArticleStatus('Original_Article', 'es'), 'unpublished')
  assert.equal(fixture.api.getKBArticleStatus('Original_Article', 'tr'), 'unpublished')
  assert.equal(fixture.api.getKBArticleStatus('Original_Article', 'ko'), 'missing')
  const api = makeSEO(fixture.api)
  const expected = alternatives('/knowledge-base/Original_Article', ['en', 'zh', 'fr'])
  for (const article of fixture.articles.filter(article => ['en', 'zh', 'fr'].includes(article.language))) {
    const result = api.getPageSEO('/knowledge-base/[slug]', 'es', { article })
    assert.equal(result.language, article.language)
    assert.equal(result.canonical, articleURL(article.id, article.language))
    assert.deepEqual(result.alternates, expected)
  }
})

test('an alternate requires readable actual content as well as published metadata', () => {
  const checks = []
  const api = makeSEO({
    getKBArticleStatus(id, language) {
      assert.equal(id, 'available')
      return ['en', 'zh', 'fr'].includes(language) ? 'published' : 'missing'
    },
    getKBArticle(id, language) {
      checks.push([id, language])
      return language === 'zh' ? null : 'Actual content'
    },
  })
  const result = api.getPageSEO('/knowledge-base/[slug]', 'zh', {
    article: { id: 'available', language: 'en', canonicalPath: '/knowledge-base/available' },
  })
  assert.deepEqual(result.alternates, alternatives('/knowledge-base/available', ['en', 'fr']))
  assert.deepEqual(checks, [
    ['available', 'en'],
    ['available', 'zh'],
    ['available', 'fr'],
  ])
})

test('a translation-only fixture does not invent an English or x-default rendition', () => {
  const fixture = fixtureArticleAPI([{ language: 'fr' }])
  const result = makeSEO(fixture.api).getPageSEO('/knowledge-base/[slug]', 'en', {
    article: fixture.articles[0],
  })
  assert.deepEqual(result, {
    canonical: articleURL('Original_Article', 'fr'),
    language: 'fr',
    alternates: alternatives('/knowledge-base/Original_Article', ['fr']),
  })
})

test('article canonical removes preview hosts, tracking, fragments and explicit English prefix without rewriting the slug', () => {
  const fixture = fixtureArticleAPI([{ language: 'en' }, { language: 'zh' }])
  const api = makeSEO(fixture.api)
  for (const [language, canonicalPath, expected] of [
    ['en', '/en/knowledge-base/Original_Article?utm_source=preview#heading', articleURL('Original_Article', 'en')],
    [
      'zh',
      'https://preview.example/zh/knowledge-base/Original_Article?tracking=1#heading',
      articleURL('Original_Article', 'zh'),
    ],
  ]) {
    const result = api.getPageSEO('/knowledge-base/[slug]', 'fr', {
      article: { id: 'Original_Article', language, canonicalPath },
    })
    assert.equal(result.canonical, expected)
    assert.equal(result.language, language)
    assert.deepEqual(result.alternates, alternatives('/knowledge-base/Original_Article', ['en', 'zh']))
  }
})

test('core metadata uses real page namespace translations, not shared navigation or empty ko/tr home files', () => {
  const five = ['en', 'zh', 'es', 'fr', 'pt']
  const routes = ['/', '/home', '/ckbpage', '/wallets', '/mining', '/developers', '/community', '/learn', '/foundation']
  for (const route of routes) {
    const canonicalRoute = route === '/home' ? '/' : route
    for (const requested of [...languages, 'not-configured']) {
      const language = five.includes(requested) ? requested : 'en'
      const result = seo.getPageSEO(route, requested)
      assert.equal(result.language, language, `${route}: ${requested}`)
      assert.equal(result.canonical, alternatives(canonicalRoute, [language])[0].url)
      assert.deepEqual(result.alternates, alternatives(canonicalRoute, five))
    }
  }
  for (const requested of languages) {
    assert.deepEqual(seo.getPageSEO('/media-kit', requested), {
      canonical: `${origin}/media-kit`,
      language: 'en',
      alternates: alternatives('/media-kit', ['en']),
    })
    const journey = seo.getPageSEO('/journey', requested)
    assert.equal(journey.language, requested, 'Journey body is translated even when common navigation is not')
    assert.equal(journey.canonical, alternatives('/journey', [requested])[0].url)
    assert.deepEqual(journey.alternates, alternatives('/journey', languages))
  }
})

test('untranslated KB landing templates remain English and Hub canonicals use the six approved paths', () => {
  for (const requested of languages) {
    for (const route of ['/knowledge-base', '/knowledge-base/start-here']) {
      const props = { catalog: { articles: [{ language: 'zh' }] } }
      const before = JSON.stringify(props)
      assert.deepEqual(seo.getPageSEO(route, requested, props), {
        canonical: `${origin}${route}`,
        language: 'en',
        alternates: alternatives(route, ['en']),
      })
      assert.equal(JSON.stringify(props), before)
    }
    for (const { id: hubId } of hubs.KB_HUBS) {
      const route = `/knowledge-base/topic/${hubId}`
      assert.deepEqual(seo.getPageSEO('/knowledge-base/topic', requested, { hubId }), {
        canonical: `${origin}${route}`,
        language: 'en',
        alternates: alternatives(route, ['en']),
      })
    }
    assert.deepEqual(seo.getPageSEO('/knowledge-base/search', requested), {
      canonical: `${origin}/knowledge-base/search`,
      language: 'en',
      alternates: [],
    })
  }
})

test('archive keeps D-07 self-canonical pagination and real catalog language without claiming equivalent language pages', () => {
  for (const language of ['en', 'zh', 'es']) {
    for (const page of [1, 2, 3, 9]) {
      const props = { catalog: { articles: [{ language }] }, page }
      const before = JSON.stringify(props)
      const result = seo.getPageSEO('/knowledge-base/articles', 'fr', props)
      const suffix = page > 1 ? `?page=${page}` : ''
      assert.deepEqual(result, {
        canonical: `${origin}${language === 'en' ? '' : `/${language}`}/knowledge-base/articles${suffix}`,
        language,
        alternates: [],
      })
      assert.equal(JSON.stringify(props), before)
    }
  }
  for (const requested of languages) {
    assert.deepEqual(seo.getPageSEO('/knowledge-base/articles', requested, { catalog: { articles: [] } }), {
      canonical: `${origin}/knowledge-base/articles`,
      language: 'en',
      alternates: [],
    })
  }
})

test('static and server wrappers preserve original context and props, await promised props and add metadata only', async () => {
  for (const wrapper of [seo.withStaticPageSEO, seo.withServerPageSEO]) {
    for (const promised of [false, true]) {
      const context = {
        locale: 'zh',
        params: { slug: 'unchanged' },
        query: { page: '2', utm_source: 'preview', sort: 'oldest' },
        resolvedUrl: '/zh/knowledge-base/articles?page=2&utm_source=preview',
        req: { marker: 'original request' },
        res: { marker: 'original response' },
      }
      const props = { catalog: { articles: [{ language: 'es' }] }, page: 2, sentinel: { unchanged: true } }
      const before = JSON.stringify(props)
      let calls = 0
      const loader = async actual => {
        calls++
        assert.equal(actual, context, 'Loader receives the exact original request context')
        return { props: promised ? Promise.resolve(props) : props, revalidate: 120, marker: 'keep result fields' }
      }
      const result = await wrapper('/knowledge-base/articles', loader)(context)
      assert.equal(calls, 1)
      assert.equal(result.revalidate, 120)
      assert.equal(result.marker, 'keep result fields')
      assert.equal(result.props.catalog, props.catalog)
      assert.equal(result.props.sentinel, props.sentinel)
      assert.equal(result.props.page, 2)
      assert.deepEqual(result.props.pageSEO, {
        canonical: `${origin}/es/knowledge-base/articles?page=2`,
        language: 'es',
        alternates: [],
      })
      assert.equal(JSON.stringify(props), before)
      assert.equal(Object.hasOwn(props, 'pageSEO'), false)
      assert.deepEqual(context.query, { page: '2', utm_source: 'preview', sort: 'oldest' })
    }
  }
})

test('wrappers pass redirect and notFound results through unchanged and do not swallow loader failures', async () => {
  for (const wrapper of [seo.withStaticPageSEO, seo.withServerPageSEO]) {
    for (const result of [
      { redirect: { destination: '/knowledge-base/existing', permanent: true }, revalidate: 60 },
      { redirect: { destination: '/temporary', statusCode: 307 } },
      { notFound: true, revalidate: 30 },
    ]) {
      assert.equal(await wrapper('/', async () => result)({ locale: 'en' }), result)
    }
    const failure = new Error('Original loader failure')
    await assert.rejects(
      wrapper('/', async () => {
        throw failure
      })({ locale: 'en' }),
      error => error === failure,
    )
    await assert.rejects(
      wrapper('/', async () => ({ props: Promise.reject(failure) }))({ locale: 'en' }),
      error => error === failure,
    )
    const result = await wrapper('/ckbpage', async () => ({ props: { visible: 'unchanged' } }))({})
    assert.equal(result.props.pageSEO.language, 'en')
    assert.equal(result.props.pageSEO.canonical, `${origin}/ckbpage`)
  }
})
