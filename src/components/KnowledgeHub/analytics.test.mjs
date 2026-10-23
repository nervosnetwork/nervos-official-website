import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')
const React = require('react')

const directory = path.dirname(fileURLToPath(import.meta.url))

function load(file, imports, globals = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(directory, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    React,
    require: name => (name in imports ? imports[name] : require(name)),
    ...globals,
  })
  return exports
}

function tracker({ production = true, browser = true, track } = {}) {
  const sent = []
  const defaults = {
    website: 'test-only',
    hostname: 'localhost',
    language: 'en',
    screen: '390x844',
    url: '/knowledge-base/search?q=private-input',
    referrer: 'https://example.com/?email=private',
    title: 'private-input',
  }
  const mockedWindow = {
    location: { pathname: '/knowledge-base/search', search: '?q=private-input', hash: '#private' },
    umami: { track: track || (build => sent.push(build(defaults))) },
  }
  return {
    sent,
    mockedWindow,
    ...load('analytics.ts', { '../../utils/env': { IS_PROD: production } }, browser ? { window: mockedWindow } : {}),
  }
}

test('events are disabled in development/preview and on the server', () => {
  for (const options of [{ production: false }, { browser: false }]) {
    const analytics = tracker(options)
    analytics.trackKBEvent('kb_step_select', { step: 2 })
    assert.equal(analytics.sent.length, 0)
  }
})

test('new KB custom events omit search, email, arbitrary properties, and default URL metadata', () => {
  const analytics = tracker()
  analytics.trackKBEvent('kb_search_submit', {
    placement: 'search_page',
    query_length_bucket: '11-30',
    email: 'private@example.com',
    query: 'private-input',
  })
  assert.equal(analytics.sent.length, 1)
  const payload = JSON.parse(JSON.stringify(analytics.sent[0]))
  assert.deepEqual(payload.data, { placement: 'search_page', query_length_bucket: '11-30' })
  assert.equal(payload.name, 'kb_search_submit')
  assert.equal(payload.website, 'test-only')
  assert.equal(payload.url, '/knowledge-base/search')
  assert.equal(payload.title, 'Knowledge Base')
  assert.equal(payload.referrer, '')
  assert.doesNotMatch(JSON.stringify(payload), /private|example\.com|\?q=|#private/)
})

test('only bounded finite values are included and context preserves public article IDs', () => {
  const analytics = tracker()
  analytics.trackKBEvent('kb_article_click', {
    article_id: 'what_are_streaming_payments',
    placement: 'recommended_reading',
    hub_id: 'bad@example.com',
    subject_id: 'x'.repeat(201),
    step: Infinity,
  })
  assert.deepEqual(JSON.parse(JSON.stringify(analytics.sent[0].data)), {
    article_id: 'what_are_streaming_payments',
    placement: 'recommended_reading',
  })
})

test('captures the source path before delayed tracker callbacks or navigation', () => {
  let build
  const analytics = tracker({
    track: callback => {
      build = callback
    },
  })
  analytics.trackKBEvent('kb_cta_click', { cta_id: 'start_here', placement: 'home_hero' })
  analytics.mockedWindow.location.pathname = '/knowledge-base/start-here'
  assert.equal(build({ website: 'test-only' }).url, '/knowledge-base/search')
})

test('absent SDK, thrown errors and rejected promises do not break interactions', async () => {
  const missing = tracker()
  delete missing.mockedWindow.umami
  assert.doesNotThrow(() => missing.trackKBEvent('kb_step_select', { step: 1 }))
  const throwing = tracker({
    track: () => {
      throw new Error('SDK blocked')
    },
  })
  assert.doesNotThrow(() => throwing.trackKBEvent('kb_step_select', { step: 1 }))
  const rejecting = tracker({ track: () => Promise.reject(new Error('offline')) })
  assert.doesNotThrow(() => rejecting.trackKBEvent('kb_step_select', { step: 1 }))
  await new Promise(resolve => setImmediate(resolve))
})

test('search length buckets never contain search text', () => {
  const { searchLengthBucket } = tracker()
  assert.deepEqual(['  ', 'ckb', 'blockchain architecture', 'x'.repeat(200)].map(searchLengthBucket), [
    'empty',
    '1-10',
    '11-30',
    '31-plus',
  ])
})

function components() {
  const sent = []
  return {
    sent,
    ...load('Components.tsx', {
      './analytics': { trackKBEvent: (name, data) => sent.push({ name, data }) },
      './Icon': { Icon: () => null },
      './components.module.scss': {},
      './content': { articlePath: article => article.canonicalPath, formatArticleDate: () => 'Date' },
      'next/link': 'a',
    }),
  }
}

test('shared link buttons and step anchors forward analytics without changing destinations', () => {
  const { ArrowButton, SubjectCard } = components()
  let clicks = 0
  const onClick = () => {
    clicks++
  }
  const link = ArrowButton({ href: '/knowledge-base/start-here', onClick, children: 'Discover CKB' })
  const step = SubjectCard({ href: '#step-2', selected: false, title: 'Step 2', onClick })
  assert.equal(link.props.href, '/knowledge-base/start-here')
  assert.equal(step.props.href, '#step-2')
  link.props.onClick()
  step.props.onClick()
  assert.equal(clicks, 2)
})

test('both article card layouts send one contextual event on click, not on render', () => {
  const { ArticleCard, sent } = components()
  const article = { id: 'existing_slug', canonicalPath: '/knowledge-base/existing_slug' }
  for (const horizontal of [false, true]) {
    const card = ArticleCard({
      title: 'Existing article',
      article,
      horizontal,
      analyticsContext: { placement: 'more_from_ckb' },
    })
    assert.equal(card.props.href, article.canonicalPath)
    const count = sent.length
    card.props.onClick()
    assert.equal(sent.length, count + 1)
  }
  assert.equal(sent.length, 2)
  assert.equal(sent[0].name, 'kb_article_click')
  assert.deepEqual(JSON.parse(JSON.stringify(sent[0].data)), {
    placement: 'more_from_ckb',
    article_id: 'existing_slug',
  })
  ArticleCard({ title: 'Design placeholder' }).props.onClick()
  assert.equal(sent.length, 2)
})
