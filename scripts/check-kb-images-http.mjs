import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DOMParser } from '@xmldom/xmldom'
import sharp from 'sharp'

// Read-only production-server acceptance. No remote URLs are requested, even
// when inspecting Open Graph metadata or an optimizer's nested source URL.
// node scripts/check-kb-images-http.mjs [http://127.0.0.1:3003]
const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:3003')
assert.ok(['http:', 'https:'].includes(origin.protocol), 'Use an HTTP(S) local validation server')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'Use a loopback validation server')
assert.equal(origin.pathname, '/', 'Pass only the local server origin')
assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash, 'Pass a plain local origin')
const root = fileURLToPath(new URL('../', import.meta.url))
const contentRoot = fs.realpathSync(path.join(root, 'public/education_hub_articles'))
const catalog = JSON.parse(fs.readFileSync(path.join(contentRoot, 'metadata/catalog.json'), 'utf8'))
const published = catalog.articles.filter(
  article => !article.draft && (!article.date || Date.parse(article.date) <= Date.now()),
)
const production = 'https://www.nervos.org'
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const elements = (node, name) => Array.from(node.getElementsByTagName(name))
const attr = (node, name) => Array.from(node.attributes ?? []).find(item => item.name.toLowerCase() === name)?.value
const originalCache = new Map()
const transferRows = []
const pageRows = []
let requests = 0

function localURL(value) {
  const url = new URL(value, origin)
  assert.equal(url.origin, origin.origin, `Never fetch a non-local URL: ${value}`)
  assert.ok(!url.username && !url.password, 'No URL credentials')
  return url
}

async function request(value, headers = {}) {
  requests += 1
  return fetch(localURL(value), { headers, redirect: 'manual', signal: AbortSignal.timeout(90000) })
}

async function original(src) {
  assert.ok(src.startsWith('/education_hub_articles/'), `Only local article sources: ${src}`)
  const url = localURL(src)
  assert.ok(!url.search && !url.hash, `Original source has no query or fragment: ${src}`)
  if (!originalCache.has(url.pathname)) {
    const relative = decodeURIComponent(url.pathname).slice('/education_hub_articles/'.length)
    const filename = fs.realpathSync(path.resolve(contentRoot, relative))
    assert.ok(filename.startsWith(contentRoot + path.sep), `Source stays inside article content: ${src}`)
    const bytes = fs.readFileSync(filename)
    // Metadata still reports GIF frame count without selecting every frame as
    // one tall raster (which would exceed the pixel limit for the 360-frame GIF).
    const metadata = await sharp(bytes).metadata()
    assert.ok(metadata.width && metadata.height, `Readable intrinsic dimensions: ${src}`)
    const storedHeight = metadata.pageHeight ?? metadata.height
    const rotated = metadata.orientation >= 5 && metadata.orientation <= 8
    originalCache.set(url.pathname, {
      src: url.pathname,
      bytes,
      metadata,
      width: rotated ? storedHeight : metadata.width,
      height: rotated ? metadata.width : storedHeight,
    })
  }
  return originalCache.get(url.pathname)
}

function optimizedURL(value, expectedSource) {
  const url = localURL(value)
  assert.equal(url.pathname, '/_next/image', `Uses the local Next image optimizer: ${value}`)
  const source = url.searchParams.get('url')
  assert.ok(source?.startsWith('/education_hub_articles/'), `Optimizer source is local article content: ${value}`)
  assert.equal(localURL(source).origin, origin.origin)
  if (expectedSource) assert.equal(source, expectedSource)
  const width = Number(url.searchParams.get('w'))
  const quality = Number(url.searchParams.get('q'))
  assert.ok(Number.isInteger(width) && width > 0, `Positive optimizer width: ${value}`)
  assert.ok(Number.isInteger(quality) && quality > 0 && quality <= 100, `Valid optimizer quality: ${value}`)
  return { url, source, width, quality }
}

