import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { DOMParser } from '@xmldom/xmldom'

// Read-only acceptance against a local production server. No browser or remote
// requests are used. Keep the pre-externalization build for SVG geometry checks.
// node scripts/check-static-svg-http.mjs --base-url http://localhost:3005 \
//   --dist-dir .next-d16-svg-final --baseline-dir .next-d16-production
const { values } = parseArgs({
  options: {
    'base-url': { type: 'string', default: 'http://localhost:3005' },
    'dist-dir': { type: 'string', default: '.next-d16-svg-final' },
    'baseline-dir': { type: 'string', default: '.next-d16-production' },
  },
})
const origin = new URL(values['base-url'])
assert.ok(['http:', 'https:'].includes(origin.protocol), 'Use an HTTP(S) local validation server')
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'Only loopback requests are allowed')
assert.equal(origin.pathname, '/', 'Pass only the server origin')
assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash, 'Pass a plain local origin')

const root = fileURLToPath(new URL('../', import.meta.url))
const dist = path.resolve(root, values['dist-dir'])
const baseline = path.resolve(root, values['baseline-dir'])
const require = createRequire(import.meta.url)
const { interpolateName } = require('next/dist/compiled/loader-utils3')
const svgStaticLoader = require('./svg-static-loader.cjs')

const hash = data => createHash('sha256').update(data).digest('hex')
const elements = (node, tag) => Array.from(node.getElementsByTagName(tag))
const attr = (node, name) => Array.from(node.attributes ?? []).find(item => item.name.toLowerCase() === name)?.value
let requests = 0

function parse(contents, type, label) {
  const errors = []
  const document = new DOMParser({
    errorHandler: {
      warning: () => undefined,
      error: error => errors.push(error),
      fatalError: error => errors.push(error),
    },
  }).parseFromString(contents, type)
  assert.deepEqual(errors, [], `${label}: valid ${type}`)
  assert.ok(document.documentElement, `${label}: document element exists`)
  return document
}

function normalizeValue(name, value) {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (name === 'style') {
    // SVGR's React style object keeps the last declaration of a duplicated
    // property. Compare that effective declaration without changing its value.
    const declarations = new Map()
    for (const item of trimmed.split(';').filter(Boolean)) {
      const separator = item.indexOf(':')
      assert.ok(separator > 0, 'Valid SVG style declaration')
      declarations.set(item.slice(0, separator).trim(), item.slice(separator + 1).trim())
    }
    return [...declarations]
      .map(([property, content]) => `${property}:${content}`)
      .sort()
      .join(';')
  }
  // React serializes scalar numeric JSX attributes as 0.7 where SVGO emits .7.
  // Do not round values or normalize path/transform strings: their precision is
  // exactly what this regression check must preserve (especially pattern scale).
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) return String(Number(trimmed))
  return trimmed
}

function normalizedSVG(node, isRoot = true) {
  const attributes = Array.from(node.attributes ?? [])
    .filter(attribute => {
      const name = attribute.name.toLowerCase()
      if (name === 'xmlns' || name.startsWith('xmlns:')) return false
      // Inline instances pass presentation/size props to the root SVG; the
      // external image keeps those props on its img instead. Keep viewBox,
      // fill/stroke, preserveAspectRatio and every inner geometry attribute.
      return !(
        isRoot &&
        (['width', 'height', 'class', 'style', 'id', 'role', 'focusable', 'version'].includes(name) ||
          name.startsWith('data-') ||
          name.startsWith('aria-'))
      )
    })
    .map(attribute => [attribute.name.toLowerCase(), normalizeValue(attribute.name.toLowerCase(), attribute.value)])
    .sort(([left], [right]) => left.localeCompare(right))
  const children = Array.from(node.childNodes).flatMap(child => {
    if (child.nodeType === 1) return [normalizedSVG(child, false)]
    if (child.nodeType === 3 || child.nodeType === 4) {
      const text = child.nodeValue.trim().replace(/\s+/g, ' ')
      return text ? [text] : []
    }
    return []
  })
  return [node.nodeName.toLowerCase(), attributes, children]
}

const geometry = svg => hash(JSON.stringify(normalizedSVG(svg)))
const pages = [
  {
    route: '/wallets',
    modules: ['src/pages/wallets/index.page.tsx', 'src/pages/wallets/icons/index.tsx'],
    expectedAssets: 15,
  },
  { route: '/media-kit', modules: ['src/pages/media-kit/index.page.tsx'], expectedAssets: 2 },
]

function sourceAssets(page) {
  const sources = new Set()
  for (const modulePath of page.modules) {
    const filename = path.join(root, modulePath)
    const code = fs.readFileSync(filename, 'utf8')
    for (const match of code.matchAll(/\bimport\s+\w+\s+from\s+['"]([^'"]+\.svg)\?url['"]/g)) {
      assert.ok(match[1].startsWith('./'), `${modulePath}: relative local SVG import`)
      sources.add(path.resolve(path.dirname(filename), match[1]))
    }
  }
  assert.equal(sources.size, page.expectedAssets, `${page.route}: all intended SVG imports are covered`)
  return [...sources].map(filename => {
    const source = fs.readFileSync(filename)
    const contents = Buffer.from(
      svgStaticLoader.call({ resourcePath: filename, cacheable: () => undefined }, source.toString()),
    )
    const output = interpolateName({ resourcePath: filename }, '/static/media/[name].[hash:8].[ext]', {
      context: root,
      content: contents,
    })
    assert.match(output, /^\/static\/media\/[\w.-]+\.[\da-f]{8}\.svg$/i, `${filename}: content-hashed SVG filename`)
    const emitted = path.join(dist, output.slice(1))
    assert.equal(hash(fs.readFileSync(emitted)), hash(contents), `${filename}: emitted bytes equal SVG loader output`)
    const document = parse(contents.toString(), 'image/svg+xml', filename)
    assert.equal(document.documentElement.localName, 'svg', `${filename}: SVG root`)
    return {
      name: path.relative(root, filename),
      url: '/_next' + output,
      contents,
      geometry: geometry(document.documentElement),
    }
  })
}

