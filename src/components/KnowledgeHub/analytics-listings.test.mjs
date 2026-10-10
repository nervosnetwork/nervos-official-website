import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const directory = path.dirname(fileURLToPath(import.meta.url))

function loadComponent(filename) {
  const events = []
  const routes = []
  const ref = { current: false }
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(directory, filename), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  const imports = {
    react: {
      useState: value => [value, () => undefined],
      useEffect: callback => callback(),
      useRef: () => ref,
    },
    'react/jsx-runtime': require('react/jsx-runtime'),
    clsx: { default: (...values) => values.filter(Boolean).join(' ') },
    'next/link': { default: 'a' },
    'next/router': { useRouter: () => ({ push: url => routes.push(url) }) },
    '@headlessui/react': { Menu: 'Menu', MenuButton: 'MenuButton', MenuItem: 'MenuItem', MenuItems: 'MenuItems' },
    './Home': { Icon: 'Icon' },
    './Icon': { Icon: 'Icon' },
    './fixtures': { hubs: [] },
    './Shared': { PreviewPage: 'PreviewPage', Breadcrumb: 'Breadcrumb', RelatedHubs: 'RelatedHubs' },
    './Components': { ArticleCard: 'ArticleCard', SubjectCard: 'SubjectCard' },
    './ArticleGridControls': { ArticleGridControls: 'ArticleGridControls' },
    './useHeroScroll': { useHeroScroll: () => ({ heroFade: 0, breadcrumbHeight: 0, breadcrumbRef: null }) },
    './content': { byDate: () => 0 },
    './pages-v2.module.scss': { default: {} },
    './home-v2.module.scss': { default: {} },
    './analytics': {
      trackKBEvent: (name, data) => events.push({ name, data: { ...data } }),
      searchLengthBucket: value => (value.trim().length > 30 ? '31-plus' : '1-30'),
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
  return { exports, events, routes }
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
  const tree = exports.ArticleGridControls({ density: 4, placement: 'topic', onDensityChange: () => undefined })
  const menu = nodes(tree).find(node => node.type === 'Menu')
  for (const open of [false, true, true, false, false, true]) {
    const children = menu.props.children({ open })
    const tracker = nodes(children).find(node => typeof node.type === 'function')
    tracker.type(tracker.props)
  }
  assert.deepEqual(events, [
    { name: 'kb_filter_open', data: { placement: 'topic' } },
    { name: 'kb_filter_open', data: { placement: 'topic' } },
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
    { placement: 'topic_articles', hub_id: 'hub-one', subject_id: 'subject-one' },
  )
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
    { name: 'kb_pagination_click', data: { placement: 'archive', page: 1 } },
    { name: 'kb_pagination_click', data: { placement: 'archive', page: 3 } },
  ])
  const card = nodes(tree).find(node => node.type === 'ArticleCard')
  assert.equal(card.props.analyticsContext.placement, 'archive_articles')
})

test('search instrumentation never sends query text and keeps query navigation intact', () => {
  const { exports, events, routes } = loadComponent('Library.tsx')
  const tree = exports.Library({ catalog, mode: 'search', hubId: '', query: 'test', page: 2, total: 80 })
  assert.equal(events.length, 0, 'Restoring a layout preference must not emit an event')
  const query = 'private@example.test looking for payments'
  const form = nodes(tree).find(node => node.type === 'form')
  form.props.onSubmit({ preventDefault: () => undefined, currentTarget: { q: query } })
  assert.deepEqual(events, [
    { name: 'kb_search_submit', data: { placement: 'search', query_length_bucket: '31-plus' } },
  ])
  assert.deepEqual(routes, [`/knowledge-base/search?q=${encodeURIComponent(query)}`])
  const card = nodes(tree).find(node => node.type === 'ArticleCard')
  assert.equal(card.props.analyticsContext.placement, 'search_results')
  const layoutButtons = nodes(tree).filter(node => node.props && Object.hasOwn(node.props, 'aria-pressed'))
  layoutButtons[0].props.onClick()
  assert.equal(events.length, 1, 'Clicking the selected layout is not a change')
  layoutButtons[1].props.onClick()
  assert.deepEqual(events[1], { name: 'kb_layout_change', data: { placement: 'search', layout: 'list' } })
  const next = nodes(tree).find(node => node.props?.href?.startsWith('/knowledge-base/search?page=3'))
  next.props.onClick()
  assert.deepEqual(events[2], { name: 'kb_pagination_click', data: { placement: 'search', page: 3 } })
  const all = nodes(tree).find(node => node.props?.href === '/knowledge-base/articles')
  all.props.onClick()
  assert.deepEqual(events[3], { name: 'kb_cta_click', data: { cta_id: 'all_articles', placement: 'search' } })
})
