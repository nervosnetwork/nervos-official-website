import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { DOMParser } from '@xmldom/xmldom'

// Read-only local acceptance: node scripts/check-sitemap-http.mjs [local origin]
// Production URLs are assertions only; no requests ever go to the live site.
const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:3003')
assert.ok(['http:', 'https:'].includes(origin.protocol), 'Use an HTTP(S) local validation server')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'Use a local validation server')
assert.equal(origin.pathname, '/', 'Pass only the local server origin')
assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash, 'Pass a plain local origin')
const production = 'https://www.nervos.org'
const sitemapNamespace = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const xhtmlNamespace = 'http://www.w3.org/1999/xhtml'
const sorted = values => values.slice().sort(([a, av], [b, bv]) => a.localeCompare(b) || av.localeCompare(bv))
const elements = (node, name) => Array.from(node.getElementsByTagName(name))
const attr = (node, name) => Array.from(node.attributes).find(item => item.name.toLowerCase() === name)?.value

async function request(pathname, search = '') {
  // Assign URL fields instead of resolving an untrusted //hostname path.
  const target = new URL(origin)
  target.pathname = pathname
  target.search = search
  assert.equal(target.origin, origin.origin)
  return fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(45000) })
}

function parse(source, contentType, label) {
  const errors = []
  const document = new DOMParser({
    errorHandler: {
      warning: message => contentType === 'application/xml' && errors.push(message),
      error: message => errors.push(message),
      fatalError: message => errors.push(message),
    },
  }).parseFromString(source, contentType)
  assert.deepEqual(errors, [], `${label}: valid markup`)
  assert.equal(elements(document, 'parsererror').length, 0, `${label}: no parser errors`)
  return document
}

function productionURL(value, label) {
  assert.match(value, /^https:\/\/www\.nervos\.org\//, `${label}: absolute production URL`)
  const url = new URL(value)
  assert.equal(url.origin, production, label)
  assert.ok(!url.username && !url.password && !url.hash, `${label}: no credentials or fragment`)
  assert.doesNotMatch(url.pathname, /^\/en(?:\/|$)/, `${label}: no duplicate English alias`)
  return url
}

function validLastmod(value, label) {
  assert.match(
    value,
    /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/,
    `${label}: lastmod is an ISO date or timestamp`,
  )
  assert.ok(Number.isFinite(Date.parse(value)), `${label}: parseable lastmod`)
  const date = value.slice(0, 10)
  assert.equal(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10), date, `${label}: real calendar date`)
}

const response = await request('/sitemap.xml')
assert.equal(response.status, 200, '/sitemap.xml')
assert.equal(response.headers.get('location'), null, '/sitemap.xml: no redirect')
assert.match(response.headers.get('content-type') ?? '', /^application\/xml(?:\s*;|$)/i)
const xml = parse(await response.text(), 'application/xml', '/sitemap.xml')
assert.equal(xml.documentElement.localName, 'urlset')
assert.equal(xml.documentElement.namespaceURI, sitemapNamespace)
const nodes = Array.from(xml.documentElement.getElementsByTagNameNS(sitemapNamespace, 'url'))
assert.ok(nodes.length > 0, 'Sitemap contains public pages')
assert.ok(nodes.length <= 50000, 'A single sitemap stays within the URL limit')

