import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { DOMParser } from '@xmldom/xmldom'
import matter from 'gray-matter'
import ts from 'typescript'
import hubs from '../../scripts/fixtures/load-kb-hubs.mjs'
import * as siteIndexing from '../../config/site-indexing.mjs'
import i18nConfig from '../../next-i18next.config.js'

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8')
const element = React.createElement
const origin = 'https://www.nervos.org'
const Head = ({ children }) => element(React.Fragment, null, children)
const styles = new Proxy({}, { get: (_, key) => key })

function load(filename, imports = {}) {
  const { outputText } = ts.transpileModule(read(filename), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(
    name =>
      name.endsWith('/utils/breakpoints')
        ? { DESKTOP_QUERY: '(min-width: 1024px)' }
        : Object.hasOwn(imports, name)
          ? imports[name]
          : require(name),
    loaded,
    loaded.exports,
  )
  return loaded.exports
}

const sharing = load('src/utils/sharing-urls.ts')
const description = load('src/utils/meta-description.ts')
const structured = load('src/server/structured-data.ts', {
  '../utils/sharing-urls': sharing,
  '../utils/meta-description': description,
  '../utils/kb-hubs': hubs,
})
const content = load('src/server/kb-content.ts')
const makeSEO = (articleAPI = content) =>
  load('src/server/page-seo.ts', {
    '../utils/sharing-urls': sharing,
    '../utils/kb-hubs': hubs,
    '../../config/site-indexing.mjs': siteIndexing,
    './kb-content': articleAPI,
    './structured-data': structured,
    '../../next-i18next.config': i18nConfig,
  })
const seo = makeSEO()
const { PageSEO, serializeStructuredData } = load('src/components/PageSEO/index.tsx', {
  'next/head': Head,
  'next/router': {},
  react: React,
})
const headingModule = load('src/components/KnowledgeHub/markdown-headings.ts')
const { ContentArticle } = load('src/components/KnowledgeHub/ContentArticle.tsx', {
  clsx: (...values) => values.filter(Boolean).join(' '),
  react: React,
  'next/image': ({ unoptimized: _unoptimized, ...props }) => element('img', props),
  'next/link': 'a',
  'next/router': { useRouter: () => ({}) },
  'react-markdown': ReactMarkdown,
  'remark-gfm': remarkGfm,
  'rehype-raw': rehypeRaw,
  'rehype-sanitize': { __esModule: true, default: rehypeSanitize, defaultSchema },
  './Home': { Icon: () => null, PreviewNotice: () => null },
  './Shared': {
    PreviewPage: ({ children }) => element('main', null, children),
    DiscoverBanner: () => null,
    useActiveSection: () => '',
  },
  './Components': { ArticleCard: () => null, ArrowButton: 'a' },
  './ArticleLanguageSwitch': { ArticleLanguageSwitch: () => null },
  '../Header/KnowledgeHeader': { LanguageToggle: () => null },
  './reading-progress': load('src/components/KnowledgeHub/reading-progress.ts'),
  './article-discover-experiment': load('src/components/KnowledgeHub/article-discover-experiment.ts'),
  './ArticleLanguageLink': {
    ArticleLanguageLink: ({ article: _article, ...props }) => element('a', props),
    ArticleContentLink: ({ languagesByArticle: _languages, currentLanguage: _language, ...props }) =>
      element('a', props),
  },
  './content': { articlePath: article => article.canonicalPath, formatArticleDate: () => 'Existing date' },
  './article-v2.module.scss': styles,
  './pages-v2.module.scss': styles,
  './markdown-headings': headingModule,
  './article-features': { articleSocialActionsEnabled: false },
  './analytics': { trackKBEvent: () => undefined },
  '../../utils/kb-hubs': hubs,
})

function graphFrom(html) {
  const scripts = Array.from(html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))
  assert.equal(scripts.length, 1, 'Exactly one structured-data script belongs in the head')
  return JSON.parse(scripts[0][1])
}

const fixtureArticle = {
  id: 'Original_Article',
  title: 'Existing title',
  subtitle: 'Existing summary',
  description: '',
  canonicalPath: '/knowledge-base/Original_Article',
  language: 'en',
  authors: [],
  hub: null,
  coverImage: '/education_hub_articles/Original_Article/images/cover.png',
  date: '2020-01-01T00:00:00.000Z',
}