function responsive(image, expectedSource) {
  const src = optimizedURL(attr(image, 'src'), expectedSource)
  const sizes = attr(image, 'sizes')
  assert.ok(sizes && /(?:vw|px)/.test(sizes), `${src.source}: responsive sizes are present`)
  const candidates = (attr(image, 'srcset') ?? '').split(',').map(value => {
    const match = /^(\S+)\s+(\d+)w$/.exec(value.trim())
    assert.ok(match, `${src.source}: width-descriptor srcset`)
    const candidate = optimizedURL(match[1], src.source)
    assert.equal(candidate.width, Number(match[2]), `${src.source}: srcset width matches URL`)
    return candidate
  })
  assert.ok(candidates.length > 1, `${src.source}: multiple responsive candidates`)
  assert.equal(new Set(candidates.map(candidate => candidate.width)).size, candidates.length)
  return { ...src, candidates, sizes }
}

async function page(pathname) {
  const response = await request(pathname)
  assert.equal(response.status, 200, `${pathname}: directly serves HTML`)
  assert.equal(response.headers.get('location'), null, `${pathname}: no redirect`)
  assert.match(response.headers.get('content-type') ?? '', /^text\/html(?:\s*;|$)/i)
  const errors = []
  const document = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: error => errors.push(error),
      fatalError: error => errors.push(error),
    },
  }).parseFromString(await response.text(), 'text/html')
  assert.deepEqual(errors, [], `${pathname}: parseable server-rendered HTML`)
  const head = elements(document, 'head')[0]
  assert.ok(head, `${pathname}: HTML head exists`)
  const canonical = elements(head, 'link').filter(link => attr(link, 'rel') === 'canonical')
  assert.equal(canonical.length, 1, `${pathname}: one canonical`)
  assert.equal(attr(canonical[0], 'href'), production + pathname, `${pathname}: preserved canonical`)
  return { document, head }
}

let heroSample
let bodySample
let cardSample
const gifSources = new Set()
const sampleIds = ['are_bitcoin_and_ethereum_quantum_resistant', 'nervosdao_withdrawal_process_explained']
for (const id of sampleIds)
  assert.ok(
    published.some(article => article.id === id),
    `Published sample ${id}`,
  )
for (const article of published.filter(item => sampleIds.includes(item.id))) {
  const { document, head } = await page(article.canonicalPath)
  const images = elements(document, 'img')
  const heroes = images.filter(image => (attr(image, 'class') ?? '').includes('articleCover'))
  assert.equal(heroes.length, 1, `${article.canonicalPath}: exactly one article hero`)
  const hero = heroes[0]
  const source = await original(article.coverImage)
  assert.equal(attr(hero, 'width'), String(source.width), `${article.id}: intrinsic hero width`)
  assert.equal(attr(hero, 'height'), String(source.height), `${article.id}: intrinsic hero height`)
  assert.equal(attr(hero, 'alt'), article.title, `${article.id}: preserved hero alt`)
  assert.equal(attr(hero, 'fetchpriority'), 'high', `${article.id}: hero priority`)
  assert.notEqual(attr(hero, 'loading'), 'lazy', `${article.id}: hero is not lazy`)
  const heroInfo = responsive(hero, article.coverImage)
  const preloads = elements(head, 'link').filter(
    link => attr(link, 'rel') === 'preload' && attr(link, 'as') === 'image',
  )
  assert.ok(
    preloads.some(
      link => attr(link, 'imagesrcset') === attr(hero, 'srcset') && attr(link, 'imagesizes') === attr(hero, 'sizes'),
    ),
    `${article.id}: responsive hero preload`,
  )
  const og = elements(head, 'meta').filter(node => attr(node, 'property') === 'og:image')
  assert.equal(og.length, 1, `${article.id}: one Open Graph image`)
  assert.equal(attr(og[0], 'content'), new URL(article.coverImage, production).href, `${article.id}: original OG URL`)
  if (article.id === sampleIds[0] && article.language === 'en') heroSample = heroInfo

  const markdown = elements(document, 'div').find(node => (attr(node, 'class') ?? '').includes('articleMarkdown'))
  assert.ok(markdown, `${article.id}: Markdown container exists`)
  const bodyImages = elements(markdown, 'img')
  let animated = 0
  for (const image of bodyImages) {
    const src = attr(image, 'src')
    assert.equal(attr(image, 'loading'), 'lazy', `${article.id}: body image is lazy`)
    assert.notEqual(attr(image, 'fetchpriority'), 'high', `${article.id}: body image is not prioritized`)
    if (src.startsWith('/_next/image?')) {
      const info = responsive(image)
      const asset = await original(info.source)
      assert.equal(attr(image, 'width'), String(asset.width), `${info.source}: intrinsic body width`)
      assert.equal(attr(image, 'height'), String(asset.height), `${info.source}: intrinsic body height`)
      assert.ok(
        !preloads.some(link => attr(link, 'imagesrcset') === attr(image, 'srcset')),
        `${info.source}: no lazy body preload`,
      )
      if (!bodySample) bodySample = info
    } else if (src.startsWith('/education_hub_articles/') && /\.gif$/i.test(src)) {
      const asset = await original(src)
      assert.equal(asset.metadata.format, 'gif')
      assert.ok(asset.metadata.pages > 1, `${src}: original remains animated`)
      assert.equal(attr(image, 'width'), String(asset.width))
      assert.equal(attr(image, 'height'), String(asset.height))
      assert.ok(!attr(image, 'srcset'), `${src}: GIF stays on direct original URL`)
      gifSources.add(src)
      animated += 1
    } else assert.fail(`${article.id}: unexpected body fallback in local acceptance sample: ${src}`)
  }
  if (article.id === sampleIds[1]) {
    assert.ok(bodyImages.length > 1, `${article.id}: Markdown image sample is exercised`)
    assert.equal(animated, 1, `${article.id}: one direct animated GIF`)
  }
  pageRows.push({
    path: article.canonicalPath,
    heroes: heroes.length,
    lazyBodyImages: bodyImages.length,
    directGIFs: animated,
  })
}

