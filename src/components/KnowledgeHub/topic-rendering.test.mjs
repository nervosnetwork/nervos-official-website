import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8')
const styles = new Proxy({}, { get: (_, key) => key })
const element = React.createElement

function evaluate(name, imports) {
  const { outputText } = ts.transpileModule(read(name), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    require: dependency => {
      if (dependency === 'react/jsx-runtime') return require(dependency)
      assert.ok(Object.hasOwn(imports, dependency), `Unexpected topic dependency: ${dependency}`)
      return imports[dependency]
    },
  })
  return exports
}

const content = evaluate('content.ts', {})
const article = (id, date, subjects, hub = 'test-hub') => ({
  id,
  language: 'en',
  canonicalPath: `/knowledge-base/${id}`,
  title: `Title ${id}`,
  subtitle: `Summary ${id}`,
  date,
  subjects,
  hub,
  coverImage: `/images/${id}.png`,
  authors: ['Existing author'],
  readingMinutes: 5,
  internalTags: [],
  relatedArticleIds: [],
  excludedFromRecommendations: false,
})
const catalog = {
  hubs: [{ id: 'test-hub', name: 'Test hub', heading: 'Test hub', order: 1 }],
  subjects: [
    { id: 'second-subject', name: 'Second subject', hub: 'test-hub', order: 2 },
    { id: 'first-subject', name: 'First subject', hub: 'test-hub', order: 1 },
    { id: 'empty-subject', name: 'Empty subject', hub: 'test-hub', order: 3 },
    { id: 'unrelated-subject', name: 'Unrelated subject', hub: 'other-hub', order: 1 },
  ],
  articles: [
    article('older-first', '2025-01-01', ['first-subject']),
    article('newest-second', '2026-04-01', ['second-subject']),
    article('shared', '2026-03-01', ['first-subject', 'second-subject']),
    article('unassigned', '2026-02-01', []),
    article('unrelated', '2026-05-01', ['first-subject'], 'other-hub'),
  ],
  featured: [],
}
const hubIds = ['newest-second', 'shared', 'unassigned', 'older-first']

function descendants(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(descendants)
  return [node, ...descendants(node.props?.children)]
}

function harness(props = {}) {
  const states = []
  const events = []
  let stateIndex = 0
  const common = {
    clsx: { default: (...values) => values.filter(Boolean).join(' ') },
    'next/link': { default: 'a' },
    'next/image': { default: 'img' },
    './Icon': { Icon: () => null },
    './ArticleLanguageLink': { ArticleLanguageLink: ({ article: _article, ...props }) => element('a', props) },
    './content': content,
    './analytics': { trackKBEvent: (name, data) => events.push({ name, data: { ...data } }) },
    '../../utils/kb-hubs': { kbHubPath: id => `/knowledge-base/topic/${id}` },
    './components.module.scss': { default: styles },
  }
  const components = evaluate('Components.tsx', common)
  const { Topic } = evaluate('Topic.tsx', {
    ...common,
    react: {
      useState: initial => {
        const index = stateIndex++
        if (!(index in states)) states[index] = initial
        return [states[index], value => (states[index] = value)]
      },
    },
    './Home': { Icon: () => null },
    './fixtures': { hubs: [{ name: 'Test hub', description: 'Existing introduction.' }] },
    './Shared': {
      PreviewPage: ({ children }) => element('main', null, children),
      Breadcrumb: () => null,
      RelatedHubs: () => null,
    },
    './Components': components,
    './ArticleGridControls': { ArticleGridControls: () => null },
    './useHeroScroll': { useHeroScroll: () => ({ heroFade: 0, breadcrumbHeight: 0, breadcrumbRef: null }) },
    './pages-v2.module.scss': { default: styles },
  })
  return {
    events,
    components,
    render() {
      stateIndex = 0
      const tree = Topic({ catalog, hubId: 'test-hub', ...props })
      return { tree, html: renderToStaticMarkup(tree) }
    },
  }
}

function cards(html) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
    .filter(([, attributes]) => /class="articleCard\b/.test(attributes))
    .map(([, attributes, body]) => ({
      id: attributes.match(/href="\/knowledge-base\/([^"]+)"/)[1],
      hidden: /\bhidden=""/.test(attributes),
      attributes,
      body,
    }))
}

function select(view, title, components) {
  const button = descendants(view.tree).find(node => node.type === components.SubjectCard && node.props.title === title)
  assert.ok(button, `Subject control ${title} exists`)
  button.props.onClick()
}