test('home uses only handoff organization details; contact, language guesses and FAQ are not invented', () => {
  const nodes = structured.homepageStructuredData()
  assert.deepEqual(
    nodes.map(node => node['@type']),
    ['Organization', 'WebSite'],
  )
  const [organization, website] = nodes
  assert.equal(organization['@id'], `${origin}/#org`)
  assert.equal(organization.logo, `${origin}/favicon.svg`)
  assert.deepEqual(organization.alternateName, ['Nervos', 'Nervos CKB', 'CKB'])
  assert.equal(organization.sameAs.length, 8)
  for (const key of ['email', 'address', 'telephone', 'contactPoint'])
    assert.equal(Object.hasOwn(organization, key), false)
  assert.equal(website.url, `${origin}/`)
  assert.deepEqual(website.publisher, { '@id': organization['@id'] })
  assert.equal(Object.hasOwn(website, 'inLanguage'), false)
  for (const route of ['/', '/home']) {
    for (const language of i18nConfig.i18n.locales) {
      const metadata = seo.getPageSEO(route, language)
      const html = renderToStaticMarkup(element(PageSEO, { seo: metadata }))
      assert.deepEqual(graphFrom(html), { '@context': 'https://schema.org', '@graph': nodes })
    }
  }
})

test('the eight English KB landing pages render real CollectionPage and ordered BreadcrumbList metadata', () => {
  const catalog = JSON.parse(read('public/education_hub_articles/metadata/catalog.json'))
  const pages = [
    { route: '/knowledge-base', pathname: '/knowledge-base', name: 'Knowledge Base' },
    { route: '/knowledge-base/start-here', pathname: '/knowledge-base/start-here', name: 'Start Here' },
    ...hubs.KB_HUBS.map(hub => ({
      route: '/knowledge-base/topic',
      pathname: hubs.kbHubPath(hub.id),
      name: catalog.hubs.find(item => item.id === hub.id).heading,
      hubId: hub.id,
    })),
  ]
  assert.equal(pages.length, 8)
  const before = JSON.stringify(catalog)
  for (const { route, pathname, name, hubId } of pages) {
    const metadata = seo.getPageSEO(route, 'zh', { catalog, hubId })
    const canonical = `${origin}${pathname}`
    const main = element('main', null, element('h1', null, name), element('p', null, 'Existing collection content'))
    const document = current =>
      renderToStaticMarkup(
        element('html', null, element('head', null, element(PageSEO, { seo: current })), element('body', null, main)),
      )
    const html = document(metadata)
    const { structuredData: _nodes, ...withoutStructuredData } = metadata
    assert.equal(
      html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, ''),
      document(withoutStructuredData),
      'Metadata must not alter the existing page markup',
    )
    const nodes = graphFrom(html)['@graph']
    assert.deepEqual(
      nodes.map(node => node['@type']),
      ['CollectionPage', 'BreadcrumbList'],
    )
    const [collection, breadcrumb] = nodes
    assert.equal(collection.name, name)
    assert.equal(collection.url, canonical)
    assert.equal(collection['@id'], `${canonical}#collection`)
    assert.equal(collection.inLanguage, 'en')
    assert.deepEqual(collection.isPartOf, { '@id': `${origin}/#website` })
    assert.deepEqual(collection.breadcrumb, { '@id': breadcrumb['@id'] })
    assert.equal(breadcrumb['@id'], `${canonical}#breadcrumb`)
    const items = breadcrumb.itemListElement
    assert.deepEqual(
      items.map(item => item.position),
      items.map((_, index) => index + 1),
    )
    assert.equal(items.length, route === '/knowledge-base' ? 2 : 3)
    assert.equal(items[0].item, `${origin}/`)
    assert.equal(items[1].item, `${origin}/knowledge-base`)
    assert.equal(items.at(-1).item, canonical)
    assert.equal(items.at(-1).name, name)
    for (const key of ['headline', 'author', 'datePublished', 'dateModified']) {
      assert.equal(Object.hasOwn(collection, key), false, `Collection must not fabricate ${key}`)
    }
    assert.doesNotMatch(JSON.stringify(nodes), /localhost|preview\.example|\?hub=|\?sort_by=/)
  }
  assert.equal(JSON.stringify(catalog), before, 'Structured data must not modify the content catalog')
})

test('collection metadata rejects noncanonical paths and safely serializes supplied topic headings', () => {
  const hub = hubs.KB_HUBS[0]
  const canonical = `${origin}${hubs.kbHubPath(hub.id)}`
  for (const route of ['/', '/knowledge-base/articles', '/knowledge-base/search', '/zh/knowledge-base', '/unknown']) {
    assert.deepEqual(structured.kbCollectionStructuredData(route, `${origin}${route}`), [])
  }
  for (const hubId of [undefined, 'unknown', hub.name]) {
    assert.deepEqual(structured.kbCollectionStructuredData('/knowledge-base/topic', canonical, { hubId }), [])
  }
  for (const url of [
    canonical.replace(origin, 'https://preview.example'),
    `${canonical}?hub=legacy`,
    `${canonical}#subject`,
    canonical.replace('/knowledge-base', '/zh/knowledge-base'),
  ]) {
    assert.deepEqual(structured.kbCollectionStructuredData('/knowledge-base/topic', url, { hubId: hub.id }), [])
  }
  const attack = '</script><script>alert("unsafe")</script>'
  const metadata = seo.getPageSEO('/knowledge-base/topic', 'en', {
    hubId: hub.id,
    catalog: { hubs: [{ ...hub, heading: attack }] },
  })
  const html = renderToStaticMarkup(element(PageSEO, { seo: metadata }))
  assert.equal((html.match(/<script/g) ?? []).length, 1)
  assert.equal((html.match(/<\/script>/g) ?? []).length, 1)
  assert.doesNotMatch(html, /<script>alert/)
  assert.equal(graphFrom(html)['@graph'][0].name, attack)
})

