import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

// Read-only HTTP acceptance. No GA events, subscription submissions or remote
// requests. Optional baseline is the unchanged pre-D21 local production build.
const origin = process.argv[2] ?? 'http://localhost:3003'
const baseline = process.argv[3]
for (const base of [origin, baseline].filter(Boolean))
  assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname), 'Use a local validation server')
const require = createRequire(import.meta.url)
const { i18n } = require('../next-i18next.config.js')

const catalog = JSON.parse(fs.readFileSync('public/education_hub_articles/metadata/catalog.json', 'utf8'))
const published = catalog.articles.filter(a => !a.draft && (!a.date || Date.parse(a.date) <= Date.now()))
const production = 'https://www.nervos.org'
const request = (path, base = origin) => fetch(base + path, { redirect: 'manual', signal: AbortSignal.timeout(45000) })
const parse = html =>
  new DOMParser({ errorHandler: { warning: () => undefined, error: message => assert.fail(message) } }).parseFromString(
    html,
    'text/html',
  )
const elements = (doc, name) => Array.from(doc.getElementsByTagName(name))
const attribute = (node, name) => Array.from(node.attributes).find(item => item.name.toLowerCase() === name)?.value
const meta = (doc, name) =>
  elements(doc, 'meta')
    .find(node => attribute(node, 'name') === name || attribute(node, 'property') === name)
    ?.getAttribute('content')