const hub = published.find(article => article.id === sampleIds[0] && article.language === 'en').hub
for (const pathname of ['/knowledge-base', '/knowledge-base/articles', `/knowledge-base/topic/${hub}`]) {
  const { document, head } = await page(pathname)
  const cards = elements(document, 'img').filter(image => (attr(image, 'src') ?? '').startsWith('/_next/image?'))
  assert.ok(cards.length > 0, `${pathname}: optimized article cards exist`)
  let hidden = 0
  for (const image of cards) {
    const info = responsive(image)
    await original(info.source)
    assert.equal(attr(image, 'loading'), 'lazy', `${pathname}: cards stay lazy`)
    assert.notEqual(attr(image, 'fetchpriority'), 'high', `${pathname}: no card priority`)
    assert.equal(attr(image, 'data-nimg'), 'fill', `${pathname}: original fixed cover slot is filled`)
    assert.equal(attr(image, 'alt'), '', `${pathname}: linked card cover remains decorative`)
    assert.match(attr(image, 'style') ?? '', /object-fit:cover/, `${pathname}: original cover crop`)
    assert.match(attr(image.parentNode, 'style') ?? '', /position:relative/, `${pathname}: positioned original slot`)
    assert.ok(
      !elements(head, 'link').some(
        link => attr(link, 'rel') === 'preload' && attr(link, 'imagesrcset') === attr(image, 'srcset'),
      ),
      `${pathname}: no card preload`,
    )
    for (let parent = image.parentNode; parent; parent = parent.parentNode) {
      if (parent.nodeType === 1 && parent.hasAttribute('hidden')) {
        hidden += 1
        break
      }
    }
    if (!cardSample) cardSample = info
  }
  if (pathname.includes('/topic/')) assert.ok(hidden > 0, 'Default Hub subject retains hidden lazy HTML cards')
  pageRows.push({ path: pathname, lazyCards: cards.length, hiddenLazyCards: hidden })
}