const entries = nodes.map(node => {
  const locations = Array.from(node.getElementsByTagNameNS(sitemapNamespace, 'loc'))
  assert.equal(locations.length, 1, 'Each sitemap entry has exactly one loc')
  const loc = locations[0].textContent.trim()
  const url = productionURL(loc, loc)
  const dates = Array.from(node.getElementsByTagNameNS(sitemapNamespace, 'lastmod'))
  assert.ok(dates.length <= 1, `${loc}: at most one lastmod`)
  for (const date of dates) validLastmod(date.textContent.trim(), loc)
  const alternatives = Array.from(node.getElementsByTagNameNS(xhtmlNamespace, 'link')).map(link => {
    assert.equal(attr(link, 'rel'), 'alternate', `${loc}: XHTML link rel`)
    const language = attr(link, 'hreflang')
    const href = attr(link, 'href')
    assert.match(language ?? '', /^(?:x-default|[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/, `${loc}: hreflang`)
    productionURL(href ?? '', `${loc}: ${language}`)
    return [language, href]
  })
  assert.equal(
    new Set(alternatives.map(([language]) => language)).size,
    alternatives.length,
    `${loc}: unique languages`,
  )
  if (alternatives.length) {
    assert.ok(
      alternatives.some(([language, href]) => language !== 'x-default' && href === loc),
      `${loc}: self alternate`,
    )
    const fallback = alternatives.find(([language]) => language === 'x-default')
    if (fallback)
      assert.ok(
        alternatives.some(([language, href]) => language !== 'x-default' && href === fallback[1]),
        `${loc}: x-default points to an actual language version`,
      )
  }
  return { loc, url, alternatives }
})
const byLocation = new Map(entries.map(entry => [entry.loc, entry]))
assert.equal(byLocation.size, entries.length, 'No duplicate loc URLs')
for (const entry of entries) {
  for (const [language, href] of entry.alternatives) {
    const target = byLocation.get(href)
    assert.ok(target, `${entry.loc}: ${language} points to a real sitemap URL`)
    assert.deepEqual(sorted(target.alternatives), sorted(entry.alternatives), `${entry.loc}: reciprocal ${language}`)
  }
}

// Coverage follows today's published catalog, not a fixed article/URL count.
const contentRoot = path.resolve('public/education_hub_articles')
const catalog = JSON.parse(fs.readFileSync(path.join(contentRoot, 'metadata/catalog.json'), 'utf8'))
const articles = catalog.articles.filter(
  article => !article.draft && (!article.date || Date.parse(article.date) <= Date.now()),
)
assert.ok(articles.length > 0, 'Published article catalog is available')
for (const article of articles) {
  const source = path.resolve(contentRoot, article.sourceFile)
  assert.ok(
    source.startsWith(contentRoot + path.sep) && fs.existsSync(source),
    `${article.canonicalPath}: real article file`,
  )
  assert.ok(
    byLocation.has(production + article.canonicalPath),
    `${article.canonicalPath}: published rendition included`,
  )
}
for (const route of ['/', '/knowledge-base', '/knowledge-base/start-here', '/knowledge-base/articles'])
  assert.ok(byLocation.has(production + route), `${route}: public landing included`)
for (const hub of catalog.hubs)
  assert.ok(byLocation.has(`${production}/knowledge-base/topic/${hub.id}`), `${hub.id}: canonical Hub included`)

let next = 0
let checked = 0
async function checkPages() {
  while (next < entries.length) {
    const entry = entries[next++]
    const { pathname, search } = entry.url
    const result = await request(pathname, search)
    assert.equal(result.status, 200, `${entry.loc}: directly serves 200`)
    assert.equal(result.headers.get('location'), null, `${entry.loc}: no redirect`)
    assert.match(result.headers.get('content-type') ?? '', /^text\/html(?:\s*;|$)/i, entry.loc)
    const html = await result.text()
    const headSource = html.match(/<head(?:\s[^>]*)?>[\s\S]*?<\/head>/i)?.[0]
    assert.ok(headSource, `${entry.loc}: HTML head exists`)
    const head = parse(headSource, 'text/html', entry.loc)
    const links = elements(head, 'link')
    const canonicals = links.filter(link => attr(link, 'rel') === 'canonical')
    assert.equal(canonicals.length, 1, `${entry.loc}: exactly one canonical`)
    assert.equal(attr(canonicals[0], 'href'), entry.loc, `${entry.loc}: canonical matches loc`)
    const alternatives = links
      .filter(link => attr(link, 'rel') === 'alternate' && attr(link, 'hreflang'))
      .map(link => [attr(link, 'hreflang'), attr(link, 'href')])
    assert.deepEqual(sorted(alternatives), sorted(entry.alternatives), `${entry.loc}: HTML/XML hreflang agree`)
    assert.equal(new Set(alternatives.map(([language]) => language)).size, alternatives.length)
    if (/^(?:\/[a-z]{2,3})?\/knowledge-base\/articles$/.test(pathname))
      assert.equal(alternatives.length, 0, `${entry.loc}: archive pages are not translation equivalents`)
    // Preview deployments intentionally retain noindex; it is not a failure here.
    checked++
  }
}
await Promise.all(Array.from({ length: 4 }, checkPages))

const robotsResponse = await request('/robots.txt')
assert.equal(robotsResponse.status, 200, '/robots.txt')
const directives = (await robotsResponse.text())
  .split(/\r?\n/)
  .map(line => line.replace(/#.*/, '').trim())
  .filter(Boolean)
assert.ok(
  directives.some(
    line => /^sitemap\s*:/i.test(line) && line.slice(line.indexOf(':') + 1).trim() === `${production}/sitemap.xml`,
  ),
  'robots.txt declares the production sitemap',
)
const groups = []
let group
for (const directive of directives) {
  const split = directive.indexOf(':')
  if (split < 0) continue
  const name = directive.slice(0, split).trim().toLowerCase()
  const value = directive.slice(split + 1).trim()
  if (name === 'user-agent') {
    if (!group || group.rules.length) {
      group = { agents: [], rules: [] }
      groups.push(group)
    }
    group.agents.push(value)
  } else if ((name === 'allow' || name === 'disallow') && value) {
    assert.ok(group, 'robots.txt rules belong to a user-agent group')
    const anchored = value.endsWith('$')
    const pattern = (anchored ? value.slice(0, -1) : value).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
    group.rules.push({ name, value, matches: new RegExp(`^${pattern}${anchored ? '$' : ''}`) })
  }
}
assert.ok(
  groups.some(item => item.agents.includes('*')),
  'robots.txt defines general crawler behavior',
)
for (const item of groups) {
  for (const resource of [
    '/_next/static/chunks/main.js',
    '/_next/static/css/site.css',
    '/_next/image?url=%2Fimages%2Flogo.png&w=640&q=75',
  ]) {
    const matches = item.rules
      .filter(rule => rule.matches.test(resource))
      .sort((a, b) => b.value.length - a.value.length)
    const longest = matches[0]?.value.length
    assert.ok(
      !matches.length || matches.some(rule => rule.value.length === longest && rule.name === 'allow'),
      `${item.agents.join(', ')} can crawl rendering asset ${resource}`,
    )
  }
}

console.log(
  `D-03: ${entries.length} unique production sitemap URLs, ${articles.length} published article renditions, ${checked} local HTTP pages checked with concurrency 4; canonical/hreflang reciprocity and robots.txt passed. No live-site requests were made.`,
)
