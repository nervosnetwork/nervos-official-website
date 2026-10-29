import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const directory = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(directory, '../../..')
const archivePath = 'src/components/KnowledgeHub/ArticleArchive.tsx'
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, 'public/education_hub_articles/metadata/catalog.json'), 'utf8'),
)
const currentSource = fs.readFileSync(path.join(root, archivePath), 'utf8')
const previousSource = execFileSync('git', ['show', `HEAD:${archivePath}`], { cwd: root, encoding: 'utf8' })

function loadSource(source, imports = {}) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', compiled)(
    name => (Object.hasOwn(imports, name) ? imports[name] : require(name)),
    loaded,
    loaded.exports,
  )
  return loaded.exports
}

function loadArchive(source) {
  const events = []
  const { ArticleArchive } = loadSource(source, {
    react: { useState: value => [value, () => undefined] },
    'react/jsx-runtime': require('react/jsx-runtime'),
    clsx: (...values) => values.filter(Boolean).join(' '),
    'next/link': 'a',
    './Shared': { PreviewPage: 'PreviewPage', Breadcrumb: 'Breadcrumb' },
    './Components': { ArticleCard: 'ArticleCard' },
    './ArticleGridControls': { ArticleGridControls: 'ArticleGridControls' },
    './useHeroScroll': {
      useHeroScroll: () => ({ heroFade: 0.35, breadcrumbHeight: 42, breadcrumbRef: null }),
    },
    './pages-v2.module.scss': {
      __esModule: true,
      default: new Proxy({}, { get: (_, name) => `style-${String(name)}` }),
    },
    './analytics': { trackKBEvent: (name, data) => events.push({ name, data }) },
  })
  return { ArticleArchive, events }
}
const current = loadArchive(currentSource)
const previous = loadArchive(previousSource)
const content = loadSource(fs.readFileSync(path.join(root, 'src/components/KnowledgeHub/content.ts'), 'utf8'))
const source = loadSource(fs.readFileSync(path.join(root, 'src/server/kb-content.ts'), 'utf8'))
const { libraryProps } = loadSource(fs.readFileSync(path.join(root, 'src/server/kb-page.ts'), 'utf8'), {
  './kb-content': source,
  '../components/KnowledgeHub/content': content,
  'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
})

function archiveProps(language, page = 1) {
  const articles = catalog.articles
    .filter(
      article =>
        article.language === language && !article.draft && (!article.date || Date.parse(article.date) <= Date.now()),
    )
    .sort(content.byDate)
  return {
    catalog: { ...catalog, articles: articles.slice((page - 1) * 24, page * 24) },
    page,
    total: articles.length,
  }
}

function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}

// Compare the complete visible child tree, including styles, content, card
// order, link destinations and callback presence, without React internals or
// function identity. The outer PreviewPage metadata and D-20's non-rendered
// analytics-only props may differ; all visible props must still match.
function comparable(value) {
  if (typeof value === 'function') return '[function]'
  if (Array.isArray(value)) return value.map(comparable)
  if (value && typeof value === 'object') {
    if (value.$$typeof) {
      const props = { ...value.props }
      if (value.type === 'ArticleCard' && props.analyticsContext) {
        props.analyticsContext = { ...props.analyticsContext }
        delete props.analyticsContext.position
      }
      if (value.type === 'ArticleGridControls') delete props.pageType
      return { type: value.type, key: value.key, props: comparable(props) }
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, comparable(item)]))
  }
  return value
}

test('archive page 1 retains its title and clean self-canonical; subsequent real-language pages have distinct metadata', () => {
  for (const language of ['en', 'zh', 'es']) {
    const prefix = language === 'en' ? '' : `/${language}`
    for (const page of [1, 2]) {
      const props = archiveProps(language, page)
      assert.ok(props.catalog.articles.length > 0)
      const tree = current.ArticleArchive(props)
      assert.equal(tree.type, 'PreviewPage')
      assert.equal(tree.props.title, page === 1 ? 'All articles' : `All articles — Page ${page}`)
      assert.equal(tree.props.canonicalPath, `${prefix}/knowledge-base/articles${page > 1 ? `?page=${page}` : ''}`)
      const canonical = new URL(tree.props.canonicalPath, 'https://www.nervos.org')
      assert.deepEqual([...canonical.searchParams], page > 1 ? [['page', String(page)]] : [])
      assert.equal(canonical.pathname.startsWith('/en/'), false)
      assert.equal(tree.props.noindex, undefined)
      assert.equal(tree.props.preview, undefined)
    }
  }
})