test('every current published rendition renders canonical Article and genuine Hub breadcrumbs without changing main markup', () => {
  const catalog = JSON.parse(read('public/education_hub_articles/metadata/catalog.json'))
  const published = catalog.articles.filter(
    article => !article.draft && (!article.date || Date.parse(article.date) <= Date.now()),
  )
  assert.ok(published.length > 0, 'The real-content integration must exercise published articles')
  let withHub = 0
  let withoutHub = 0
  for (const article of published) {
    const raw = read(`public/education_hub_articles/${article.sourceFile}`)
    const before = JSON.stringify(article)
    const metadata = seo.getPageSEO('/knowledge-base/[slug]', article.language, { article, preview: false })
    const main = element(ContentArticle, {
      article,
      markdown: matter(raw).content,
      headings: [],
      subjects: [],
      hub: catalog.hubs.find(hub => hub.id === article.hub) ?? null,
      related: [],
      preview: false,
    })
    const document = current =>
      renderToStaticMarkup(
        element('html', null, element('head', null, element(PageSEO, { seo: current })), element('body', null, main)),
      )
    const html = document(metadata)
    const { structuredData: _nodes, ...withoutStructuredData } = metadata
    assert.equal(
      html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, ''),
      document(withoutStructuredData),
      article.sourceFile,
    )
    const nodes = graphFrom(html)['@graph']
    assert.equal(nodes.length, 2)
    const [schema, breadcrumb] = nodes
    assert.equal(schema['@type'], 'Article')
    assert.equal(schema.headline, article.title)
    assert.equal(schema.inLanguage, article.language)
    assert.equal(schema.mainEntityOfPage, `${origin}${article.canonicalPath}`)
    assert.equal(schema.image, sharing.sharingImageUrl(article.coverImage))
    assert.equal(schema.datePublished, article.date)
    const expectedDescription = description.metaDescription(article.description?.trim() || article.subtitle)
    assert.equal(schema.description, expectedDescription || undefined)
    assert.deepEqual(schema.publisher, {
      '@type': 'Organization',
      '@id': `${origin}/#org`,
      name: 'Nervos Network',
      url: `${origin}/`,
    })
    for (const key of ['author', 'dateModified']) assert.equal(Object.hasOwn(schema, key), false)
    assert.equal(breadcrumb['@type'], 'BreadcrumbList')
    const items = breadcrumb.itemListElement
    assert.deepEqual(
      items.map(item => item.position),
      items.map((_, index) => index + 1),
    )
    assert.equal(items[0].item, `${origin}/knowledge-base`)
    assert.equal(items.at(-1).item, schema.mainEntityOfPage)
    assert.equal(items.at(-1).name, article.title)
    if (article.hub) {
      withHub++
      assert.equal(items.length, 3)
      assert.equal(items[1].item, `${origin}${hubs.kbHubPath(article.hub)}`)
      assert.equal(items[1].name, hubs.resolveKBHub(article.hub).name)
    } else {
      withoutHub++
      assert.equal(items.length, 2)
    }
    assert.doesNotMatch(JSON.stringify(nodes), /\?sort_by=|\?hub=|localhost|preview\.example/)
    assert.equal(JSON.stringify(article), before, 'Metadata must not modify source data')
    assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), article.sourceSHA256)
  }
  assert.equal(withHub, published.filter(article => article.hub).length)
  assert.equal(withoutHub, published.filter(article => !article.hub).length)
  assert.equal(withHub + withoutHub, published.length)
})

