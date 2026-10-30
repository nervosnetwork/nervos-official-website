import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import kbHubs from '../../../scripts/fixtures/load-kb-hubs.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const source = fs.readFileSync(new URL('./ContentArticle.tsx', import.meta.url), 'utf8')

function renderArticle({ eligible = false, variant = 'A', preview = false } = {}) {
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
    './Components': { ArticleCard, ArrowButton: 'a' },
    './ArticleLanguageSwitch': { ArticleLanguageSwitch: () => null },
    '../Header/KnowledgeHeader': { LanguageToggle: () => null },
    './article-discover-experiment': {
      ARTICLE_DISCOVER_DESKTOP_QUERY: '(min-width: 1024px)',
      ARTICLE_DISCOVER_EXPERIMENT_ID: 'article_discover_placement_v1',
      initializeArticleDiscoverExperiment: () => ({ variant, preview }),
    },
    './reading-progress': { readingProgress: () => 0 },
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
      if (name.endsWith('/utils/breakpoints'))
        return { DESKTOP_QUERY: '(min-width: 1024px)', BELOW_DESKTOP_QUERY: '(max-width: 1023px)' }
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`)
      return imports[name]
    },
    document: { getElementById: id => ({ scrollIntoView: options => scrolls.push({ id, ...options }) }) },
    window: {
      history: { replaceState: (_state, _title, hash) => hashes.push(hash) },
      matchMedia: () => ({ matches: eligible }),
    },
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
    { id: 'section-1', label: 'What is CKB?', depth: 2 },
    { id: 'section-2', label: 'How does it work?', depth: 2 },
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
  const headerExports = {}
  vm.runInNewContext(
    ts.transpileModule(fs.readFileSync(new URL('../Header/KnowledgeHeader.tsx', import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    {
      exports: headerExports,
      require: name => {
        if (name.endsWith('/utils/breakpoints'))
          return { DESKTOP_QUERY: '(min-width: 1024px)', BELOW_DESKTOP_QUERY: '(max-width: 1023px)' }
        if (name.endsWith('.svg')) return { default: () => null }
        if (name.endsWith('.module.scss')) return { default: {} }
        if (name === 'next-i18next') return { useTranslation: () => ({ t: (key, fallback) => fallback ?? key }) }
        if (name === '@headlessui/react') return {}
        if (name === '../KnowledgeHub/Icon') return { Icon: () => null }
        if (name === '../KnowledgeHub/analytics') return imports['./analytics']
        if (name === '../KnowledgeHub/content') return imports['./content']
        if (name === '../KnowledgeHub/article-language') return {}
        if (name === './navigation-current') return { navigationCurrent: () => undefined }
        assert.ok(Object.hasOwn(imports, name), `Unexpected header dependency: ${name}`)
        return imports[name]
      },
    },
  )
  const headerTree = nodes(headerExports.KnowledgeHeader({ articleLanguage: article }))
  return { tree, headerTree, ArticleCard, DiscoverBanner: imports['./Shared'].DiscoverBanner, events, scrolls, hashes }
}

test('article Discover clicks attach the variant and responsive layout outside previews', () => {
  for (const settings of [
    { eligible: true, variant: 'A', preview: false },
    { eligible: true, variant: 'B', preview: false },
    { eligible: false, variant: 'B', preview: false },
    { eligible: true, variant: 'B', preview: true },
  ]) {
    const { tree, events, DiscoverBanner } = renderArticle(settings)
    tree.filter(node => node.type === DiscoverBanner).forEach(node => node.props.onDiscoverClick())
    assert.deepEqual(
      events.map(event => ({ ...event })),
      ['article_mobile_banner', 'article_bottom_banner', 'article_right_banner'].map(placement => ({
        name: 'kb_cta_click',
        data: {
          cta_id: 'discover_ckb',
          placement,
          ...(!settings.preview
            ? {
                experiment_id: 'article_discover_placement_v1',
                variant: settings.variant,
                article_id: 'current_article',
                layout: settings.eligible ? 'desktop' : 'inline',
              }
            : {}),
        },
      })),
    )
  }
})

test('desktop and mobile TOC clicks include editorial heading text and native section anchors', () => {
  const { tree, events, scrolls, hashes } = renderArticle()
  assert.deepEqual(events, [], 'Rendering and active-section calculation must not emit TOC click events')
  const headingLinks = tree.filter(node => node.type === 'a' && node.props.href === '#user-content-section-2')
  assert.equal(headingLinks.length, 2, 'The remote mobile and desktop layouts both keep their native anchors')
  headingLinks.forEach(link => link.props.onClick())
  assert.equal(
    tree.some(node => node.type === 'select'),
    false,
    'The remote mobile inline TOC replaces the old select',
  )
  assert.deepEqual(
    events,
    ['desktop', 'mobile'].map(placement => ({
      name: 'kb_toc_click',
      data: { article_id: 'current_article', section_index: 2, heading_text: 'How does it work?', placement },
    })),
  )
  assert.deepEqual(scrolls, [], 'Native anchor navigation must not be replaced with an imperative scroll')
  assert.deepEqual(hashes, [], 'Native anchor navigation must not rewrite browser history manually')
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
  assert.equal(
    tree.filter(node => node.type === 'a' && node.props.href?.startsWith('/knowledge-base/related_')).length,
    0,
    'The new layout removes the recent-post sidebar',
  )
  assert.deepEqual(events, [])
})

test('Write an article reports the same fixed resource URL as its unchanged link destination', () => {
  const { headerTree, events } = renderArticle()
  const link = headerTree.find(
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
