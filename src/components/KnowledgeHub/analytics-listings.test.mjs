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
      useRef: value => (value === false ? ref : { current: value }),
    },
    'react/jsx-runtime': require('react/jsx-runtime'),
    clsx: { default: (...values) => values.filter(Boolean).join(' ') },
    'next/link': { default: 'a' },
    'next/image': { default: 'img' },
    'next/router': {
      useRouter: () => ({
        locale: 'es',
        push: url => routes.push(url),
        query: options.routerQuery ?? {},
        pathname: options.routerPath ?? '/knowledge-base/search',
      }),
    },
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
    './GuideSection': { GuideSection: 'GuideSection' },
    './GuideLife': { GuideLife: 'GuideLife' },
    './NeuronIcon': { NeuronIcon: 'NeuronIcon' },
    './useNewsletterSignup': { useNewsletterSignup: () => ({}) },
    './guide-data': loadGuideSteps(),
    './ArticleGridControls': { ArticleGridControls: 'ArticleGridControls' },
    './ArticleSearch': { ArticleSearch: 'ArticleSearch' },
    '../Pagination': { default: 'Pagination' },
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
    URLSearchParams,
    FormData: class {
      constructor(form) {
        this.value = form.q
      }
      get() {
        return this.value
      }
    },
    require: name => {
      if (name.endsWith('.module.scss')) return { default: {} }
      if (name.endsWith('/utils/breakpoints'))
        return { DESKTOP_QUERY: '(min-width: 1024px)', BELOW_DESKTOP_QUERY: '(max-width: 1023px)' }
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

test('hub layout controls offer two or three columns and reset to three', () => {
  const { exports, events } = loadComponent('ArticleGridControls.tsx')
  const changes = []
  const tree = exports.ArticleGridControls({
    density: 3,
    pageType: 'hub',
    placement: 'topic',
    onDensityChange: value => changes.push(value),
  })
  const range = nodes(tree).find(node => node.props?.type === 'range')
  assert.equal(range.props.min, 2)
  assert.equal(range.props.max, 3)
  range.props.onChange({ target: { value: '2' } })
  nodes(tree)
    .find(node => node.props?.['aria-label'] === 'Reset to three cards per row')
    .props.onClick()
  assert.deepEqual(changes, [2, 3])
  assert.deepEqual(events, [{ name: 'kb_layout_change', data: { placement: 'topic', layout: 'grid', columns: 2 } }])
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
  assert.equal(nodes(tree).find(node => node.type === 'RelatedHubs').props.currentHubId, 'hub-one')
})

test('Related hubs offers three distinct valid destinations and excludes every current hub', () => {
  for (const current of kbHubs.KB_HUBS) {
    const { exports, events } = loadComponent('Shared.tsx')
    const tree = exports.RelatedHubs({ revision: true, currentHubId: current.id })
    const links = nodes(tree).filter(node => node.type === 'ArrowButton')
    assert.equal(links.length, 3)
    assert.equal(new Set(links.map(node => node.props.href)).size, 3)
    assert.ok(links.every(node => node.props.href !== kbHubs.kbHubPath(current.id)))
    for (const link of links) {
      const target = kbHubs.KB_HUBS.find(hub => kbHubs.kbHubPath(hub.id) === link.props.href)
      assert.ok(target, `Unknown hub URL: ${link.props.href}`)
      assert.equal(link.props.children, target.name)
      link.props.onClick()
      assert.equal(events.at(-1).data.hub_id, target.id)
    }
  }
})

test('archive pagination records destination page without changing existing URLs', () => {
  const { exports, events } = loadComponent('ArticleArchive.tsx')
  const tree = exports.ArticleArchive({ catalog, page: 2, total: 80 })
  const links = nodes(tree).filter(node => node.type === 'a' || node.type === 'ArrowButton')
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
  assert.equal(nodes(tree).filter(node => node.type === 'ArticleSearch').length, 1)
})

test('archive search submits encoded queries and tracks suggestions and full results separately', () => {
  const article = { ...catalog.articles[0], canonicalPath: '/knowledge-base/article-one' }
  const query = 'payment & channels'
  const { exports, events, routes, searches } = loadComponent('ArticleSearch.tsx', {
    effects: false,
    states: [query, true, [article], ''],
  })
  const tree = nodes(exports.ArticleSearch())
  const input = tree.find(node => node.type === 'input')
  assert.equal(input.props.placeholder, 'Search all articles')
  assert.equal(input.props.maxLength, 200)
  assert.equal(events.length, 0)
  let prevented = false
  tree[0].props.onKeyDown({ key: 'Escape', preventDefault: () => (prevented = true) })
  assert.equal(prevented, true, 'Escape closes suggestions without the search input clearing and reopening them')
  tree.find(node => node.type === 'form').props.onSubmit({ preventDefault: () => undefined })
  assert.deepEqual(routes, [`/knowledge-base/search?q=${encodeURIComponent(query)}`])
  assert.deepEqual(searches[0], { query, placement: 'archive_search', locale: 'es', knownResultsCount: undefined })
  tree.find(node => node.type === 'a' && node.props.href === article.canonicalPath).props.onClick()
  assert.deepEqual(events, [
    {
      name: 'kb_article_click',
      data: { article_id: article.id, placement: 'archive_search_suggestion', hub_id: 'hub-one', position: 1 },
    },
  ])
  tree.find(node => node.type === 'a' && node.props.href.startsWith('/knowledge-base/search?')).props.onClick()
  assert.deepEqual(searches[1], {
    query,
    placement: 'archive_all_search_results',
    locale: 'es',
    knownResultsCount: undefined,
  })
})

test('search results pass the current query and total to the shared search bar', () => {
  const { exports, events } = loadComponent('Library.tsx')
  const tree = exports.Library({ catalog, mode: 'search', hubId: '', query: 'test', page: 2, total: 80 })
  assert.equal(events.length, 0, 'Restoring a layout preference must not emit an event')
  const search = nodes(tree).find(node => node.type === 'ArticleSearch')
  assert.equal(search.props.initialQuery, 'test')
  assert.equal(search.props.placement, 'search')
  assert.equal(search.props.resultsCount, 80)
  const card = nodes(tree).find(node => node.type === 'ArticleCard')
  assert.equal(card.props.analyticsContext.placement, 'search_results')
  assert.equal(card.props.analyticsContext.position, 1)
  const layoutButtons = nodes(tree).filter(node => node.props && Object.hasOwn(node.props, 'aria-pressed'))
  layoutButtons[0].props.onClick()
  assert.equal(events.length, 0, 'Clicking the selected layout is not a change')
  layoutButtons[1].props.onClick()
  assert.deepEqual(events[0], { name: 'kb_layout_change', data: { placement: 'search', layout: 'list', columns: 1 } })
  const pagination = nodes(tree).find(node => node.type === 'Pagination')
  assert.equal(pagination.props.pageCount, 4)
  assert.equal(pagination.props.currentPage, 2)
  assert.equal(pagination.props.hrefForPage(3), '/knowledge-base/search?page=3&q=test')
  pagination.props.onPageChange(3)
  assert.deepEqual(events[1], {
    name: 'kb_pagination_click',
    data: { placement: 'search', page: 3, page_type: 'search', direction: 'next' },
  })
  const breadcrumb = nodes(tree).find(node => node.type === 'Breadcrumb')
  assert.equal(breadcrumb.props.current, 'Search results')
  assert.deepEqual(
    Array.from(breadcrumb.props.parents, value => ({ ...value })),
    [{ label: 'All articles', href: '/knowledge-base/articles', ctaId: 'all_articles' }],
  )
  assert.equal(nodes(tree).find(node => node.type === 'h1').props.children, '80 results')
  assert.equal(nodes(tree).filter(node => node.type === 'h2').length, 0)
  assert.equal(nodes(tree).filter(node => node.props?.href === '/knowledge-base/articles').length, 0)
})

test('shared search instrumentation only reuses totals belonging to the submitted query', () => {
  for (const query of ['test', 'learning about payment channels and settlements']) {
    const { exports, routes, searches } = loadComponent('ArticleSearch.tsx', {
      effects: false,
      states: [query],
    })
    const tree = nodes(exports.ArticleSearch({ initialQuery: 'test', placement: 'search', resultsCount: 80 }))
    tree.find(node => node.type === 'form').props.onSubmit({ preventDefault: () => undefined })
    assert.deepEqual(routes, [`/knowledge-base/search?q=${encodeURIComponent(query)}`])
    assert.deepEqual(searches, [
      {
        query,
        placement: 'search',
        locale: 'es',
        knownResultsCount: query === 'test' ? 80 : undefined,
      },
    ])
  }
})

test('empty search guidance stays in the dropdown and blank submissions do not navigate or emit analytics', () => {
  for (const query of ['', '   ']) {
    const { exports, routes, searches } = loadComponent('ArticleSearch.tsx', {
      effects: false,
      states: [query, true, [catalog.articles[0]]],
    })
    const tree = nodes(exports.ArticleSearch())
    const prompt = tree.find(node => node.props.role === 'status')
    assert.equal(prompt.props.children, 'Enter a search term.')
    assert.equal(tree.filter(node => node.type === 'a').length, 0, 'Empty queries must not offer stale or full results')
    tree.find(node => node.type === 'form').props.onSubmit({ preventDefault: () => undefined })
    assert.deepEqual(routes, [])
    assert.deepEqual(searches, [])
    const library = loadComponent('Library.tsx')
    const results = nodes(
      library.exports.Library({
        catalog: { ...catalog, articles: [] },
        mode: 'search',
        hubId: '',
        query,
        page: 1,
        total: 0,
      }),
    )
    assert.equal(results.filter(node => node.props.role === 'status').length, 0)
  }
})

test('unmatched search results name the submitted query and suggest adjusting the terms', () => {
  const { exports } = loadComponent('Library.tsx')
  const tree = nodes(
    exports.Library({
      catalog: { ...catalog, articles: [] },
      mode: 'search',
      hubId: '',
      query: '  unknown topic  ',
      page: 1,
      total: 0,
    }),
  )
  const message = tree.find(node => node.props.role === 'status')
  assert.equal(nodes(message).find(node => node.type === 'strong').props.children, 'unknown topic')
  assert.deepEqual(
    Array.from(message.props.children.props.children).filter(child => typeof child === 'string'),
    ["No results for '", "'. Try adjusting your search terms."],
  )
})

test('numbered pagination marks the current page and keeps boundary arrows noninteractive', () => {
  const { exports } = loadComponent('../Pagination/index.tsx')
  for (const pageCount of [1, 3, 9]) {
    for (const currentPage of new Set([1, Math.ceil(pageCount / 2), pageCount])) {
      const destinations = []
      const tree = nodes(
        exports.default({
          pageCount,
          currentPage,
          hrefForPage: page => `/knowledge-base/search?page=${page}&q=nervos`,
          onPageChange: page => destinations.push(page),
        }),
      )
      assert.equal(tree[0].props['aria-label'], 'Pagination')
      assert.equal(tree.find(node => node.props['aria-current'] === 'page').props.children, currentPage)
      assert.equal(
        tree.some(node => node.props['aria-label'] === 'Previous page' && node.type === 'a'),
        currentPage > 1,
      )
      assert.equal(
        tree.some(node => node.props['aria-label'] === 'Next page' && node.type === 'a'),
        currentPage < pageCount,
      )
      const links = tree.filter(node => node.type === 'a')
      for (const link of links) {
        const url = new URL(link.props.href, 'https://www.nervos.org')
        const destination = Number(url.searchParams.get('page'))
        assert.ok(destination >= 1 && destination <= pageCount)
        assert.equal(url.searchParams.get('q'), 'nervos')
        link.props.onClick()
        assert.equal(destinations.at(-1), destination)
      }
    }
  }
  assert.equal(exports.default({ pageCount: 0 }), null)
})

test('shared pagination still preserves the current route and query when custom links are omitted', () => {
  const { exports } = loadComponent('../Pagination/index.tsx', {
    routerPath: '/knowledge-base',
    routerQuery: { page: '2', category: 'Nervos' },
  })
  const tree = nodes(exports.default({ pageCount: 5 }))
  for (const link of tree.filter(node => node.type === 'a')) {
    const url = new URL(link.props.href, 'https://www.nervos.org')
    assert.equal(url.pathname, '/knowledge-base')
    assert.equal(url.searchParams.get('category'), 'Nervos')
  }
})

test('search breadcrumbs link back to All articles and retain breadcrumb click tracking', () => {
  const { exports, events } = loadComponent('Shared.tsx')
  const tree = nodes(
    exports.Breadcrumb({
      current: 'Search results',
      revision: true,
      parents: [{ label: 'All articles', href: '/knowledge-base/articles', ctaId: 'all_articles' }],
    }),
  )
  const parent = tree.find(node => node.type === 'a' && node.props.href === '/knowledge-base/articles')
  assert.equal(parent.props.children, 'All articles')
  parent.props.onClick()
  assert.deepEqual(events, [{ name: 'kb_cta_click', data: { cta_id: 'all_articles', placement: 'breadcrumb' } }])
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

test('Home tracks recommendation positions and its single See all articles button', () => {
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
  const { exports, events } = loadComponent('Home.tsx')
  const root = nodes(
    exports.KnowledgeHubHome({
      catalog: { articles: [], hubs: [], subjects: [], featured: [] },
      counts: {},
      mostRead: { articles },
    }),
  ).find(node => node.type === 'Page')
  const tree = nodes(root.props.children({ renderHeader: () => null }))
  const articleLinks = tree.filter(node => articles.some(article => article.canonicalPath === node.props?.href))
  assert.equal(articleLinks.length, 2)
  for (const link of articleLinks) link.props.onClick()
  assert.deepEqual(
    events.map(event => event.data),
    [
      { article_id: 'article-one', placement: 'recommended_reading', hub_id: 'hub-one', position: 1 },
      { article_id: 'article-two', placement: 'recommended_reading', hub_id: 'hub-two', position: 2 },
    ],
  )
  assert.ok(!tree.some(node => node.props?.role === 'search' || node.props?.type === 'search'))
  const archiveLinks = tree.filter(node => node.props?.href === '/knowledge-base/articles')
  assert.equal(archiveLinks.length, 1)
  assert.equal(archiveLinks[0].props.children, 'See all articles')
  archiveLinks[0].props.onClick()
  assert.deepEqual(events.at(-1), {
    name: 'kb_cta_click',
    data: { cta_id: 'all_articles', placement: 'home_recommended' },
  })
})

test('resource events carry the existing link destination', () => {
  const home = loadComponent('Home.tsx', { effects: false })
  const links = nodes(home.exports.Newsletter()).filter(node => node.type === 'a')
  assert.equal(links.length, 3)
  for (const link of links) {
    link.props.onClick()
    assert.equal(home.events.at(-1).name, 'kb_resource_click')
    assert.equal(home.events.at(-1).data.link_url, link.props.href)
  }
})