const pageProps = html =>
  JSON.parse(html.match(/<script\b[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1]).props.pageProps
const topicPath = id => `/knowledge-base/topic/${id}`
let buildId
const descendingDate = (a, b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0)
let checks = 0
let compared = 0

async function redirect(path, target) {
  const result = await request(path)
  assert.equal(result.status, 308, path)
  assert.equal(new URL(result.headers.get('location'), origin).href, origin + target, path)
  await result.arrayBuffer()
  checks++
}

function normalizedVisibleMain(html) {
  const doc = parse(html.match(/<main(?:\s[^>]*)?>[\s\S]*<\/main>/)[0])
  // Hidden cards belong to the interactive filter, not the initial visible UI.
  // Do not ignore any visible class, style, text, image or card order.
  for (const anchor of elements(doc, 'a')) {
    if (anchor.hasAttribute('hidden')) {
      anchor.parentNode.removeChild(anchor)
      continue
    }
    const href = attribute(anchor, 'href')
    if (!href) continue
    const url = new URL(href, production)
    if (url.pathname === '/knowledge-base/topic' && url.searchParams.has('hub')) {
      const value = url.searchParams.get('hub')
      const hub = catalog.hubs.find(h => h.id === value || h.name === value)
      assert.ok(hub, `Unknown baseline Hub link: ${href}`)
      url.pathname = topicPath(hub.id)
      url.searchParams.delete('hub')
      anchor.setAttribute('href', url.pathname + url.search + url.hash)
    }
  }
  const stripComments = node => {
    for (const child of Array.from(node.childNodes ?? [])) {
      if (child.nodeType === 8) node.removeChild(child)
      else stripComments(child)
    }
  }
  stripComments(doc)
  return new XMLSerializer().serializeToString(doc)
}

function checkMetadata(html, path, title) {
  const doc = parse(html.match(/<head>[\s\S]*?<\/head>/)[0])
  const canonical = elements(doc, 'link').filter(link => attribute(link, 'rel') === 'canonical')
  assert.equal(canonical.length, 1, `${path}: one canonical`)
  assert.equal(attribute(canonical[0], 'href'), production + path)
  assert.equal(elements(doc, 'title')[0].textContent, title)
  const description = meta(doc, 'description')
  assert.ok(description?.trim(), `${path}: description`)
  assert.ok(description.length <= 155)
  for (const name of ['og:url', 'twitter:url']) assert.equal(meta(doc, name), production + path, name)
  for (const name of ['og:title', 'twitter:title']) assert.equal(meta(doc, name), title, name)
  for (const name of ['og:image', 'twitter:image']) assert.equal(new URL(meta(doc, name)).origin, production, name)
  return description
}

for (const hub of catalog.hubs) {
  const canonical = topicPath(hub.id)
  const subjects = catalog.subjects.filter(s => s.hub === hub.id).sort((a, b) => a.order - b.order)
  const all = published.filter(a => a.language === 'en' && a.hub === hub.id).sort(descendingDate)
  for (const subject of [undefined, ...subjects.map(s => s.id), 'all']) {
    const query = subject ? `?subject=${encodeURIComponent(subject)}` : ''
    const result = await request(canonical + query)
    assert.equal(result.status, 200, canonical + query)
    const html = await result.text()
    buildId ??= JSON.parse(html.match(/<script\b[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1]).buildId
    const doc = parse(html)
    assert.equal(elements(doc, 'h1').length, 1)
    const description = checkMetadata(html, canonical, hub.heading)
    assert.ok(!description.startsWith('The Nervos Network is a flexible blockchain'))
    const links = elements(doc, 'a').filter(a => /(?:^| )components_articleCard__/.test(attribute(a, 'class') ?? ''))
    assert.deepEqual(
      links.map(a => attribute(a, 'href')),
      all.map(a => a.canonicalPath),
      `${hub.id}: all real HTML article links`,
    )
    assert.equal(new Set(links.map(a => attribute(a, 'href'))).size, all.length)
    const selected = subject ?? subjects[0]?.id ?? 'all'
    const visible = all.filter(a => selected === 'all' || a.subjects.includes(selected))
    assert.deepEqual(
      links.filter(a => !a.hasAttribute('hidden')).map(a => attribute(a, 'href')),
      visible.map(a => a.canonicalPath),
    )
    for (const hidden of links.filter(a => a.hasAttribute('hidden'))) {
      assert.equal(hidden.getAttribute('style'), 'display:none')
      assert.equal(attribute(hidden, 'tabindex'), '-1')
    }
    const data = pageProps(html)
    assert.deepEqual(
      data.catalog.articles.map(a => a.id),
      all.map(a => a.id),
    )
    assert.ok(data.catalog.articles.every(a => a.language === 'en' && !Object.hasOwn(a, 'text')))
    if (baseline) {
      const oldQuery = subject ? `&subject=${encodeURIComponent(subject)}` : ''
      const before = await request(`/knowledge-base/topic?hub=${hub.id}${oldQuery}`, baseline)
      assert.equal(before.status, 200)
      assert.equal(
        normalizedVisibleMain(html),
        normalizedVisibleMain(await before.text()),
        `${hub.id}/${selected}: visible UI unchanged`,
      )
      compared++
    }
    checks++
  }
  for (const locale of ['', ...i18n.locales]) {
    const prefix = locale ? `/${locale}` : ''
    for (const selector of [hub.id, hub.name])
      await redirect(
        `${prefix}/knowledge-base/topic?hub=${encodeURIComponent(selector)}&subject=all&utm_source=d21`,
        `${canonical}?subject=all&utm_source=d21`,
      )
    if (locale === 'en') {
      const alias = await request(`${prefix}${canonical}?subject=all&utm_source=d21`)
      assert.equal(alias.status, 200)
      assert.equal(alias.headers.get('location'), null)
      assert.ok((await alias.text()).includes(`rel="canonical" href="https://www.nervos.org${canonical}"`))
      checks++
    } else if (prefix)
      await redirect(`${prefix}${canonical}?subject=all&utm_source=d21`, `${canonical}?subject=all&utm_source=d21`)
  }
}

// Next's client-side navigation uses a locale-bearing data endpoint even for
// English. Its /en segment must not be mistaken for an HTML English alias.
for (const hub of catalog.hubs) {
  for (const locale of i18n.locales) {
    const result = await fetch(`${origin}/_next/data/${buildId}/${locale}${topicPath(hub.id)}.json`, {
      redirect: 'manual',
      headers: { 'x-nextjs-data': '1' },
      signal: AbortSignal.timeout(45000),
    })
    if (locale === 'en') {
      assert.equal(result.status, 200)
      assert.equal(result.headers.get('x-nextjs-redirect'), null)
      assert.equal((await result.json()).pageProps.hubId, hub.id)
    } else {
      assert.equal(result.status, 308)
      assert.equal(result.headers.get('x-nextjs-redirect'), topicPath(hub.id))
      await result.arrayBuffer()
    }
    checks++
  }
  for (const selector of [hub.id, hub.name]) {
    const result = await fetch(
      `${origin}/_next/data/${buildId}/en/knowledge-base/topic.json?hub=${encodeURIComponent(selector)}&subject=all`,
      {
        redirect: 'manual',
        headers: { 'x-nextjs-data': '1' },
        signal: AbortSignal.timeout(45000),
      },
    )
    assert.equal(result.status, 308)
    assert.equal(result.headers.get('x-nextjs-redirect'), topicPath(hub.id) + '?subject=all')
    await result.arrayBuffer()
    checks++
  }
}

for (const prefix of ['', ...i18n.locales.map(locale => `/${locale}`)]) {
  await redirect(`${prefix}/knowledge-base/topic`, '/knowledge-base')
}
for (const path of [
  '/knowledge-base/topic?hub=unknown',
  '/knowledge-base/topic?hub=',
  '/knowledge-base/topic?hub=nervos-ckb&hub=blockchain-architecture',
  '/knowledge-base/topic/unknown',
]) {
  const result = await request(path)
  assert.equal(result.status, 404, path)
  await result.arrayBuffer()
  checks++
}
for (const [path, title] of [
  ['/knowledge-base/start-here', 'Start Here'],
  ['/knowledge-base/articles', 'All articles'],
  ['/knowledge-base/articles?page=2', 'All articles — Page 2'],
]) {
  const result = await request(path)
  assert.equal(result.status, 200, path)
  const html = await result.text()
  const description = checkMetadata(html, path, title)
  assert.ok(!description.startsWith('The Nervos Network is a flexible blockchain'))
  if (baseline) {
    const before = await request(path, baseline)
    assert.equal(before.status, 200)
    assert.equal(
      normalizedVisibleMain(html),
      normalizedVisibleMain(await before.text()),
      `${path}: visible UI unchanged`,
    )
    compared++
  }
  checks++
}

console.log(
  `${checks} D-21 HTTP checks passed; ${compared} visible page/subject states match the pre-D21 baseline after normalizing only approved Hub links and hidden filter cards.`,
)