assert.ok(heroSample && bodySample && cardSample, 'Hero, body and card optimizer samples are available')
async function transfer(label, sample, requestedWidth, accept) {
  const candidate = sample.candidates.find(item => item.width === requestedWidth)
  assert.ok(candidate, `${label}: real srcset contains ${requestedWidth}px candidate`)
  const asset = await original(sample.source)
  const response = await request(candidate.url, { accept })
  assert.equal(response.status, 200, `${label}: optimizer succeeds`)
  assert.equal(response.headers.get('location'), null)
  assert.equal(response.headers.get('content-type'), accept, `${label}: negotiated modern format`)
  assert.match(response.headers.get('vary') ?? '', /(?:^|,)\s*Accept\s*(?:,|$)/i)
  assert.match(response.headers.get('cache-control') ?? '', /max-age=\d+/, `${label}: cache policy exists`)
  assert.ok(response.headers.get('etag'), `${label}: ETag exists`)
  const bytes = Buffer.from(await response.arrayBuffer())
  const metadata = await sharp(bytes).metadata()
  assert.equal(metadata.format, accept === 'image/avif' ? 'heif' : 'webp', `${label}: actual file magic`)
  if (accept === 'image/avif') assert.equal(metadata.compression, 'av1', `${label}: AVIF codec`)
  const expectedWidth = Math.min(requestedWidth, asset.width)
  assert.equal(metadata.width, expectedWidth, `${label}: optimized pixel width`)
  assert.equal(
    metadata.height,
    Math.round((asset.height * expectedWidth) / asset.width),
    `${label}: unchanged aspect ratio`,
  )
  assert.ok(bytes.length < asset.bytes.length, `${label}: modern variant is smaller than the original`)
  let repeat = await request(candidate.url, { accept })
  // A variant from an earlier browser check may have expired. Next serves it
  // while revalidating; wait a bounded interval for the refreshed cache entry.
  for (let attempt = 0; repeat.headers.get('x-nextjs-cache') === 'STALE' && attempt < 12; attempt += 1) {
    await repeat.arrayBuffer()
    await new Promise(resolve => setTimeout(resolve, 250))
    repeat = await request(candidate.url, { accept })
  }
  assert.equal(repeat.status, 200)
  assert.equal(repeat.headers.get('content-type'), accept)
  assert.equal(repeat.headers.get('etag'), response.headers.get('etag'), `${label}: stable cached ETag`)
  assert.equal(hash(Buffer.from(await repeat.arrayBuffer())), hash(bytes), `${label}: cached bytes match`)
  assert.equal(repeat.headers.get('x-nextjs-cache'), 'HIT', `${label}: repeated optimizer request is a cache hit`)
  transferRows.push({
    label,
    format: accept,
    width: metadata.width,
    height: metadata.height,
    bytes: bytes.length,
    originalBytes: asset.bytes.length,
    reductionPercent: Number((100 * (1 - bytes.length / asset.bytes.length)).toFixed(1)),
    firstCache: response.headers.get('x-nextjs-cache'),
    repeatCache: repeat.headers.get('x-nextjs-cache'),
    cacheControl: response.headers.get('cache-control'),
  })
}

for (const format of ['image/avif', 'image/webp']) {
  await transfer('hero-1x', heroSample, 640, format)
  await transfer('hero-2x', heroSample, 1440, format)
  await transfer('body', bodySample, 640, format)
  await transfer('card', cardSample, 384, format)
}

// Original URLs remain byte-for-byte public, including all frames of the GIF.
const originals = new Set([heroSample.source, bodySample.source, cardSample.source, ...gifSources])
for (const src of originals) {
  const asset = await original(src)
  const response = await request(src)
  assert.equal(response.status, 200, `${src}: original URL still serves directly`)
  assert.equal(response.headers.get('location'), null)
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), hash(asset.bytes), `${src}: original bytes unchanged`)
  if (asset.metadata.format === 'gif') assert.match(response.headers.get('content-type') ?? '', /^image\/gif(?:;|$)/)
}
console.log(
  JSON.stringify(
    {
      origin: origin.origin,
      requests,
      pages: pageRows,
      transfers: transferRows,
      unchangedOriginalURLs: originals.size,
    },
    null,
    2,
  ),
)
console.log('D17 local HTTP image checks passed; no external fetches or source-image writes.')
