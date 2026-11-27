import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { KB_HUBS } from '../config/kb-hubs.mjs'

process.env.SKIP_ENV_VALIDATION = '1'
const { default: settings } = await import('../next.config.mjs')
const require = createRequire(import.meta.url)
const i18n = require('../next-i18next.config.js').i18n
const read = filename => readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8')
const origin = 'https://www.nervos.org'
const spec = JSON.parse(read('public/openapi.json'))
const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']
const operations = Object.entries(spec.paths).flatMap(([path, item]) =>
  methods.filter(method => item[method]).map(method => ({ path, method, operation: item[method] })),
)

function resolve(node) {
  if (!node?.$ref) return node
  assert.match(node.$ref, /^#\/components\/schemas\/[A-Za-z]+$/)
  const target = spec.components.schemas[node.$ref.split('/').pop()]
  assert.ok(target, `Unresolved reference: ${node.$ref}`)
  return target
}

test('openapi.json is an OpenAPI 3.1 description of the public, unauthenticated production API', () => {
  assert.equal(spec.openapi, '3.1.0')
  assert.ok(spec.info.title && spec.info.description && /^\d+\.\d+\.\d+$/.test(spec.info.version))
  assert.deepEqual(
    spec.servers.map(server => server.url),
    [origin],
  )
  assert.deepEqual(spec.security, [])
  assert.equal(spec.components.securitySchemes, undefined)
  assert.equal(spec.externalDocs.url, `${origin}/llms.txt`)
  assert.equal(spec.info.contact.url, `${origin}/contact`)
})

test('every operation is read-only and self-describing for function calling', () => {
  assert.deepEqual(operations.map(({ operation }) => operation.operationId).sort(), [
    'getKnowledgeBaseArticle',
    'getTranslatedKnowledgeBaseArticle',
    'searchKnowledgeBase',
  ])
  for (const { path, method, operation } of operations) {
    const label = `${method.toUpperCase()} ${path}`
    assert.equal(method, 'get', `${label}: the public API only reads`)
    assert.match(operation.operationId, /^[a-z][A-Za-z0-9]{2,63}$/, label)
    assert.ok(operation.summary?.length > 10, `${label}: summary`)
    assert.ok(operation.description?.length > 40, `${label}: description`)
    const templated = [...path.matchAll(/\{([^}]+)\}/g)].map(match => match[1])
    const declared = operation.parameters.filter(parameter => parameter.in === 'path').map(parameter => parameter.name)
    assert.deepEqual(declared.sort(), templated.sort(), `${label}: path parameters`)
    for (const parameter of operation.parameters) {
      assert.ok(parameter.description?.length > 10, `${label}: ${parameter.name} description`)
      assert.equal(parameter.schema.type, 'string', `${label}: ${parameter.name} type`)
      if (parameter.in === 'path') assert.equal(parameter.required, true)
    }
    assert.ok(operation.responses['200'], `${label}: success response`)
    for (const [status, response] of Object.entries(operation.responses)) {
      assert.ok(response.description?.length > 10, `${label} ${status}: description`)
      for (const media of Object.values(response.content ?? {})) {
        const schema = resolve(media.schema)
        assert.ok(schema.type, `${label} ${status}: typed schema`)
        if (schema.items) assert.ok(resolve(schema.items).properties, `${label} ${status}: typed items`)
      }
    }
  }
})