function validateHTML(html, page, assets, label) {
  assert.doesNotMatch(html, /data:image\/[^;\s]+;base64,/i, `${label}: no embedded base64 images in page HTML`)
  const document = parse(html, 'text/html', label)
  const images = elements(document, 'img')
  for (const asset of assets) {
    const matches = images.filter(image => attr(image, 'src') === asset.url)
    assert.equal(matches.length, 1, `${label}: one external image for ${asset.name}`)
    assert.ok(Number(attr(matches[0], 'width')) > 0, `${asset.name}: reserved image width`)
    assert.ok(Number(attr(matches[0], 'height')) > 0, `${asset.name}: reserved image height`)
    assert.ok(matches[0].hasAttribute('alt'), `${asset.name}: explicit alternative text`)
  }
  const remainingInline = new Set(elements(document, 'svg').map(geometry))
  for (const asset of assets) {
    assert.ok(!remainingInline.has(asset.geometry), `${label}: ${asset.name} is not also duplicated inline`)
  }
  const canonical = elements(document, 'link').filter(node => attr(node, 'rel') === 'canonical')
  assert.equal(canonical.length, 1, `${label}: one canonical`)
  assert.equal(attr(canonical[0], 'href'), 'https://www.nervos.org' + page.route, `${label}: original canonical`)
}

async function request(value) {
  const url = new URL(value, origin)
  assert.equal(url.origin, origin.origin, 'Never request a non-local URL')
  requests += 1
  return fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(30000) })
}

async function main() {
  const assetsByURL = new Map()
  const pageRows = []
  for (const page of pages) {
    const oldFile = path.join(baseline, 'server/pages/en', page.route.slice(1) + '.html')
    const newFile = path.join(dist, 'server/pages/en', page.route.slice(1) + '.html')
    const oldHTML = fs.readFileSync(oldFile, 'utf8')
    const newHTML = fs.readFileSync(newFile, 'utf8')
    const oldDocument = parse(oldHTML, 'text/html', oldFile)
    const oldGeometry = new Set(elements(oldDocument, 'svg').map(geometry))
    const assets = sourceAssets(page)
    for (const asset of assets) {
      assert.ok(oldGeometry.has(asset.geometry), `${asset.name}: geometry exactly matches a previous inline SVG`)
      assert.ok(!assetsByURL.has(asset.url), `${asset.name}: unique asset URL in this acceptance scope`)
      assetsByURL.set(asset.url, asset)
    }
    validateHTML(newHTML, page, assets, `${page.route} emitted English HTML`)
    pageRows.push({
      route: page.route,
      oldHTMLBytes: Buffer.byteLength(oldHTML),
      newHTMLBytes: Buffer.byteLength(newHTML),
      assets: assets.length,
    })
    page.assets = assets
  }
  assert.equal(assetsByURL.size, 17, 'All 17 source assets are checked, including pattern transforms and masks')
  console.log(
    'Disk acceptance passed: 17 optimized SVGs preserve prior inline geometry and have no inline base64 copies.',
  )
  console.table(pageRows)

  for (const page of pages) {
    const response = await request(page.route)
    assert.equal(response.status, 200, `${page.route}: direct HTML response`)
    assert.equal(response.headers.get('location'), null, `${page.route}: no redirect`)
    assert.match(response.headers.get('content-type') ?? '', /^text\/html(?:\s*;|$)/i)
    validateHTML(await response.text(), page, page.assets, `${page.route} HTTP English HTML`)
  }
  const pending = [...assetsByURL.values()]
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (pending.length) {
        const asset = pending.shift()
        const response = await request(asset.url)
        assert.equal(response.status, 200, `${asset.url}: direct asset response`)
        assert.equal(response.headers.get('location'), null, `${asset.url}: no redirect`)
        assert.match(response.headers.get('content-type') ?? '', /^image\/svg\+xml(?:\s*;|$)/i)
        const cache = response.headers.get('cache-control') ?? ''
        assert.match(cache, /(?:^|,)\s*public\s*(?:,|$)/i, `${asset.url}: publicly cacheable static asset`)
        assert.match(cache, /(?:^|,)\s*immutable\s*(?:,|$)/i, `${asset.url}: immutable content hash`)
        assert.ok(
          Number(cache.match(/(?:^|,)\s*max-age=(\d+)/i)?.[1]) >= 31536000,
          `${asset.url}: one-year cache lifetime`,
        )
        assert.equal(
          hash(Buffer.from(await response.arrayBuffer())),
          hash(asset.contents),
          `${asset.url}: HTTP bytes match expected optimized source`,
        )
      }
    }),
  )
  console.log(`${requests} local HTTP checks passed; all 17 SVG assets match the pre-externalization geometry.`)
}

try {
  await main()
} catch (error) {
  if (error instanceof TypeError && error.message === 'fetch failed') {
    console.error(
      `Local server unavailable at ${origin.origin}; disk checks above passed, HTTP acceptance is not yet complete.`,
    )
    process.exitCode = 2
  } else throw error
}
