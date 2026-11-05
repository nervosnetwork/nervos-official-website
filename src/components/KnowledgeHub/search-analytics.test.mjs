import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

function evaluate(relative, imports, globals = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    ...globals,
    require: name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`)
      return imports[name]
    },
  })
  return exports
}

function searchTracker(fetch, enabled = true) {
  const events = []
  const { trackKBSearch } = evaluate(
    './search-analytics.ts',
    {
      './analytics': {
        KB_ANALYTICS_ENABLED: enabled,
        trackKBEvent: (name, data) => events.push({ name, data: { ...data } }),
        searchLengthBucket: value => `${value.trim().length} characters`,
      },
    },
    { fetch },
  )
  return { trackKBSearch, events }
}

const settled = () => new Promise(resolve => setImmediate(resolve))
const response = (count, ok = true) => ({ ok, headers: { get: name => (name === 'X-Total-Count' ? count : null) } })

test('disabled analytics does not fetch counts or emit events even when the full total is already known', async () => {
  let requests = 0
  const { trackKBSearch, events } = searchTracker(() => {
    requests++
    return Promise.resolve(response('17'))
  }, false)
  trackKBSearch('CKB', 'home_search', 'en')
  trackKBSearch('CKB', 'search', 'en', 17)
  await settled()
  assert.equal(requests, 0)
  assert.deepEqual(events, [])
})

test('search submit returns immediately and records the full count rather than the suggestion count', async () => {
  let resolveCount
  const calls = []
  const { trackKBSearch, events } = searchTracker((url, options) => {
    calls.push({ url, options: { ...options } })
    return new Promise(resolve => {
      resolveCount = resolve
    })
  })
  assert.equal(trackKBSearch('payment channels', 'home_search', 'es'), undefined)
  assert.deepEqual(events, [])
  assert.deepEqual(calls, [
    {
      url: '/api/kb-search?q=payment%20channels&locale=es',
      options: { keepalive: true },
    },
  ])
  resolveCount(response('37'))
  await settled()
  assert.deepEqual(events, [
    {
      name: 'kb_search_submit',
      data: {
        placement: 'home_search',
        search_term: 'payment channels',
        query_length_bucket: '16 characters',
        results_count: 37,
      },
    },
  ])
})

test('out-of-order responses retain the query and placement captured for each submission', async () => {
  const pending = []
  const { trackKBSearch, events } = searchTracker(() => new Promise(resolve => pending.push(resolve)))
  trackKBSearch('first', 'home_search', 'en')
  trackKBSearch('second', 'search', 'zh')
  pending[1](response('12'))
  pending[0](response('3'))
  await settled()
  assert.deepEqual(
    events.map(event => [event.data.search_term, event.data.placement, event.data.results_count]),
    [
      ['second', 'search', 12],
      ['first', 'home_search', 3],
    ],
  )
})

test('missing, failed and invalid count responses omit results_count instead of inventing zero', async () => {
  const fetches = [
    () => Promise.reject(new Error('offline')),
    () => {
      throw new Error('blocked')
    },
    () => Promise.resolve(response('10', false)),
    ...[null, '', '-1', '1.5', 'Infinity', 'NaN', '9007199254740992'].map(
      value => () => Promise.resolve(response(value)),
    ),
  ]
  for (const fetch of fetches) {
    const { trackKBSearch, events } = searchTracker(fetch)
    trackKBSearch('CKB', 'home_all_search_results')
    await settled()
    assert.equal(events.length, 1)
    assert.equal(events[0].data.search_term, 'CKB')
    assert.equal(Object.hasOwn(events[0].data, 'results_count'), false)
  }
  const zero = searchTracker(() => Promise.resolve(response('0')))
  zero.trackKBSearch('no matching article', 'search')
  await settled()
  assert.equal(zero.events[0].data.results_count, 0)
})

test('known server totals bypass the extra request and long terms match the API limit', async () => {
  const calls = []
  const { trackKBSearch, events } = searchTracker(url => {
    calls.push(url)
    return Promise.resolve(response('17'))
  })
  trackKBSearch('known query', 'search', 'en', 80)
  assert.equal(events[0].data.results_count, 80)
  assert.equal(calls.length, 0)
  const longTerm = 'x'.repeat(220)
  trackKBSearch(longTerm, 'home_search')
  await settled()
  assert.equal(new URL(calls[0], 'https://www.nervos.org').searchParams.get('q'), 'x'.repeat(200))
  assert.equal(events[1].data.search_term, 'x'.repeat(200))
  assert.equal(events[1].data.results_count, 17)
})

test('the search API preserves its five-card JSON shape and exposes exact full totals separately', () => {
  const matches = Array.from({ length: 17 }, (_, index) => ({ id: `article-${index}`, text: 'private search corpus' }))
  const { default: handler } = evaluate('../../pages/api/kb-search.page.ts', {
    '../../server/kb-content': {
      getKBCatalog: (locale, includeText) => {
        assert.equal(locale, 'es')
        assert.equal(includeText, true)
        return { articles: matches.map(article => ({ ...article })) }
      },
    },
    '../../components/KnowledgeHub/content': { searchArticles: (query, catalog) => (query ? catalog.articles : []) },
  })
  function run(query) {
    const headers = {}
    let body
    handler(
      { method: 'GET', query: { q: query, locale: 'es' } },
      {
        setHeader: (name, value) => {
          headers[name] = value
        },
        json: value => {
          body = value
        },
      },
    )
    return { headers, body }
  }
  const found = run('CKB')
  assert.equal(found.headers['X-Total-Count'], '17')
  assert.equal(found.headers['Cache-Control'], 'public, max-age=60')
  assert.equal(found.body.length, 5)
  assert.deepEqual(
    Array.from(found.body, article => article.id),
    matches.slice(0, 5).map(article => article.id),
  )
  assert.ok(found.body.every(article => !Object.hasOwn(article, 'text')))
  const empty = run('')
  assert.equal(empty.headers['X-Total-Count'], '0')
  assert.equal(empty.body.length, 0)
})