test('the search operation matches the handler: parameters, limits, result fields and method handling', () => {
  const search = spec.paths['/api/kb-search'].get
  const [q, locale] = search.parameters
  assert.deepEqual([q.name, q.in, q.required], ['q', 'query', true])
  assert.deepEqual([locale.name, locale.in, locale.required], ['locale', 'query', false])
  assert.deepEqual(locale.schema.enum, i18n.locales)
  assert.equal(locale.schema.default, i18n.defaultLocale)
  const handler = read('src/pages/api/kb-search.page.ts')
  assert.ok(handler.includes(`slice(0, ${q.schema.maxLength})`), 'q length limit')
  const results = search.responses['200'].content['application/json'].schema
  assert.ok(handler.includes(`matches.slice(0, ${results.maxItems})`), 'result limit')
  assert.ok(handler.includes("'X-Total-Count'") && search.responses['200'].headers['X-Total-Count'])
  assert.ok(handler.includes("'public, max-age=60'"))
  // The handler answers other methods with a bodiless 405.
  assert.ok(handler.includes('res.status(405).end()'))
  assert.equal(search.responses['405'].content, undefined)
  assert.deepEqual(Object.keys(spec.components.schemas), ['ArticleSummary'])

  // The result is the public catalog projection without the search corpus.
  const article = spec.components.schemas.ArticleSummary
  const projection = /return \{\n([\s\S]*?)\.\.\.\(includeText/.exec(read('src/server/kb-content.ts'))[1]
  const projected = [...projection.matchAll(/^\s+(?:\.\.\.\(typeof )?([A-Za-z]+)(?:,| ===|: )/gm)].map(
    match => match[1],
  )
  assert.deepEqual(Object.keys(article.properties).sort(), [...new Set(projected)].sort())
  assert.equal(Object.hasOwn(article.properties, 'text'), false)
  assert.deepEqual(
    Object.keys(article.properties)
      .filter(name => !article.required.includes(name))
      .sort(),
    ['description'],
  )
  for (const [name, property] of Object.entries(article.properties)) {
    assert.ok(property.type, `${name}: type`)
    assert.ok(property.description?.length > 10, `${name}: description`)
  }
  assert.deepEqual(article.properties.language.enum, i18n.locales)
  assert.deepEqual(article.properties.hub.enum.filter(Boolean).sort(), KB_HUBS.map(hub => hub.id).sort())
  assert.ok(article.properties.hub.enum.includes(null))
})

test('the Markdown operations describe the existing negotiated article URLs', () => {
  const catalog = JSON.parse(read('public/education_hub_articles/metadata/catalog.json'))
  const published = new Set(catalog.articles.filter(article => !article.draft).map(article => article.language))
  for (const path of ['/knowledge-base/{slug}', '/{locale}/knowledge-base/{slug}']) {
    const operation = spec.paths[path].get
    const slug = operation.parameters.find(parameter => parameter.name === 'slug')
    const pattern = new RegExp(slug.schema.pattern)
    for (const article of catalog.articles) assert.match(article.id, pattern)
    const accept = operation.parameters.find(parameter => parameter.name === 'Accept')
    assert.deepEqual([accept.in, accept.required, accept.schema.enum], ['header', true, ['text/markdown']])
    assert.deepEqual(Object.keys(operation.responses), ['200', '308', '404'])
    for (const status of ['200', '404'])
      assert.deepEqual(Object.keys(operation.responses[status].content), ['text/markdown'])
    assert.ok(operation.responses['308'].headers.Location)
  }
  const locale = spec.paths['/{locale}/knowledge-base/{slug}'].get.parameters.find(
    parameter => parameter.name === 'locale',
  )
  assert.deepEqual([...locale.schema.enum].sort(), [...published].filter(language => language !== 'en').sort())
})

test('the API catalog follows RFC 9727 and both files are served with their media types', async () => {
  const catalog = JSON.parse(read('public/.well-known/api-catalog'))
  assert.deepEqual(Object.keys(catalog), ['linkset'])
  assert.equal(catalog.linkset.length, 1)
  const [entry] = catalog.linkset
  assert.equal(entry.anchor, `${origin}/api/kb-search`)
  assert.ok(Object.hasOwn(spec.paths, new URL(entry.anchor).pathname))
  assert.deepEqual(entry['service-desc'], [
    { href: `${origin}/openapi.json`, type: 'application/vnd.oai.openapi+json;version=3.1' },
  ])
  assert.deepEqual(entry['service-doc'], [{ href: `${origin}/llms.txt`, type: 'text/plain' }])

  const rules = await settings.headers()
  const header = (source, key) => {
    const matching = rules.filter(rule => rule.source === source)
    assert.equal(matching.length, 1, source)
    assert.equal(matching[0].locale, undefined, `${source}: Next must match its internally inferred default locale`)
    return matching[0].headers.find(item => item.key === key)?.value
  }
  assert.equal(header('/openapi.json', 'Content-Type'), 'application/json; charset=utf-8')
  assert.equal(header('/openapi.json', 'Access-Control-Allow-Origin'), '*')
  assert.equal(
    header('/.well-known/api-catalog', 'Content-Type'),
    'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
  )
  assert.equal(header('/.well-known/api-catalog', 'Link'), '</.well-known/api-catalog>; rel="api-catalog"')
})
