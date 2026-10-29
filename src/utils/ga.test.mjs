import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const React = require('react')

const source = fs.readFileSync(new URL('./ga.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
const plain = value => JSON.parse(JSON.stringify(value))

function setup({ env = { NEXT_PUBLIC_VERCEL_ENV: 'production' }, browser = true, gtag, referrer = '' } = {}) {
  const window = {
    location: new URL('https://www.nervos.org/knowledge-base?utm_source=test#top'),
    ...(gtag ? { gtag } : {}),
  }
  const document = { referrer, title: 'Knowledge Base | Nervos Network' }
  const exports = {}
  vm.runInNewContext(compiled, {
    exports,
    URL,
    process: { env },
    document,
    require: name => {
      assert.equal(name, './env')
      return { IS_PROD: env.NEXT_PUBLIC_VERCEL_ENV === 'production' }
    },
    ...(browser ? { window } : {}),
  })
  return { ...exports, window, document, commands: () => (window.dataLayer || []).map(args => plain(Array.from(args))) }
}

test('production initializes the existing stream once and queues events before the SDK loads', () => {
  const ga = setup()
  assert.equal(ga.GA_MEASUREMENT_ID, 'G-WVH440CNZ3')
  ga.trackGAEvent('kb_hub_click', { hub: 'quantum', click_source: 'home' })
  ga.trackGAEvent('kb_hub_click', { hub: 'security', click_source: 'home' })
  const calls = ga.commands()
  assert.deepEqual(plain(calls.map(call => call[0])), ['js', 'config', 'event', 'event'])
  assert.deepEqual(calls[1], ['config', 'G-WVH440CNZ3', { send_page_view: false }])
  assert.equal(calls[2][2].content_group, 'kb_home')
  assert.equal(calls[2][2].page_location, 'https://www.nervos.org/knowledge-base')
  assert.equal(calls[2][2].page_title, ga.document.title)
  assert.equal(calls[2][2].page_referrer, '')
  assert.equal(calls[2][2].debug_mode, undefined)
})

test('preview requires an explicit non-production measurement ID; local opt-in does too', () => {
  for (const env of [
    {},
    { NEXT_PUBLIC_VERCEL_ENV: 'preview' },
    { NEXT_PUBLIC_VERCEL_ENV: 'preview', NEXT_PUBLIC_GA_PREVIEW_MEASUREMENT_ID: 'G-WVH440CNZ3' },
    { NEXT_PUBLIC_VERCEL_ENV: 'preview', NEXT_PUBLIC_GA_PREVIEW_MEASUREMENT_ID: 'invalid' },
    { NEXT_PUBLIC_GA_DEBUG: 'true' },
    { NEXT_PUBLIC_GA_PREVIEW_MEASUREMENT_ID: 'G-TESTONLY' },
  ]) {
    const ga = setup({ env })
    ga.trackGAPageView('/knowledge-base')
    ga.trackGAEvent('kb_hub_click', { hub: 'test' })
    assert.equal(ga.GA_ENABLED, false)
    assert.equal(ga.commands().length, 0)
  }
  for (const env of [
    { NEXT_PUBLIC_VERCEL_ENV: 'preview', NEXT_PUBLIC_GA_PREVIEW_MEASUREMENT_ID: 'G-TESTONLY' },
    { NEXT_PUBLIC_GA_DEBUG: 'true', NEXT_PUBLIC_GA_PREVIEW_MEASUREMENT_ID: 'G-TESTONLY' },
  ]) {
    const ga = setup({ env })
    ga.trackGAPageView('/knowledge-base')
    assert.equal(ga.GA_ENABLED, true)
    assert.equal(ga.commands()[1][1], 'G-TESTONLY')
    assert.equal(ga.commands()[2][0], 'set')
    assert.equal(ga.commands()[3][2].debug_mode, true)
    assert.doesNotMatch(JSON.stringify(ga.commands()), /G-WVH440CNZ3/)
  }
})

test('production can use a verified explicit ID without debug mode', () => {
  const ga = setup({
    env: {
      NEXT_PUBLIC_VERCEL_ENV: 'production',
      NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-OVERRIDE',
      NEXT_PUBLIC_GA_DEBUG: 'true',
    },
  })
  ga.trackGAPageView('/')
  assert.equal(ga.commands()[1][1], 'G-OVERRIDE')
  assert.equal(ga.commands().at(-1)[2].debug_mode, undefined)
})

test('page views deduplicate StrictMode and hash changes, but count route/query changes and back navigation', () => {
  const ga = setup({ referrer: 'https://example.org/start?email=private@example.org#private' })
  ga.trackGAPageView('/knowledge-base')
  ga.trackGAPageView('/knowledge-base')
  ga.trackGAPageView('/knowledge-base#hub')
  ga.window.location = new URL('https://www.nervos.org/knowledge-base/articles?page=2')
  ga.document.title = 'All articles'
  ga.trackGAPageView('/knowledge-base/articles?page=2')
  ga.window.location = new URL('https://www.nervos.org/knowledge-base/articles?page=3')
  ga.trackGAPageView('/knowledge-base/articles?page=3')
  ga.window.location = new URL('https://www.nervos.org/knowledge-base')
  ga.trackGAPageView('/knowledge-base')
  const views = ga.commands().filter(call => call[0] === 'event' && call[1] === 'page_view')
  assert.equal(views.length, 4)
  assert.equal(views[0][2].page_referrer, 'https://example.org/start')
  assert.equal(views[1][2].page_referrer, 'https://www.nervos.org/knowledge-base')
  assert.equal(views[1][2].content_group, 'all_articles')
  assert.equal(views[1][2].page_title, 'All articles')
  assert.doesNotMatch(JSON.stringify(views), /private|email|page=|#hub/)
})

test('all six page groups handle real locales and article routes', () => {
  const ga = setup()
  for (const [path, group] of [
    ['/knowledge-base', 'kb_home'],
    ['/zh/knowledge-base', 'kb_home'],
    ['/knowledge-base/topic', 'hub'],
    ['/es/knowledge-base/topic/scalability', 'hub'],
    ['/knowledge-base/start-here', 'start_here'],
    ['/knowledge-base/articles', 'all_articles'],
    ['/zh/knowledge-base/search', 'all_articles'],
    ['/knowledge-base/existing_slug', 'article'],
    ['/es/knowledge-base/the-case-for-rgbpp', 'article'],
    ['/', 'core'],
    ['/developers', 'core'],
    ['/zh/ckbpage', 'core'],
  ])
    assert.equal(ga.contentGroup(path), group, path)
})

test('page metadata strips queries and search titles; direct arrivals have an empty referrer', () => {
  const ga = setup()
  ga.window.location = new URL('https://preview.example/knowledge-base/search?q=private@example.org#private')
  ga.document.title = 'Search private@example.org'
  ga.trackGAPageView('/knowledge-base/search?q=private@example.org')
  const view = ga.commands().at(-1)[2]
  assert.equal(view.page_referrer, '')
  assert.equal(view.page_title, 'Knowledge Base')
  assert.equal(view.page_location, 'https://preview.example/knowledge-base/search')
  ga.trackGAEvent('kb_search_submit', { search_term: '[redacted]' })
  assert.doesNotMatch(JSON.stringify(ga.commands()), /private/)
})

test('URL and text filters reject common sensitive inputs, bound output and accept editorial labels', () => {
  const ga = setup()
  assert.equal(ga.analyticsURL('/knowledge-base/ckb?q=email#private'), 'https://www.nervos.org/knowledge-base/ckb')
  for (const url of [
    '',
    'mailto:a@example.org',
    'javascript:alert(1)',
    'https://a:b@example.org',
    '/a%40example.org',
  ]) {
    assert.equal(ga.analyticsURL(url), undefined, url)
  }
  for (const text of [
    'test@example.org',
    'https://example.org',
    '0x' + 'a'.repeat(40),
    'ckb1' + 'q'.repeat(40),
    'bc1' + 'a'.repeat(40),
    '+1 (202) 555-0123',
    'line\nbreak',
    'nul\u0000value',
  ]) {
    assert.equal(ga.analyticsText(text), undefined, text)
  }
  assert.equal(ga.analyticsText('  Layer   1 vs Layer 2  '), 'Layer 1 vs Layer 2')
  assert.equal(ga.analyticsText('What is CKB?'), 'What is CKB?')
  assert.equal(Array.from(ga.analyticsText('中'.repeat(120))).length, 100)
})

test('SSR and throwing trackers never interrupt page navigation or interaction', () => {
  const server = setup({ browser: false })
  assert.doesNotThrow(() => server.trackGAEvent('click', {}))
  assert.doesNotThrow(() => server.trackGAPageView('/'))
  const blocked = setup({
    gtag: () => {
      throw new Error('blocked')
    },
  })
  assert.doesNotThrow(() => blocked.trackGAPageView('/'))
  assert.doesNotThrow(() => blocked.trackGAEvent('click', {}))
})

test('GoogleAnalytics loads one afterInteractive script and reports only a ready router', () => {
  const component = ts.transpileModule(
    fs.readFileSync(new URL('../components/GoogleAnalytics/index.tsx', import.meta.url), 'utf8'),
    {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
    },
  ).outputText
  const router = { isReady: false, asPath: '/knowledge-base' }
  const events = []
  const effects = []
  const exports = {}
  vm.runInNewContext(component, {
    exports,
    React,
    require: name =>
      ({
        react: { useEffect: (callback, dependencies) => effects.push({ callback, dependencies }) },
        'next/script': 'script',
        'next/router': { useRouter: () => router },
        '../../utils/ga': {
          GA_ENABLED: true,
          GA_MEASUREMENT_ID: 'G-TESTONLY',
          trackGAPageView: path => events.push(path),
        },
      })[name],
  })
  const element = exports.GoogleAnalytics()
  assert.equal(element.props.strategy, 'afterInteractive')
  assert.equal(element.props.src, 'https://www.googletagmanager.com/gtag/js?id=G-TESTONLY')
  effects.at(-1).callback()
  assert.equal(events.length, 0)
  router.isReady = true
  exports.GoogleAnalytics()
  effects.at(-1).callback()
  assert.deepEqual(events, ['/knowledge-base'])
  assert.deepEqual(plain(effects.at(-1).dependencies), [true, '/knowledge-base'])
  const app = fs.readFileSync(new URL('../pages/_app.page.tsx', import.meta.url), 'utf8')
  assert.equal((app.match(/<GoogleAnalytics\s*\/>/g) || []).length, 1)
  assert.doesNotMatch(app, /scripts\/google-analytics\.js|gtag\/js/)
})