test('empty untranslated archive locales refer to English without inventing a localized canonical', () => {
  for (const language of ['fr', 'ko', 'tr', 'pt']) {
    const props = archiveProps(language)
    assert.equal(props.total, 0)
    const tree = current.ArticleArchive(props)
    assert.equal(tree.props.title, 'All articles')
    assert.equal(tree.props.canonicalPath, '/knowledge-base/articles')
    assert.equal(
      nodes(tree).find(node => node.props?.role === 'status').props.children,
      'No articles available in this language.',
    )
  }
})

test('archive visible tree, H1, article order and pagination are unchanged from HEAD with equivalent stubs', () => {
  for (const language of ['en', 'zh', 'es', 'fr']) {
    const total = archiveProps(language).total
    for (const page of new Set([1, ...(total ? [2, Math.ceil(total / 24)] : [])])) {
      const props = archiveProps(language, page)
      const tree = current.ArticleArchive(props)
      const before = previous.ArticleArchive(props)
      assert.deepEqual(comparable(tree.props.children), comparable(before.props.children), `${language} page ${page}`)
      const headings = nodes(tree).filter(node => node.type === 'h1')
      assert.equal(headings.length, 1)
      assert.equal(headings[0].props.children, 'All articles')
      assert.equal(headings[0].props.id, 'all-articles-title')
      assert.deepEqual(
        nodes(tree)
          .filter(node => node.type === 'ArticleCard')
          .map(node => node.props.article.id),
        props.catalog.articles.map(article => article.id),
      )
      const expectedLinks = [
        ...(page > 1 ? [`/knowledge-base/articles?page=${page - 1}`] : []),
        ...(page * 24 < total ? [`/knowledge-base/articles?page=${page + 1}`] : []),
      ]
      assert.deepEqual(
        nodes(tree)
          .filter(node => node.type === 'a')
          .map(node => node.props.href),
        expectedLinks,
      )
    }
  }
  assert.deepEqual(current.events, [], 'Rendering metadata must not trigger analytics')
  assert.deepEqual(previous.events, [])
})

test('the real archive loader keeps valid page data distinct and canonical metadata excludes tracking/filter keys', async () => {
  for (const language of ['en', 'zh', 'es']) {
    const total = archiveProps(language).total
    for (const page of new Set([1, 2, Math.ceil(total / 24)])) {
      const result = await libraryProps('archive')({
        locale: language,
        query: { page: String(page), sort_by: 'popular', utm_source: 'd07', tag: ['first', 'second'] },
      })
      assert.ok('props' in result && !('redirect' in result))
      assert.equal(result.props.page, page)
      assert.equal(result.props.total, total)
      assert.deepEqual(
        result.props.catalog.articles.map(article => article.id),
        archiveProps(language, page).catalog.articles.map(article => article.id),
      )
      const tree = current.ArticleArchive(result.props)
      const prefix = language === 'en' ? '' : `/${language}`
      assert.equal(tree.props.canonicalPath, `${prefix}/knowledge-base/articles${page > 1 ? `?page=${page}` : ''}`)
    }
    for (const page of ['0', '-1', '2.5', 'invalid', '', ['2', '3'], String(Math.ceil(total / 24) + 1)]) {
      assert.deepEqual(await libraryProps('archive')({ locale: language, query: { page } }), { notFound: true })
    }
  }
  for (const language of ['fr', 'ko', 'tr', 'pt']) {
    const result = await libraryProps('archive')({ locale: language, query: {} })
    assert.ok('props' in result)
    assert.equal(result.props.catalog.articles.length, 0)
    assert.equal(current.ArticleArchive(result.props).props.canonicalPath, '/knowledge-base/articles')
    assert.deepEqual(await libraryProps('archive')({ locale: language, query: { page: '2' } }), { notFound: true })
  }
})
