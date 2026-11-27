import assert from 'node:assert/strict'
import fs from 'node:fs'

// Run against next start, not next dev: node scripts/check-agent-api-http.mjs [origin]
const origin = process.argv[2] ?? 'http://localhost:3010'
const production = 'https://www.nervos.org'
const read = filename => fs.readFileSync(filename, 'utf8')
const spec = JSON.parse(read('public/openapi.json'))
const articleSchema = spec.components.schemas.ArticleSummary

async function request(pathname, { method = 'GET', accept = 'application/json' } = {}) {
  const response = await fetch(origin + pathname, {
    method,
    headers: { Accept: accept },
    redirect: 'manual',
    signal: AbortSignal.timeout(45000),
  })
  return { response, body: await response.text() }
}

let checked = 0

// The two machine-readable files are served unchanged with their media types.
for (const method of ['GET', 'HEAD']) {
  const description = await request('/openapi.json', { method })
  assert.equal(description.response.status, 200, `${method} /openapi.json`)
  assert.match(description.response.headers.get('content-type') ?? '', /^application\/json; charset=utf-8$/i)
  assert.equal(description.response.headers.get('access-control-allow-origin'), '*')
  if (method === 'GET') assert.deepEqual(JSON.parse(description.body), spec)
  const catalog = await request('/.well-known/api-catalog', { method })
  assert.equal(catalog.response.status, 200, `${method} /.well-known/api-catalog`)
  assert.equal(
    catalog.response.headers.get('content-type'),
    'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
  )
  assert.equal(catalog.response.headers.get('link'), '</.well-known/api-catalog>; rel="api-catalog"')
  if (method === 'GET') {
    const [entry] = JSON.parse(catalog.body).linkset
    assert.equal(entry.anchor, `${production}/api/kb-search`)
    assert.equal(entry['service-desc'][0].href, `${production}/openapi.json`)
  }
  checked += 2
}
for (const pathname of ['/zh/openapi.json', '/zh/.well-known/api-catalog']) {
  assert.equal((await request(pathname)).response.status, 404, `${pathname}: no translated alias`)
  checked++
}

// searchKnowledgeBase returns what the description promises.
const allowed = new Set(Object.keys(articleSchema.properties))
for (const locale of ['en', 'zh', 'es']) {
  const { response, body } = await request(`/api/kb-search?q=ckb&locale=${locale}`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /^application\/json/)
  assert.equal(response.headers.get('cache-control'), 'public, max-age=60')
  const results = JSON.parse(body)
  assert.ok(Array.isArray(results) && results.length > 0 && results.length <= 5, `${locale}: one to five results`)
  assert.ok(Number(response.headers.get('x-total-count')) >= results.length)
  for (const article of results) {
    for (const name of articleSchema.required) assert.ok(Object.hasOwn(article, name), `${locale}: ${name}`)
    for (const name of Object.keys(article)) assert.ok(allowed.has(name), `${locale}: undocumented field ${name}`)
    assert.equal(article.language, locale)
    assert.ok(articleSchema.properties.hub.enum.includes(article.hub), `${locale}: hub ${article.hub}`)
    assert.ok(Number.isInteger(article.readingMinutes))
    assert.ok(article.availableLanguages.includes(locale))
  }
  // The documented follow-up: read a result as Markdown at its canonical path.
  const article = await request(results[0].canonicalPath, { accept: 'text/markdown' })
  assert.equal(article.response.status, 200, results[0].canonicalPath)
  assert.equal(article.response.headers.get('content-type'), 'text/markdown; charset=utf-8')
  assert.match(article.response.headers.get('vary') ?? '', /Accept/i)
  assert.ok(article.body.startsWith('# '))
  assert.ok(article.body.includes(`Source: ${production}${results[0].canonicalPath}`))
  checked += 2
}
const empty = await request('/api/kb-search?q=')
assert.deepEqual([empty.response.status, empty.body, empty.response.headers.get('x-total-count')], [200, '[]', '0'])
const other = await request('/api/kb-search?q=ckb&locale=fr')
assert.deepEqual([other.response.status, other.body], [200, '[]'], 'A language without articles is an empty list')
checked += 2

// Documented Markdown redirects and the Markdown 404.
const english = JSON.parse((await request('/api/kb-search?q=ckb')).body)
const untranslated = english.find(article => !article.availableLanguages.includes('es'))
if (untranslated) {
  const redirect = await request(`/es/knowledge-base/${untranslated.id}`, { accept: 'text/markdown' })
  assert.equal(redirect.response.status, 308, 'A missing translation redirects to English')
  assert.equal(new URL(redirect.response.headers.get('location'), origin).pathname, untranslated.canonicalPath)
  checked++
}
const missing = await request('/knowledge-base/agent_api_check_not_present', { accept: 'text/markdown' })
assert.equal(missing.response.status, 404)
assert.equal(missing.response.headers.get('content-type'), 'text/markdown; charset=utf-8')
checked++

// Other methods and unknown API paths keep their existing responses.
for (const method of ['POST', 'PUT', 'DELETE']) {
  const result = await request('/api/kb-search?q=ckb', { method })
  assert.equal(result.response.status, 405, `${method} /api/kb-search`)
  assert.equal(result.body, '', `${method} /api/kb-search: no body`)
  checked++
}
const unknownApi = await request('/api/agent-api-check-not-present')
assert.equal(unknownApi.response.status, 404)
checked++

// Existing API routes and pages keep their behavior.
const release = await request('/api/kb/release')
assert.equal(release.response.status, 200)
assert.equal(JSON.parse(release.body).schemaVersion, 1)
const page = await request('/knowledge-base/agent_api_check_not_present', { accept: 'text/html' })
assert.equal(page.response.status, 404)
assert.match(page.response.headers.get('content-type') ?? '', /^text\/html/, 'Missing pages keep the HTML error page')
const unknownPage = await request('/agent-api-check-not-present', { accept: 'text/html' })
assert.equal(unknownPage.response.status, 404)
assert.match(unknownPage.response.headers.get('content-type') ?? '', /^text\/html/)
checked += 3

// The site guide and the home page data point to the same resources.
const llms = (await request('/llms.txt', { accept: 'text/plain' })).body
assert.ok(llms.includes(`${production}/openapi.json`) && llms.includes(`${production}/.well-known/api-catalog`))
const home = (await request('/', { accept: 'text/html' })).body
const graph = JSON.parse(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s.exec(home)[1])['@graph']
const organization = graph.find(node => node['@type'] === 'Organization')
assert.deepEqual(
  organization.contactPoint.map(point => [point.contactType, point.email ?? null, point.url]),
  [
    ['general enquiries', null, `${production}/contact`],
    ['privacy requests', 'media@nervos.org', `${production}/privacy`],
  ],
)
for (const pathname of ['/contact', '/privacy'])
  assert.equal((await request(pathname, { accept: 'text/html' })).response.status, 200, pathname)
assert.ok((await request('/privacy', { accept: 'text/html' })).body.includes('media@nervos.org'))
assert.ok(!Object.hasOwn(organization, 'address') && !Object.hasOwn(organization, 'telephone'))
for (const term of organization.knowsAbout) assert.ok(home.includes(term), `Home page shows "${term}"`)
checked += 4

console.log(
  `${checked} HTTP checks passed: OpenAPI description, RFC 9727 catalog, documented search results and Markdown follow-ups, unchanged routes, and home page contact data.`,
)
