import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')

function load(file, imports) {
  const { outputText } = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    require: name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`)
      return imports[name]
    },
  })
  return exports
}

const { articlePath, featuredArticles } = load('./content.ts', {})
const { KnowledgeHubHome } = load('./Home.tsx', {
  react: { useState: initial => [initial, () => undefined], useEffect: () => undefined },
  'react/jsx-runtime': require('react/jsx-runtime'),
  'next/link': { default: 'Link' },
  '@headlessui/react': {},
  'next/head': { default: 'Head' },
  'next/router': { useRouter: () => ({ locale: 'en' }) },
  '../Page': { Page: 'Page' },
  './fixtures': { hubs: [] },
  './content': { articlePath, featuredArticles },
  './home-v2.module.scss': { default: new Proxy({}, { get: (_, key) => key }) },
  './Icon': { Icon: 'Icon' },
  './Components': { ArrowButton: 'ArrowButton', HubCard: 'HubCard' },
  './KnowledgeFooter': { KnowledgeFooter: 'KnowledgeFooter' },
  './GuideLife': { GuideLife: 'GuideLife' },
  './NeuronIcon': { NeuronIcon: 'NeuronIcon' },
  './analytics': { trackKBEvent: () => undefined },
  './useNewsletterSignup': {},
})
const catalog = { articles: [], hubs: [], subjects: [], featured: [] }
const mostRead = {
  startDate: '2025-09-28',
  endDate: '2026-09-27',
  articles: ['first', 'second', 'third', 'fourth'].map(id => ({
    id,
    language: 'en',
    canonicalPath: `/knowledge-base/${id}_Original`,
    title: id,
    date: null,
    readingMinutes: 5,
  })),
}
function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}
function render(props) {
  const page = nodes(KnowledgeHubHome(props)).find(node => node.type === 'Page')
  return nodes(page.props.children({ renderHeader: () => null }))
}

test('home uses ranked articles even when they are absent from the pruned Hub catalog', () => {
  const tree = render({ catalog, counts: {}, mostRead })
  const cards = tree.filter(node => node.props?.className === 'popularCard')
  assert.equal(cards.length, 4)
  assert.deepEqual(
    cards.map(card => card.props.href),
    mostRead.articles.map(articlePath),
  )
  const heading = tree.find(node => node.props?.id === 'popular-title')
  assert.equal(heading.props.children, 'Most read this year')
  assert.equal(heading.props.title, 'GA4 views: 2025-09-28 – 2026-09-27')
  assert.equal(tree.find(node => node.props?.className === 'allArticles').props.href, '/knowledge-base/articles')
})

test('home does not claim popularity without a measured locale selection', () => {
  const tree = render({ catalog, counts: {}, mostRead: { ...mostRead, articles: [] } })
  const heading = tree.find(node => node.props?.id === 'popular-title')
  assert.equal(heading.props.children, 'Recommended reading')
  assert.equal(heading.props.title, undefined)
})

test('page loader selects popularity before pruning the Hub catalog', async () => {
  const fullCatalog = { ...catalog, articles: mostRead.articles }
  const { getStaticProps } = load('../../pages/knowledge-base/index.page.tsx', {
    'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
    '../../components/KnowledgeHub/Home': { KnowledgeHubHome },
    '../../server/kb-content': { getKBCatalog: () => fullCatalog },
    '../../server/kb-most-read': {
      getKBMostRead: data => {
        assert.equal(data.articles.length, 4)
        return { ...mostRead, articles: data.articles.slice() }
      },
    },
    '../../components/KnowledgeHub/content': { featuredArticles },
  })
  const { props } = await getStaticProps({ locale: 'en' })
  assert.equal(props.catalog.articles.length, 0)
  assert.equal(props.mostRead.articles.length, 4)
  assert.deepEqual(
    props.mostRead.articles.map(article => article.id),
    ['first', 'second', 'third', 'fourth'],
  )
})
