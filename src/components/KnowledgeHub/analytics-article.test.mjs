import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import kbHubs from '../../../scripts/fixtures/load-kb-hubs.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const source = fs.readFileSync(new URL('./ContentArticle.tsx', import.meta.url), 'utf8')

function renderArticle() {
  const events = []
  const scrolls = []
  const hashes = []
  const ArticleCard = () => null
  const imports = {
    '../../utils/kb-hubs': kbHubs,
    clsx: { default: (...values) => values.filter(Boolean).join(' ') },
    react: {
      useEffect: () => undefined,
      useRef: () => ({ current: null }),
      useState: initial => [initial, () => undefined],
    },
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/image': { default: 'img' },
    'next/link': { default: 'a' },
    'next/router': { useRouter: () => ({ push: () => Promise.resolve(true) }) },
    'react-markdown': { default: 'markdown' },
    'remark-gfm': {},
    'rehype-raw': {},
    'rehype-sanitize': { defaultSchema: {} },
    './Home': { Icon: () => null, PreviewNotice: () => null },
    './Shared': { PreviewPage: 'main', DiscoverBanner: () => null, useActiveSection: () => '' },
    './Components': { ArticleCard },
    './ArticleLanguageSwitch': { ArticleLanguageSwitch: () => null },
    './ArticleLanguageLink': { ArticleLanguageLink: 'a', ArticleContentLink: 'a' },
    './content': { articlePath: article => article.canonicalPath, formatArticleDate: () => 'Existing date' },
    './article-v2.module.scss': { default: {} },
    './pages-v2.module.scss': { default: {} },
    './markdown-headings': {},
    './article-features': { articleSocialActionsEnabled: false },
    './analytics': { trackKBEvent: (name, data) => events.push({ name, data: structuredClone(data) }) },
  }
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    require: name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`)
      return imports[name]
    },
    document: { getElementById: id => ({ scrollIntoView: options => scrolls.push({ id, ...options }) }) },
    window: { history: { replaceState: (_state, _title, hash) => hashes.push(hash) } },
  })
  const article = {
    id: 'current_article',
    canonicalPath: '/knowledge-base/current_article',
    title: 'Existing article title',
    subtitle: 'Existing subtitle',
    authors: [],
    language: 'en',
    readingMinutes: 5,
    date: null,
    coverImage: null,
    hub: 'blockchain-architecture',
  }
  const headings = [
    { id: 'section-1', label: 'What is CKB?' },
    { id: 'section-2', label: 'How does it work?' },
  ]
  const otherArticles = [
    { ...article, id: 'related_one', canonicalPath: '/knowledge-base/related_one', hub: 'nervos-ckb' },
    { ...article, id: 'related_two', canonicalPath: '/knowledge-base/related_two', hub: null },
  ]
  const nodes = node => {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(nodes)
    return [node, ...nodes(node.props?.children)]
  }
  const tree = nodes(
    exports.ContentArticle({
      article,
      markdown: '',
      related: otherArticles,
      recent: otherArticles,
      subjects: [],
      headings,
      hub: null,
    }),
  )
  return { tree, ArticleCard, events, scrolls, hashes }
}

test('desktop and mobile TOC clicks include editorial heading text while preserving anchor behavior', () => {
  const { tree, events, scrolls, hashes } = renderArticle()
  assert.deepEqual(events, [], 'Rendering and active-section calculation must not emit TOC click events')
  const headingLink = tree.find(node => node.type === 'a' && node.props.href === '#user-content-section-2')
  headingLink.props.onClick()
  const select = tree.find(node => node.type === 'select')
  select.props.onChange({ target: { value: 'user-content-section-2' } })
  assert.deepEqual(
    events,
    ['desktop', 'mobile'].map(placement => ({
      name: 'kb_toc_click',
      data: { article_id: 'current_article', section_index: 2, heading_text: 'How does it work?', placement },
    })),
  )
  assert.deepEqual(scrolls, [{ id: 'user-content-section-2', block: 'start' }])
  assert.deepEqual(hashes, ['#user-content-section-2'])
})

test('article recommendations carry their own Hub and one-based displayed position', () => {
  const { tree, ArticleCard, events } = renderArticle()
  const cards = tree.filter(node => node.type === ArticleCard)
  assert.deepEqual(
    cards.map(node => ({ ...node.props.analyticsContext })),
    [
      { placement: 'more_from_ckb', position: 1, hub_id: 'nervos-ckb' },
      { placement: 'more_from_ckb', position: 2, hub_id: undefined },
    ],
  )
  const recentLinks = tree.filter(node => node.type === 'a' && node.props.href?.startsWith('/knowledge-base/related_'))
  recentLinks.forEach(link => link.props.onClick())
  assert.deepEqual(events, [
    {
      name: 'kb_article_click',
      data: { article_id: 'related_one', placement: 'recent_posts', position: 1, hub_id: 'nervos-ckb' },
    },
    {
      name: 'kb_article_click',
      data: { article_id: 'related_two', placement: 'recent_posts', position: 2, hub_id: undefined },
    },
  ])
})

test('Write an article reports the same fixed resource URL as its unchanged link destination', () => {
  const { tree, events } = renderArticle()
  const link = tree.find(
    node => node.type === 'a' && node.props.href === 'https://github.com/NervosEducationHub/EducationHubArticles',
  )
  link.props.onClick()
  assert.deepEqual(events, [
    {
      name: 'kb_resource_click',
      data: { resource_id: 'write_article', placement: 'article_nav', link_url: link.props.href },
    },
  ])
})
