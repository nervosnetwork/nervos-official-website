import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'

// Run against an isolated production build, not the live production website.
// node scripts/check-site-routing-http.mjs http://localhost:3003 .next-d19-production
const origin = process.argv[2] ?? 'http://localhost:3003'
const dist = process.argv[3] ?? '.next-d19-production'
const buildId = fs.readFileSync(`${dist}/BUILD_ID`, 'utf8').trim()
const catalog = JSON.parse(fs.readFileSync('public/education_hub_articles/metadata/catalog.json', 'utf8'))
const migrations = JSON.parse(fs.readFileSync('public/education_hub_articles/metadata/slug-migrations.json', 'utf8'))
const query = '?utm_source=d19&tag=one&tag=two&term=a%20b'
let count = 0
function assertTarget(actual, expected, label) {
  const target = new URL(actual, origin)
  const wanted = new URL(expected, origin)
  assert.equal(target.origin, wanted.origin, label)
  assert.equal(target.pathname, wanted.pathname, label)
  // Next may serialize spaces as '+'; keys, values, duplicates and order must survive.
  assert.deepEqual([...target.searchParams], [...wanted.searchParams], label)
}
async function response(path, headers = {}) {
  count++
  // Node's fetch may ignore Host overrides. Connect only to the local server,
  // using the HTTP client to verify Next's exact production-host condition.
  if (headers.host) {
    return new Promise((resolve, reject) => {
      const request = http.get(origin + path, { headers }, incoming => {
        const chunks = []
        incoming.on('data', chunk => chunks.push(chunk))
        incoming.on('error', reject)
        incoming.on('end', () =>
          resolve(
            new Response(Buffer.concat(chunks), {
              status: incoming.statusCode,
              headers: incoming.headers,
            }),
          ),
        )
      })
      request.on('error', reject)
      request.setTimeout(45000, () => request.destroy(new Error('HTTP header check timeout')))
    })
  }
  return fetch(origin + path, { redirect: 'manual', headers, signal: AbortSignal.timeout(45000) })
}
async function redirectOnce(from, to, status = 200) {
  const result = await response(from)
  assert.equal(result.status, 308, from)
  const target = new URL(result.headers.get('location'), origin)
  assertTarget(target.href, origin + to, from)
  await result.arrayBuffer()
  const final = await response(to)
  assert.equal(final.status, status, `${from}: final response`)
  assert.equal(final.headers.get('location'), null, `${from}: no redirect loop`)
  await final.arrayBuffer()
}

for (const route of [
  '/',
  '/mining',
  '/ckbpage',
  '/knowledge-base',
  '/knowledge-base/articles',
  '/knowledge-base/start-here',
]) {
  await redirectOnce(`/en${route === '/' ? '' : route}${query}`, `${route}${query}`)
}
await redirectOnce(
  '/en/knowledge-base/articles?page=2&tag=one&tag=two',
  '/knowledge-base/articles?page=2&tag=one&tag=two',
)
await redirectOnce(
  '/en/knowledge-base?page=2&sort_by=popular&tag=one&tag=two',
  '/knowledge-base/articles?tag=one&tag=two',
)
await redirectOnce('/en/knowledge-base/d19-does-not-exist', '/knowledge-base/d19-does-not-exist', 404)
for (const language of ['', 'en', 'zh', 'es', 'fr', 'tr', 'ko', 'pt']) {
  const prefix = language ? `/${language}` : ''
  const finalPrefix = language && language !== 'en' ? prefix : ''
  await redirectOnce(`${prefix}/ckb${query}`, `${finalPrefix}/ckbpage${query}`)
}
for (const { from, to } of migrations.renames) {
  await redirectOnce(`/en/knowledge-base/${encodeURIComponent(from)}${query}`, `/knowledge-base/${to}${query}`)
}
for (const article of catalog.articles.filter(a => a.language === 'en').slice(0, 5)) {
  await redirectOnce(`/en${article.canonicalPath}${query}`, article.canonicalPath + query)
}
console.log('Explicit English, CKB aliases and all 50 renamed English articles redirect once, retaining query values')

// Next data routes need the /en segment; stripping it would break navigation.
for (const language of ['en', 'zh', 'es']) {
  const prefix = language === 'en' ? '' : `/${language}`
  const current = await response(`/_next/data/${buildId}/${language}/knowledge-base/articles.json?page=2`, {
    'x-nextjs-data': '1',
  })
  assert.equal(current.status, 200, language)
  assert.equal(current.headers.get('location'), null)
  assert.equal(current.headers.get('x-nextjs-redirect'), null)
  assert.equal((await current.json()).pageProps.page, 2)
  const oldListing = await response(
    `/_next/data/${buildId}/${language}/knowledge-base.json?page=2&sort_by=popular&tag=one`,
    {
      'x-nextjs-data': '1',
    },
  )
  assert.equal(oldListing.status, 308)
  assert.equal(oldListing.headers.get('location'), null)
  assert.equal(
    new URL(oldListing.headers.get('x-nextjs-redirect'), origin).href,
    `${origin}${prefix}/knowledge-base/articles?tag=one`,
  )
  await oldListing.arrayBuffer()
}
for (const { from, to } of migrations.renames.slice(0, 3)) {
  const result = await response(`/_next/data/${buildId}/en/knowledge-base/${encodeURIComponent(from)}.json${query}`, {
    'x-nextjs-data': '1',
  })
  assert.equal(result.status, 308)
  assert.equal(result.headers.get('location'), null)
  assertTarget(result.headers.get('x-nextjs-redirect'), `${origin}/knowledge-base/${to}${query}`, from)
  await result.arrayBuffer()
  const current = await response(`/_next/data/${buildId}/en/knowledge-base/${to}.json`, { 'x-nextjs-data': '1' })
  assert.equal(current.status, 200)
  assert.equal(current.headers.get('x-nextjs-redirect'), null)
  assert.ok((await current.json()).pageProps)
}
console.log('Current Next data requests remain JSON; legacy data requests retain client-navigation redirects')

for (const path of ['/', '/knowledge-base', '/zh/knowledge-base/articles', '/robots.txt', '/d19-not-found']) {
  for (const host of ['localhost:3003', 'preview.vercel.app', 'www.nervos.org']) {
    const result = await response(path, { host })
    assert.equal(result.headers.get('x-content-type-options'), 'nosniff', path)
    assert.equal(result.headers.get('referrer-policy'), 'strict-origin-when-cross-origin', path)
    assert.equal(result.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()', path)
    assert.equal(
      result.headers.get('content-security-policy'),
      "object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
      path,
    )
    assert.equal(
      result.headers.get('strict-transport-security'),
      host === 'www.nervos.org' ? 'max-age=31536000; includeSubDomains; preload' : null,
      host,
    )
    await result.arrayBuffer()
  }
}
console.log(`${count} local HTTP responses checked. Headers verified; no production or Vercel configuration changed.`)
