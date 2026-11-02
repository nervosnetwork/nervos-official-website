import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const measurementId = 'G-TEST1234'
const previewMeasurementId = 'G-PREVIEW1234'
const commonPayload = {
  send_to: measurementId,
  content_group: 'kb_home',
  page_location: 'https://www.nervos.org/knowledge-base',
  page_referrer: '',
  page_title: 'Knowledge Base',
}
const plain = value => JSON.parse(JSON.stringify(value))

function load(relativePath, imports, globals) {
  const { outputText } = ts.transpileModule(fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    require: name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected analytics dependency: ${name}`)
      return imports[name]
    },
    ...globals,
  })
  return exports
}

function bridge({
  production = true,
  preview = false,
  browser = true,
  sdk = true,
  id = measurementId,
  previewId,
  debug = false,
  title = 'Knowledge Base',
} = {}) {
  const gaCommands = []
  const umamiEvents = []
  const defaults = {
    website: 'mock-website',
    hostname: 'www.nervos.org',
    language: 'en',
    screen: '1440x900',
    url: '/knowledge-base?email=private@example.test#private',
    referrer: 'https://referrer.test/?email=private@example.test',
    title: 'private@example.test',
  }
  const window = {
    location: new URL('https://www.nervos.org/knowledge-base?email=private@example.test#private'),
    umami: { track: build => umamiEvents.push(plain(build(defaults))) },
    ...(sdk ? { gtag: (...args) => gaCommands.push(plain(args)) } : {}),
  }
  const globals = {
    URL,
    process: {
      env: {
        NEXT_PUBLIC_GA_MEASUREMENT_ID: id,
        NEXT_PUBLIC_GA_PREVIEW_MEASUREMENT_ID: previewId,
        NEXT_PUBLIC_GA_DEBUG: String(debug),
        NEXT_PUBLIC_VERCEL_ENV: preview ? 'preview' : production ? 'production' : 'development',
      },
    },
    ...(browser ? { window, document: { title, referrer: 'https://referrer.test/?email=private@example.test' } } : {}),
  }
  const ga = load('../../utils/ga.ts', { './env': { IS_PROD: production } }, globals)
  const analytics = load(
    './analytics.ts',
    { '../../utils/env': { IS_PROD: production }, '../../utils/ga': ga },
    globals,
  )
  return {
    ...analytics,
    ga,
    window,
    gaCommands,
    umamiEvents,
    events: () => gaCommands.filter(call => call[0] === 'event'),
  }
}

const cases = [
  {
    name: 'kb_article_click',
    input: {
      article_id: 'what-is-ckb',
      hub_id: 'ckb',
      subject_id: 'basics',
      step: 1,
      placement: 'more_from_ckb',
      position: 2,
    },
    ga: { article_slug: 'what-is-ckb', hub: 'ckb', click_source: 'more_from_ckb', position: 2 },
    umami: { article_id: 'what-is-ckb', placement: 'more_from_ckb', hub_id: 'ckb', subject_id: 'basics', step: 1 },
  },
  {
    name: 'kb_hub_click',
    input: { hub_id: 'blockchain-scalability', placement: 'home_hub_heading' },
    ga: { hub: 'blockchain-scalability', click_source: 'home_hub_heading' },
    umami: { hub_id: 'blockchain-scalability', placement: 'home_hub_heading' },
  },
  {
    name: 'kb_subject_select',
    input: { hub_id: 'blockchain-scalability', subject_id: 'payment-channels', placement: 'topic' },
    ga: { hub: 'blockchain-scalability', subject: 'payment-channels' },
    umami: { hub_id: 'blockchain-scalability', subject_id: 'payment-channels', placement: 'topic' },
  },
  {
    name: 'kb_cta_click',
    input: { cta_id: 'start_here', placement: 'home_hero' },
    ga: { cta_name: 'start_here', cta_location: 'home_hero' },
    umami: { cta_id: 'start_here', placement: 'home_hero' },
  },
  {
    name: 'kb_step_select',
    input: { step: 2, step_name: 'Why CKB is different' },
    ga: { step_number: 2, step_name: 'Why CKB is different' },
    umami: { step: 2 },
  },
  {
    name: 'kb_resource_click',
    input: {
      resource_id: 'developer_docs',
      placement: 'signal_resources',
      link_url: 'https://docs.nervos.org/docs/?private=1#next',
    },
    ga: { resource: 'docs', link_url: 'https://docs.nervos.org/docs/' },
    umami: { resource_id: 'developer_docs', placement: 'signal_resources' },
  },
  {
    name: 'kb_social_click',
    input: { network: 'twitter', placement: 'footer', link_url: 'https://x.com/NervosNetwork?private=1#next' },
    ga: { network: 'twitter', link_url: 'https://x.com/NervosNetwork' },
    umami: { network: 'twitter', placement: 'footer' },
  },
  {
    name: 'kb_search_submit',
    input: { placement: 'search', query_length_bucket: '11-30', search_term: '  cell   model  ', results_count: 0 },
    ga: { search_term: 'cell model', results_count: 0 },
    umami: { placement: 'search', query_length_bucket: '11-30' },
  },
  {
    name: 'kb_pagination_click',
    input: { placement: 'archive', page: 3, direction: 'next' },
    ga: { direction: 'next', page_number: 3, page_type: 'all_articles' },
    umami: { placement: 'archive', page: 3 },
  },
  {
    name: 'kb_footer_link_click',
    input: {
      group: 'learn',
      link_id: 'knowledge_base',
      link_text: 'Knowledge Base',
      link_url: '/knowledge-base?private=1#next',
    },
    ga: { link_text: 'Knowledge Base', link_url: 'https://www.nervos.org/knowledge-base' },
    umami: { group: 'learn', link_id: 'knowledge_base' },
  },
  {
    name: 'kb_toc_click',
    input: { article_id: 'what-is-ckb', section_index: 2, placement: 'mobile', heading_text: 'What is CKB?' },
    ga: { article_slug: 'what-is-ckb', heading_text: 'What is CKB?' },
    umami: { article_id: 'what-is-ckb', section_index: 2, placement: 'mobile' },
  },
  {
    name: 'kb_layout_change',
    input: { placement: 'archive', layout: 'grid', columns: 4 },
    ga: { layout: 'grid', columns: 4 },
    umami: { placement: 'archive', layout: 'grid', columns: 4 },
  },
  {
    name: 'kb_filter_open',
    input: { placement: 'topic', hub_id: 'blockchain-scalability' },
    ga: { page_type: 'hub', hub: 'blockchain-scalability' },
    umami: { placement: 'topic' },
  },
  {
    name: 'kb_back_to_top',
    input: { article_id: 'what-is-ckb' },
    ga: { article_slug: 'what-is-ckb' },
    umami: { article_id: 'what-is-ckb' },
  },
  {
    name: 'kb_newsletter_submit',
    input: { placement: 'signal', status: 'accepted' },
    ga: { form_location: 'signal', status: 'accepted' },
    umami: { placement: 'signal' },
  },
  {
    name: 'link_click',
    input: {
      link_url: 'https://github.com/nervosnetwork/?private=1#next',
      outbound: true,
      destination_category: 'source_repository',
    },
    ga: { link_url: 'https://github.com/nervosnetwork/', link_domain: 'github.com', outbound: true },
    umami: { destination_category: 'source_repository' },
  },
  {
    name: 'scroll_depth',
    input: { percent_scrolled: 75 },
    ga: { percent_scrolled: 75 },
    umami: { percent_scrolled: 75 },
  },
]

test('D20 has exactly 17 GA event cases with distinct event names', () => {
  assert.equal(cases.length, 17)
  assert.equal(new Set(cases.map(item => item.name)).size, 17)
})

for (const item of cases) {
  test(`${item.name} sends the exact D20 GA4 payload and preserves production Umami parameters`, () => {
    const analytics = bridge()
    analytics.trackKBEvent(item.name, {
      ...item.input,
      email: 'private@example.test',
      firstName: 'Private Name',
      unknown_property: 'private-secret',
    })
    assert.deepEqual(analytics.events(), [['event', item.name, { ...item.ga, ...commonPayload }]])
    assert.equal(analytics.umamiEvents.length, 1)
    assert.equal(analytics.umamiEvents[0].name, item.name)
    assert.deepEqual(analytics.umamiEvents[0].data, item.umami)
    assert.equal(analytics.umamiEvents[0].url, '/knowledge-base')
    assert.equal(analytics.umamiEvents[0].referrer, '')
    assert.equal(analytics.umamiEvents[0].title, 'Knowledge Base')
    assert.doesNotMatch(JSON.stringify([analytics.events(), analytics.umamiEvents]), /private|Private Name|firstName/)
  })
}

test('footer documentation, GitHub and explorer resources map to the agreed GA resource values', () => {
  for (const [resourceId, resource, linkUrl] of [
    ['developer_docs', 'docs', 'https://docs.nervos.org/'],
    ['github', 'github', 'https://github.com/nervosnetwork/'],
    ['explorer', 'explorer', 'https://explorer.nervos.org/'],
  ]) {
    const analytics = bridge()
    analytics.trackKBEvent('kb_resource_click', { resource_id: resourceId, placement: 'footer', link_url: linkUrl })
    assert.deepEqual(analytics.events(), [
      [
        'event',
        'kb_resource_click',
        {
          resource,
          link_url: linkUrl,
          ...commonPayload,
        },
      ],
    ])
    assert.deepEqual(analytics.umamiEvents[0].data, { resource_id: resourceId, placement: 'footer' })
  }
})

test('article experiment exposures and Discover clicks carry the same variant in GA4 and Umami', () => {
  const analytics = bridge()
  const context = {
    experiment_id: 'article_discover_placement_v1',
    variant: 'B',
    article_id: 'what_is_ckb',
    layout: 'inline',
  }
  analytics.trackKBEvent('kb_experiment_view', { ...context, unknown_property: 'private-secret' })
  analytics.trackKBEvent('kb_cta_click', { ...context, cta_id: 'discover_ckb', placement: 'article_right_banner' })
  assert.deepEqual(analytics.events(), [
    [
      'event',
      'kb_experiment_view',
      {
        ...commonPayload,
        experiment_id: context.experiment_id,
        variant: 'B',
        article_slug: 'what_is_ckb',
        layout: 'inline',
      },
    ],
    [
      'event',
      'kb_cta_click',
      {
        ...commonPayload,
        experiment_id: context.experiment_id,
        variant: 'B',
        article_slug: 'what_is_ckb',
        cta_name: 'discover_ckb',
        cta_location: 'article_right_banner',
        layout: 'inline',
      },
    ],
  ])
  assert.deepEqual(
    analytics.umamiEvents.map(event => event.data),
    [context, { ...context, cta_id: 'discover_ckb', placement: 'article_right_banner' }],
  )
})

test('newsletter result diagnostics never go to GA but remain in production Umami', () => {
  const analytics = bridge()
  for (const outcome of ['accepted', 'error']) {
    analytics.trackKBEvent('kb_newsletter_result', { placement: 'footer', outcome })
  }
  assert.deepEqual(analytics.gaCommands, [])
  assert.deepEqual(
    analytics.umamiEvents.map(event => event.data),
    [
      { placement: 'footer', outcome: 'accepted' },
      { placement: 'footer', outcome: 'error' },
    ],
  )
})

test('explicitly isolated preview enables GA DebugView events without enabling Umami', () => {
  const analytics = bridge({ production: false, preview: true, previewId: previewMeasurementId })
  assert.equal(analytics.KB_ANALYTICS_ENABLED, true)
  analytics.trackKBEvent('kb_cta_click', { cta_id: 'start_here', placement: 'home_hero' })
  assert.deepEqual(analytics.events(), [
    [
      'event',
      'kb_cta_click',
      {
        cta_name: 'start_here',
        cta_location: 'home_hero',
        ...commonPayload,
        send_to: previewMeasurementId,
        debug_mode: true,
      },
    ],
  ])
  assert.deepEqual(analytics.umamiEvents, [])
  analytics.trackKBEvent('kb_newsletter_result', { placement: 'signal', outcome: 'error' })
  assert.equal(analytics.events().length, 1)
  assert.deepEqual(analytics.umamiEvents, [])
})

test('preview without an isolated measurement ID never sends analytics to the production stream', () => {
  for (const previewId of [undefined, measurementId, 'not-a-measurement-id']) {
    const analytics = bridge({ production: false, preview: true, previewId })
    assert.equal(analytics.KB_ANALYTICS_ENABLED, false)
    analytics.trackKBEvent('kb_cta_click', { cta_id: 'start_here', placement: 'home_hero' })
    assert.deepEqual(analytics.gaCommands, [])
    assert.deepEqual(analytics.umamiEvents, [])
  }
})

test('local debug requires explicit debug opt-in and an isolated measurement ID', () => {
  const analytics = bridge({ production: false, debug: true, previewId: previewMeasurementId })
  analytics.trackKBEvent('kb_back_to_top', { article_id: 'what-is-ckb' })
  assert.deepEqual(analytics.events(), [
    [
      'event',
      'kb_back_to_top',
      {
        article_slug: 'what-is-ckb',
        ...commonPayload,
        send_to: previewMeasurementId,
        debug_mode: true,
      },
    ],
  ])
  assert.deepEqual(analytics.umamiEvents, [])
  const disabled = bridge({ production: false, previewId: previewMeasurementId })
  disabled.trackKBEvent('kb_back_to_top', { article_id: 'what-is-ckb' })
  assert.deepEqual(disabled.events(), [])
})

test('disabled development and SSR never initialize or emit browser analytics', () => {
  for (const options of [{ production: false }, { browser: false }]) {
    const analytics = bridge(options)
    analytics.trackKBEvent('kb_cta_click', { cta_id: 'start_here', placement: 'home_hero' })
    assert.deepEqual(analytics.gaCommands, [])
    assert.deepEqual(analytics.umamiEvents, [])
    assert.equal(analytics.window.nervosGAInitialized, undefined)
  }
})

test('invalid GA measurement ID disables only GA and preserves existing production Umami', () => {
  const analytics = bridge({ id: 'not-a-measurement-id' })
  analytics.trackKBEvent('kb_step_select', { step: 1, step_name: 'Introduction' })
  assert.deepEqual(analytics.gaCommands, [])
  assert.deepEqual(analytics.umamiEvents[0].data, { step: 1 })
})

test('search PII is redacted; free-form values, page query/hash and query-bearing titles never leak', () => {
  for (const searchTerm of [
    'reader@example.test',
    'https://private.test/name',
    '0x1234567890abcdef12345678',
    '+1 (415) 555-0199',
    'private\nsecret',
  ]) {
    const analytics = bridge({ title: 'Search results for private@example.test' })
    analytics.window.location = new URL('https://www.nervos.org/knowledge-base/search?q=reader@example.test#private')
    analytics.trackKBEvent('kb_search_submit', {
      placement: 'search',
      query_length_bucket: '11-30',
      search_term: searchTerm,
      results_count: 3,
      query: searchTerm,
      email: 'reader@example.test',
      firstName: 'Secret Name',
    })
    const payload = analytics.events()[0][2]
    assert.deepEqual(payload, {
      search_term: '[redacted]',
      results_count: 3,
      ...commonPayload,
      content_group: 'all_articles',
      page_location: 'https://www.nervos.org/knowledge-base/search',
    })
    assert.doesNotMatch(
      JSON.stringify([analytics.events(), analytics.umamiEvents]),
      /reader@|private|Secret Name|\?q=|#private/,
    )
  }
})

test('unsafe URL values and non-finite counts are omitted instead of entering GA payloads', () => {
  const analytics = bridge()
  for (const link_url of [
    'mailto:reader@example.test',
    'https://user:password@example.test/path',
    '/private/reader%40example.test',
  ]) {
    analytics.trackKBEvent('kb_social_click', { network: 'twitter', placement: 'footer', link_url })
  }
  for (const [, , payload] of analytics.events()) assert.deepEqual(payload, { network: 'twitter', ...commonPayload })
  assert.deepEqual(
    plain(
      analytics.gaEventData('kb_article_click', {
        article_id: 'what-is-ckb',
        placement: 'archive_articles',
        position: Infinity,
        email: 'reader@example.test',
      }),
    ),
    { article_slug: 'what-is-ckb', hub: 'unassigned', click_source: 'archive_articles' },
  )
})

test('a first event before the external SDK loads is queued once with initialized GA context', () => {
  const analytics = bridge({ sdk: false })
  analytics.trackKBEvent('kb_cta_click', { cta_id: 'start_here', placement: 'home_hero' })
  analytics.trackKBEvent('scroll_depth', { percent_scrolled: 25 })
  const commands = plain(Array.from(analytics.window.dataLayer, args => Array.from(args)))
  assert.equal(commands.filter(command => command[0] === 'js').length, 1)
  assert.deepEqual(
    commands.find(command => command[0] === 'config'),
    ['config', measurementId, { send_page_view: false }],
  )
  assert.deepEqual(
    commands.filter(command => command[0] === 'event'),
    [
      ['event', 'kb_cta_click', { cta_name: 'start_here', cta_location: 'home_hero', ...commonPayload }],
      ['event', 'scroll_depth', { percent_scrolled: 25, ...commonPayload }],
    ],
  )
})