test('optional article fields omit unavailable data and retain the D08 description contract', () => {
  for (const [input, expected] of [
    [{ description: '  Independent SEO copy  ', subtitle: 'Visible summary' }, 'Independent SEO copy'],
    [{ description: '  ', subtitle: 'Visible summary' }, 'Visible summary'],
    [{ description: '', subtitle: '' }, undefined],
    [{ description: 'word '.repeat(100) }, description.metaDescription('word '.repeat(100))],
    [{ description: '安全'.repeat(100) }, description.metaDescription('安全'.repeat(100))],
  ]) {
    const [schema] = structured.articleStructuredData(
      { ...fixtureArticle, ...input },
      `${origin}${fixtureArticle.canonicalPath}`,
    )
    assert.equal(schema.description, expected)
    assert.ok(!schema.description || Array.from(schema.description).length <= 155)
  }
  const [minimal, breadcrumb] = structured.articleStructuredData(
    { ...fixtureArticle, date: 'invalid', coverImage: null, hub: 'not-a-real-hub' },
    `${origin}${fixtureArticle.canonicalPath}`,
  )
  for (const key of ['image', 'datePublished', 'dateModified', 'author'])
    assert.equal(Object.hasOwn(minimal, key), false)
  assert.equal(breadcrumb.itemListElement.length, 2)
  assert.deepEqual(
    structured.articleStructuredData({ ...fixtureArticle, title: ' ' }, `${origin}/knowledge-base/example`),
    [],
  )
})

test('JSON-LD remains valid JSON and cannot terminate its script through article text', () => {
  const attack = '</script><script>alert("unsafe")</script><img src=x onerror=alert(1)>&\u2028\u2029'
  const nodes = structured.articleStructuredData(
    { ...fixtureArticle, title: attack, description: attack },
    `${origin}${fixtureArticle.canonicalPath}`,
  )
  const metadata = {
    canonical: `${origin}${fixtureArticle.canonicalPath}`,
    language: 'en',
    alternates: [],
    structuredData: nodes,
  }
  const html = renderToStaticMarkup(element(PageSEO, { seo: metadata }))
  assert.equal((html.match(/<script/g) ?? []).length, 1)
  assert.equal((html.match(/<\/script>/g) ?? []).length, 1)
  assert.doesNotMatch(html, /<img|onerror=alert\(1\)>|<script>alert/)
  assert.deepEqual(graphFrom(html)['@graph'], nodes)
  const serialized = serializeStructuredData({ text: attack })
  assert.doesNotMatch(serialized, /[<>&\u2028\u2029]/)
  assert.equal(JSON.parse(serialized).text, attack)
  const doc = new DOMParser().parseFromString(`<html><head>${html}</head></html>`, 'text/html')
  assert.equal(doc.getElementsByTagName('script').length, 1)
  assert.equal(doc.getElementsByTagName('img').length, 0)
})

test('preview, unavailable renditions, non-article pages, redirects and 404s do not acquire a fake Article', async () => {
  const api = makeSEO({
    getKBArticleStatus: (_id, language) => (language === 'en' ? 'published' : 'unpublished'),
    getKBArticle: (_id, language) => (language === 'en' ? 'Published body' : null),
  })
  for (const [route, props] of [
    ['/knowledge-base/[slug]', { article: fixtureArticle, preview: true }],
    ['/kb/article/[slug]', { article: fixtureArticle }],
    ['/knowledge-base/[slug]', { article: { ...fixtureArticle, language: 'zh' } }],
  ])
    assert.equal(Object.hasOwn(api.getPageSEO(route, 'en', props), 'structuredData'), false)
  for (const route of ['/ckbpage', '/knowledge-base/search', '/knowledge-base/articles']) {
    assert.equal(Object.hasOwn(api.getPageSEO(route, 'en'), 'structuredData'), false)
  }
  for (const [route, props] of [
    ['/knowledge-base', {}],
    ['/knowledge-base/start-here', {}],
    ...hubs.KB_HUBS.map(hub => ['/knowledge-base/topic', { hubId: hub.id }]),
  ]) {
    assert.equal(Object.hasOwn(api.getPageSEO(route, 'en', { ...props, preview: true }), 'structuredData'), false)
    assert.equal(
      api.getPageSEO(route, 'en', props).structuredData.some(node => node['@type'] === 'Article'),
      false,
    )
  }
  for (const wrapper of [api.withStaticPageSEO, api.withServerPageSEO]) {
    for (const result of [
      { notFound: true },
      { redirect: { destination: '/knowledge-base/existing', permanent: true } },
    ]) {
      for (const route of [
        '/knowledge-base/[slug]',
        '/knowledge-base',
        '/knowledge-base/start-here',
        '/knowledge-base/topic',
      ]) {
        assert.equal(await wrapper(route, async () => result)({ locale: 'en' }), result)
      }
    }
  }
})

test('the client head renderer has no article repository or server-module dependency', () => {
  const component = read('src/components/PageSEO/index.tsx')
  const ast = ts.createSourceFile('PageSEO.tsx', component, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const imports = ast.statements.filter(ts.isImportDeclaration)
  assert.deepEqual(
    imports.map(node => node.moduleSpecifier.text),
    ['next/head', 'next/router', 'react', '../../utils/page-seo'],
  )
  assert.ok(imports.at(-1).importClause.isTypeOnly, 'The page data contract must not import server runtime code')
  assert.doesNotMatch(component, /catalog\.json|education_hub_articles|server\//)
})
