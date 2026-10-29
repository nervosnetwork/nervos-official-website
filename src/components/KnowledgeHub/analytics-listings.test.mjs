import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import vm from 'node:vm'
import kbHubs from '../../../scripts/fixtures/load-kb-hubs.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const directory = path.dirname(fileURLToPath(import.meta.url))

function loadComponent(filename, options = {}) {
  const events = []
  const searches = []
  const routes = []
  const ref = { current: false }
  let stateIndex = 0
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(directory, filename), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  const imports = {
    '../../utils/kb-hubs': kbHubs,
    react: {
      useState: value => [options.states?.[stateIndex++] ?? value, () => undefined],
      useEffect: callback => options.effects !== false && callback(),
      useRef: () => ref,
    },
    'react/jsx-runtime': require('react/jsx-runtime'),
    clsx: { default: (...values) => values.filter(Boolean).join(' ') },
    'next/link': { default: 'a' },
    'next/image': { default: 'img' },
    'next/router': { useRouter: () => ({ locale: 'es', push: url => routes.push(url) }) },
    'next/head': { default: 'Head' },
    '../Page': { Page: 'Page' },
    '@headlessui/react': { Menu: 'Menu', MenuButton: 'MenuButton', MenuItem: 'MenuItem', MenuItems: 'MenuItems' },
    './Home': { Icon: 'Icon' },
    './Icon': { Icon: 'Icon' },
    './ArticleLanguageLink': { ArticleLanguageLink: 'a' },
    './fixtures': { hubs: [] },
    './Shared': {
      PreviewPage: 'PreviewPage',
      Breadcrumb: 'Breadcrumb',
      RelatedHubs: 'RelatedHubs',
      useActiveSection: () => 'step-1',
    },
    './Components': {
      ArticleCard: 'ArticleCard',
      SubjectCard: 'SubjectCard',
      StepSection: 'StepSection',
      ArrowButton: 'ArrowButton',
      HubCard: 'HubCard',
      ArticleCover: 'ArticleCover',
    },
    './KnowledgeFooter': { KnowledgeFooter: 'KnowledgeFooter' },
    './GuideLife': { GuideLife: 'GuideLife' },
    './NeuronIcon': { NeuronIcon: 'NeuronIcon' },
    './useNewsletterSignup': { useNewsletterSignup: () => ({}) },
    './guide-data': loadGuideSteps(),
    './ArticleGridControls': { ArticleGridControls: 'ArticleGridControls' },
    './useHeroScroll': { useHeroScroll: () => ({ heroFade: 0, breadcrumbHeight: 0, breadcrumbRef: null }) },
    './content': { byDate: () => 0, articlePath: article => article.canonicalPath },
    './components.module.scss': { default: {} },
    './pages-v2.module.scss': { default: {} },
    './home-v2.module.scss': { default: {} },
    './analytics': {
      trackKBEvent: (name, data) => events.push({ name, data: { ...data } }),
      searchLengthBucket: value => (value.trim().length > 30 ? '31-plus' : '1-30'),
    },
    './search-analytics': {
      trackKBSearch: (query, placement, locale, knownResultsCount) =>
        searches.push({ query, placement, locale, knownResultsCount }),
    },
  }
  vm.runInNewContext(outputText, {
    exports,
    FormData: class {
      constructor(form) {
        this.value = form.q
      }
      get() {
        return this.value
      }
    },
    require: name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected listing dependency: ${name}`)
      return imports[name]
    },
  })
  return { exports, events, routes, searches }
}

function loadGuideSteps() {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(directory, 'guide-data.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  })
  const exports = {}
  vm.runInNewContext(outputText, { exports })
  return exports
}

function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}

const catalog = {
  hubs: [{ id: 'hub-one', heading: 'Hub one' }],
  subjects: [
    { id: 'subject-one', name: 'Subject one', hub: 'hub-one', order: 1 },
    { id: 'subject-two', name: 'Subject two', hub: 'hub-one', order: 2 },
  ],
  articles: [{ id: 'article-one', title: 'Article one', hub: 'hub-one', subjects: ['subject-one'] }],
}

test('grid controls only emit layout events for actual changes and preserve the density callback', () => {
  const { exports, events } = loadComponent('ArticleGridControls.tsx')
  const changes = []
  const tree = exports.ArticleGridControls({
    density: 4,
    placement: 'archive',
    onDensityChange: value => changes.push(value),
  })
  const reset = nodes(tree).find(node => node.props?.['aria-label'] === 'Reset to four cards per row')
  const range = nodes(tree).find(node => node.props?.type === 'range')
  assert.equal(events.length, 0)
  reset.props.onClick()
  range.props.onChange({ target: { value: '4' } })
  assert.equal(events.length, 0)
  range.props.onChange({ target: { value: '5' } })
  assert.deepEqual(changes, [4, 4, 5])
  assert.deepEqual(events, [{ name: 'kb_layout_change', data: { placement: 'archive', layout: 'grid', columns: 5 } }])
})

test('Filter counts closed-to-open transitions, including keyboard-driven state, not rerenders or closing', () => {
  const { exports, events } = loadComponent('ArticleGridControls.tsx')
  const tree = exports.ArticleGridControls({
    density: 4,
    placement: 'topic',
    pageType: 'hub',
    hubId: 'hub-one',
    onDensityChange: () => undefined,
  })
  const menu = nodes(tree).find(node => node.type === 'Menu')
  for (const open of [false, true, true, false, false, true]) {
    const children = menu.props.children({ open })
    const tracker = nodes(children).find(node => typeof node.type === 'function')
    tracker.type(tracker.props)
  }
  assert.deepEqual(events, [
    { name: 'kb_filter_open', data: { placement: 'topic', page_type: 'hub', hub_id: 'hub-one' } },
    { name: 'kb_filter_open', data: { placement: 'topic', page_type: 'hub', hub_id: 'hub-one' } },
  ])
})

test('topic subject selection skips the current subject and article cards retain hub and subject context', () => {
  const { exports, events } = loadComponent('Topic.tsx')
  const tree = exports.Topic({ catalog, hubId: 'hub-one' })
  const subjects = nodes(tree).filter(node => node.type === 'SubjectCard')
  subjects[0].props.onClick()
  assert.equal(events.length, 0)
  subjects[1].props.onClick()
  assert.deepEqual(events, [
    { name: 'kb_subject_select', data: { hub_id: 'hub-one', subject_id: 'subject-two', placement: 'topic' } },
  ])
  const card = nodes(tree).find(node => node.type === 'ArticleCard')
  assert.deepEqual(
    { ...card.props.analyticsContext },
    { placement: 'topic_articles', hub_id: 'hub-one', subject_id: 'subject-one', position: 1 },
  )
  const toolbar = nodes(tree).find(node => node.type === 'ArticleGridControls')
  assert.equal(toolbar.props.pageType, 'hub')
  assert.equal(toolbar.props.hubId, 'hub-one')
})

test('archive pagination records destination page without changing existing URLs', () => {
  const { exports, events } = loadComponent('ArticleArchive.tsx')
  const tree = exports.ArticleArchive({ catalog, page: 2, total: 80 })
  const links = nodes(tree).filter(node => node.type === 'a')
  assert.equal(events.length, 0)
  assert.deepEqual(
    links.map(node => node.props.href),
    ['/knowledge-base/articles?page=1', '/knowledge-base/articles?page=3'],
  )
  for (const link of links) link.props.onClick()
  assert.deepEqual(events, [
    {
      name: 'kb_pagination_click',
      data: { placement: 'archive', page: 1, page_type: 'all_articles', direction: 'previous' },
    },
    {
      name: 'kb_pagination_click',
      data: { placement: 'archive', page: 3, page_type: 'all_articles', direction: 'next' },
    },
  ])
  const card = nodes(tree).find(node => node.type === 'ArticleCard')
  assert.equal(card.props.analyticsContext.placement, 'archive_articles')
  assert.equal(card.props.analyticsContext.position, 1)
  assert.equal(nodes(tree).find(node => node.type === 'ArticleGridControls').props.pageType, 'all_articles')
})

test('search instrumentation captures the submitted term and only reuses totals belonging to that query', () => {
  const { exports, events, routes, searches } = loadComponent('Library.tsx')
  const tree = exports.Library({ catalog, mode: 'search', hubId: '', query: 'test', page: 2, total: 80 })
  assert.equal(events.length, 0, 'Restoring a layout preference must not emit an event')
  const query = 'learning about payment channels and settlements'
  const form = nodes(tree).find(node => node.type === 'form')
  form.props.onSubmit({ preventDefault: () => undefined, currentTarget: { q: query } })
  assert.deepEqual(searches, [{ query, placement: 'search', locale: 'es', knownResultsCount: undefined }])
  assert.equal(events.length, 0, 'The helper owns asynchronous search event emission')
  assert.deepEqual(routes, [`/knowledge-base/search?q=${encodeURIComponent(query)}`])
  form.props.onSubmit({ preventDefault: () => undefined, currentTarget: { q: 'test' } })
  assert.deepEqual(searches[1], { query: 'test', placement: 'search', locale: 'es', knownResultsCount: 80 })
  const card = nodes(tree).find(node => node.type === 'ArticleCard')
  assert.equal(card.props.analyticsContext.placement, 'search_results')
  assert.equal(card.props.analyticsContext.position, 1)
  const layoutButtons = nodes(tree).filter(node => node.props && Object.hasOwn(node.props, 'aria-pressed'))
  layoutButtons[0].props.onClick()
  assert.equal(events.length, 0, 'Clicking the selected layout is not a change')
  layoutButtons[1].props.onClick()
  assert.deepEqual(events[0], { name: 'kb_layout_change', data: { placement: 'search', layout: 'list', columns: 1 } })
  const next = nodes(tree).find(node => node.props?.href?.startsWith('/knowledge-base/search?page=3'))
  next.props.onClick()
  assert.deepEqual(events[1], {
    name: 'kb_pagination_click',
    data: { placement: 'search', page: 3, page_type: 'search', direction: 'next' },
  })
  const all = nodes(tree).find(node => node.props?.href === '/knowledge-base/articles')
  all.props.onClick()
  assert.deepEqual(events[2], { name: 'kb_cta_click', data: { cta_id: 'all_articles', placement: 'search' } })
})

test('search grid selection reports four columns and does not emit a duplicate for the selected list layout', () => {
  const { exports, events } = loadComponent('Library.tsx', { states: ['list'] })
  const tree = exports.Library({ catalog, mode: 'search', hubId: '', query: 'test', page: 1, total: 1 })
  const layoutButtons = nodes(tree).filter(node => node.props && Object.hasOwn(node.props, 'aria-pressed'))
  layoutButtons[1].props.onClick()
  assert.deepEqual(events, [])
  layoutButtons[0].props.onClick()
  assert.deepEqual(events, [{ name: 'kb_layout_change', data: { placement: 'search', layout: 'grid', columns: 4 } }])
})

test('shared article cards and reading lists use actual article hubs and one-based list positions without changing links', () => {
  const { exports, events } = loadComponent('Components.tsx')
  const articles = [
    { ...catalog.articles[0], canonicalPath: '/knowledge-base/article-one' },
    { ...catalog.articles[0], id: 'article-two', hub: 'hub-two', canonicalPath: '/knowledge-base/article-two' },
  ]
  const reading = exports.ReadingList({
    titles: ['First title', 'Second title'],
    articles,
    analyticsContext: { placement: 'start_here_reading', step: 2 },
  })
  const links = nodes(reading).filter(node => node.type === 'a')
  assert.deepEqual(
    links.map(node => node.props.href),
    articles.map(article => article.canonicalPath),
  )
  for (const link of links) link.props.onClick()
  assert.deepEqual(events, [
    {
      name: 'kb_article_click',
      data: { placement: 'start_here_reading', step: 2, article_id: 'article-one', hub_id: 'hub-one', position: 1 },
    },
    {
      name: 'kb_article_click',
      data: { placement: 'start_here_reading', step: 2, article_id: 'article-two', hub_id: 'hub-two', position: 2 },
    },
  ])
  for (const horizontal of [false, true]) {
    const card = exports.ArticleCard({
      title: articles[1].title,
      article: articles[1],
      horizontal,
      analyticsContext: { placement: 'search_results', position: 2 },
    })
    assert.equal(card.props.href, articles[1].canonicalPath)
    card.props.onClick()
    assert.deepEqual(events.at(-1), {
      name: 'kb_article_click',
      data: { placement: 'search_results', position: 2, article_id: 'article-two', hub_id: 'hub-two' },
    })
  }
  const contextual = exports.ArticleCard({
    title: articles[0].title,
    article: articles[0],
    analyticsContext: { placement: 'topic_articles', position: 1, hub_id: 'selected-hub' },
  })
  contextual.props.onClick()
  assert.equal(events.at(-1).data.hub_id, 'selected-hub', 'An explicit listing hub retains precedence')
})

test('Home tracks displayed positions and submitted searches independently of the five suggestion cards', () => {
  const articles = [
    { ...catalog.articles[0], canonicalPath: '/knowledge-base/article-one', readingMinutes: 5 },
    {
      ...catalog.articles[0],
      id: 'article-two',
      hub: 'hub-two',
      canonicalPath: '/knowledge-base/article-two',
      readingMinutes: 3,
    },
  ]
  const query = 'payment channels'
  const { exports, events, routes, searches } = loadComponent('Home.tsx', {
    effects: false,
    states: [query, true, articles, ''],
  })
  const root = nodes(
    exports.KnowledgeHubHome({
      catalog: { articles: [], hubs: [], subjects: [], featured: [] },
      counts: {},
      mostRead: { articles },
    }),
  ).find(node => node.type === 'Page')
  const tree = nodes(root.props.children({ renderHeader: () => null }))
  const articleLinks = tree.filter(node => articles.some(article => article.canonicalPath === node.props?.href))
  assert.equal(articleLinks.length, 4)
  for (const link of articleLinks) link.props.onClick()
  assert.deepEqual(
    events.map(event => event.data),
    [
      { article_id: 'article-one', placement: 'home_search_suggestion', hub_id: 'hub-one', position: 1 },
      { article_id: 'article-two', placement: 'home_search_suggestion', hub_id: 'hub-two', position: 2 },
      { article_id: 'article-one', placement: 'recommended_reading', hub_id: 'hub-one', position: 1 },
      { article_id: 'article-two', placement: 'recommended_reading', hub_id: 'hub-two', position: 2 },
    ],
  )
  tree.find(node => node.type === 'form').props.onSubmit({ preventDefault: () => undefined })
  const allResults = tree.find(node => node.props?.href === `/knowledge-base/search?q=${encodeURIComponent(query)}`)
  allResults.props.onClick()
  assert.deepEqual(searches, [
    { query, placement: 'home_search', locale: 'es', knownResultsCount: undefined },
    { query, placement: 'home_all_search_results', locale: 'es', knownResultsCount: undefined },
  ])
  assert.deepEqual(routes, [`/knowledge-base/search?q=${encodeURIComponent(query)}`])
})

test('resource events carry the existing link destination and guide steps carry their actual labels', () => {
  const home = loadComponent('Home.tsx', { effects: false })
  const links = nodes(home.exports.Newsletter()).filter(node => node.type === 'a')
  assert.equal(links.length, 3)
  for (const link of links) {
    link.props.onClick()
    assert.equal(home.events.at(-1).name, 'kb_resource_click')
    assert.equal(home.events.at(-1).data.link_url, link.props.href)
  }
  const guide = loadComponent('StartHere.tsx', { effects: false })
  const steps = nodes(guide.exports.StartHere({ catalog })).filter(node => node.type === 'SubjectCard')
  assert.equal(steps.length, 4)
  steps.forEach((step, index) => {
    step.props.onClick()
    assert.deepEqual(guide.events.at(-1), {
      name: 'kb_step_select',
      data: { step: index + 1, step_name: step.props.title },
    })
    assert.equal(step.props.href, `#step-${index + 1}`)
  })
})