test('Hub SSR includes every hub article once while keeping the original first subject visible', () => {
  const { html } = harness().render()
  const rendered = cards(html)
  assert.deepEqual(
    rendered.map(card => card.id),
    hubIds,
  )
  assert.deepEqual(
    rendered.filter(card => !card.hidden).map(card => card.id),
    ['shared', 'older-first'],
  )
  assert.equal(new Set(rendered.map(card => card.id)).size, rendered.length)
  assert.doesNotMatch(html, /knowledge-base\/unrelated|Unrelated subject/)
  assert.match(html, /<h2 id="subject-title">First subject<\/h2>/)
  assert.match(html, /Showing 2 articles, latest to oldest/)
  assert.match(html, /class="topicGrid density4"/)
  for (const card of rendered) {
    if (card.hidden) {
      assert.match(card.attributes, /style="display:none"/)
      assert.match(card.attributes, /tabindex="-1"/)
    } else {
      assert.doesNotMatch(card.attributes, /style=|tabindex=|hidden=/)
    }
  }
})

test('View all reveals the same cards in date order, and subject changes keep visible analytics positions', () => {
  const app = harness()
  const firstView = app.render()
  select(firstView, 'View all', app.components)
  const allView = app.render()
  assert.deepEqual(
    cards(allView.html).map(card => card.id),
    hubIds,
  )
  assert.ok(cards(allView.html).every(card => !card.hidden))
  assert.match(allView.html, /<h2 id="subject-title">All subjects<\/h2>/)
  assert.match(allView.html, /Showing 4 articles, latest to oldest/)

  select(allView, 'First subject', app.components)
  const filteredView = app.render()
  const renderedCards = descendants(filteredView.tree).filter(node => node.type === app.components.ArticleCard)
  assert.deepEqual(
    renderedCards.filter(node => !node.props.hidden).map(node => node.props.analyticsContext.position),
    [1, 2],
  )
  for (const card of renderedCards) {
    const link = app.components.ArticleCard(card.props)
    link.props.onClick()
  }
  const clicks = app.events.filter(event => event.name === 'kb_article_click')
  assert.deepEqual(
    clicks.map(event => [event.data.article_id, event.data.position]),
    [
      ['shared', 1],
      ['older-first', 2],
    ],
  )
  assert.ok(clicks.every(event => event.data.subject_id === 'first-subject' && event.data.hub_id === 'test-hub'))
})

test('explicit subjects, including an empty one, preserve the complete underlying hub list', () => {
  for (const [subjectId, expectedVisible] of [
    ['second-subject', ['newest-second', 'shared']],
    ['empty-subject', []],
    ['all', hubIds],
    ['unknown-subject', ['shared', 'older-first']],
  ]) {
    const { html } = harness({ subjectId }).render()
    const rendered = cards(html)
    assert.deepEqual(
      rendered.map(card => card.id),
      hubIds,
      subjectId,
    )
    assert.deepEqual(
      rendered.filter(card => !card.hidden).map(card => card.id),
      expectedVisible,
      subjectId,
    )
    assert.equal(html.includes('No articles in this subject yet.'), expectedVisible.length === 0, subjectId)
    assert.ok(html.includes(`Showing ${expectedVisible.length} articles, latest to oldest`))
  }
})

test('an empty hub exposes no other hub articles and keeps the existing empty state', () => {
  const { html } = harness({ hubId: 'empty-hub' }).render()
  assert.deepEqual(cards(html), [])
  assert.match(html, /No articles in this subject yet\./)
  assert.match(html, /Showing 0 articles, latest to oldest/)
})

test('ArticleCard hiding only affects the filtered anchor, preserving visible card markup and cover loading', () => {
  const { components } = harness()
  for (const horizontal of [false, true]) {
    const props = { title: 'Existing title', article: catalog.articles[0], horizontal }
    const visible = renderToStaticMarkup(element(components.ArticleCard, props))
    const explicitVisible = renderToStaticMarkup(element(components.ArticleCard, { ...props, hidden: false }))
    const hidden = renderToStaticMarkup(element(components.ArticleCard, { ...props, hidden: true }))
    assert.equal(visible, explicitVisible)
    assert.equal(hidden.replace(' hidden="" style="display:none" tabindex="-1"', ''), visible)
    assert.match(visible, /background-image:url\(/)
    assert.doesNotMatch(visible, /fetchpriority|loading="eager"|preload/)
  }
})
