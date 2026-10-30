import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DOMParser } from '@xmldom/xmldom'
import * as sass from 'sass'
import postcss from 'postcss'
import sharp from 'sharp'
import ts from 'typescript'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const directory = path.join(root, 'src/components/KnowledgeHub')
const require = createRequire(import.meta.url)
const element = React.createElement
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8')
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const stylesheet = postcss.parse(
  sass.compile(path.join(directory, 'article-v2.module.scss'), { logger: sass.Logger.silent }).css,
)
const backgrounds = [
  {
    selector: '.articleBody .discoverBanner',
    stem: 'discover-banner-background',
    color: 'var(--kbDark)',
    width: 1380,
    height: 344,
    sourceBytes: 351298,
    sourceHash: '89e1df61df797417f0720c35ce621d9ab06c01b86d0c47b00cab534dbea8e249',
    avif: 'discover-banner-background.f824b2b2.avif',
    webp: 'discover-banner-background.cb4683e2.webp',
  },
  {
    selector: '.discoverCompact',
    stem: 'discover-background',
    color: 'var(--kbAccent)',
    width: 612,
    height: 578,
    sourceBytes: 262624,
    sourceHash: 'dba7095d082becac45547d3a90b6f03b2f90f4264d2e69bcd7cf99e01b573618',
    avif: 'discover-background.292dffa2.avif',
    webp: 'discover-background.51d08613.webp',
  },
]
const url = filename => `/images/knowledge-hub/${filename}`

function declarations(selector, media) {
  const values = {}
  stylesheet.walkRules(rule => {
    if (rule.selector !== selector) return
    if (media ? rule.parent.type !== 'atrule' || rule.parent.params !== media : rule.parent.type !== 'root') return
    for (const entry of rule.nodes) if (entry.type === 'decl') values[entry.prop] = entry.value
  })
  return values
}

function load(text, imports = {}) {
  const { outputText } = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(
    name => {
      if (name === 'react/jsx-runtime') return require(name)
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`)
      return imports[name]
    },
    loaded,
    loaded.exports,
  )
  return loaded.exports
}

const { GuideLife } = load(read('src/components/KnowledgeHub/GuideLife.tsx'), {
  react: React,
  './guide-life': load(read('src/components/KnowledgeHub/guide-life.ts')),
})

function renderBanner(compact) {
  const events = []
  const canvasProps = []
  const styles = prefix => new Proxy({}, { get: (_, key) => `${prefix}-${String(key)}` })
  const CapturedGuideLife = props => {
    canvasProps.push(props)
    return element(GuideLife, props)
  }
  const ArrowButton = ({ children, href, className }) => element('a', { href, className }, children)
  const { DiscoverBanner } = load(read('src/components/KnowledgeHub/Shared.tsx'), {
    clsx: { default: (...values) => values.filter(Boolean).join(' ') },
    react: React,
    'next/head': { default: () => null },
    'next/link': { default: 'a' },
    '../Page': { Page: () => null },
    './Home': { Icon: () => null, Newsletter: () => null },
    './index.module.scss': { default: styles('base') },
    './pages.module.scss': { default: styles('legacy') },
    './home-v2.module.scss': { default: styles('home') },
    './pages-v2.module.scss': { default: styles('pages') },
    './KnowledgeFooter': { KnowledgeFooter: () => null },
    './article-v2.module.scss': { default: styles('article') },
    './Components': { ArrowButton },
    './GuideLife': { GuideLife: CapturedGuideLife },
    './analytics': { trackKBEvent: (name, data) => events.push({ name, data }) },
    '../../utils/kb-hubs': { kbHubPath: () => null },
  })
  const banner = DiscoverBanner({ compact, revision: true })
  const html = renderToStaticMarkup(banner)
  const doc = new DOMParser().parseFromString(`<html><body>${html}</body></html>`, 'text/html')
  return { banner, html, doc, events, canvasProps, ArrowButton }
}

test('updated Discover banners keep static artwork, revised copy, CTA and click tracking', () => {
  for (const compact of [false, true]) {
    const { banner, doc, events, canvasProps, ArrowButton } = renderBanner(compact)
    const aside = doc.getElementsByTagName('aside')[0]
    assert.equal(aside.getAttribute('class'), compact ? 'article-discoverCompact' : 'article-discoverBanner')
    const children = Array.from(aside.childNodes).filter(node => node.nodeType === 1)
    assert.deepEqual(
      children.map(node => node.tagName),
      ['div', 'span'],
    )
    assert.equal(children[0].hasAttribute('data-life-exclusion'), true)
    assert.equal(children[1].hasAttribute('data-life-exclusion'), true)
    assert.equal(
      aside.getElementsByTagName('h2')[0].textContent,
      'Meet Nervos CKB, a blockchain built for flexibility.',
    )
    assert.equal(
      aside.getElementsByTagName('p')[0].textContent,
      'Explore the ideas, architecture, and ecosystem behind CKB.',
    )
    const link = aside.getElementsByTagName('a')[0]
    assert.equal(link.textContent, 'Discover CKB in 5 Steps')
    assert.equal(link.getAttribute('href'), '/knowledge-base/start-here')
    assert.equal(link.getAttribute('class'), 'article-discoverButton')
    assert.deepEqual(canvasProps, [], 'The revised article banner has no decorative canvas')
    assert.deepEqual(events, [], 'Rendering must not emit a CTA click event')
    const action = banner.props.children[2].props.children
    assert.equal(action.type, ArrowButton)
    assert.equal(action.props.locale, 'en')
    action.props.onClick()
    assert.deepEqual(events, [
      {
        name: 'kb_cta_click',
        data: { cta_id: 'discover_ckb', placement: compact ? 'article_sidebar_banner' : 'article_bottom_banner' },
      },
    ])
  }
})

test('Discover backgrounds keep ordered format candidates, including the reused experiment banner artwork', () => {
  const candidateRules = []
  stylesheet.walkRules(rule => {
    if (
      rule.nodes.some(node => node.prop === 'background-image' && /discover-(?:banner-)?background\./.test(node.value))
    )
      candidateRules.push(rule)
  })
  assert.equal(candidateRules.length, 3)
  const sidebar = declarations('.experimentSidebar .discoverBanner')
  const bottom = declarations('.articleBody .discoverBanner')
  assert.equal(sidebar.background, bottom.background)
  assert.equal(sidebar['background-image'], bottom['background-image'])
  for (const background of backgrounds) {
    const rule = candidateRules.find(rule => rule.selector === background.selector)
    assert.ok(rule)
    assert.equal(rule.parent.type, 'root')
    const values = declarations(background.selector)
    const jpeg = url(`${background.stem}.jpg`)
    assert.equal(values.background, `${background.color} url("${jpeg}") center/cover no-repeat`)
    assert.equal(
      values['background-image'],
      `image-set(url("${url(background.avif)}") type("image/avif"), url("${url(background.webp)}") type("image/webp"), url("${jpeg}") type("image/jpeg"))`,
    )
    assert.ok(
      rule.nodes.findIndex(node => node.prop === 'background') <
        rule.nodes.findIndex(node => node.prop === 'background-image'),
    )
  }
})

test('Discover geometry follows the revised layout while preserving artwork stacking and responsive behavior', () => {
  const banner = declarations('.articleBody .discoverBanner')
  for (const [property, value] of Object.entries({
    position: 'relative',
    gap: '16px',
    'min-height': '214px',
    padding: '32px 48px',
    overflow: 'hidden',
    'border-radius': '9px',
    isolation: 'isolate',
  }))
    assert.equal(banner[property], value)
  const compact = declarations('.discoverCompact')
  for (const [property, value] of Object.entries({
    position: 'relative',
    'flex-direction': 'column',
    gap: '24px',
    'align-items': 'flex-start',
    'min-height': '289px',
    padding: '48px 24px',
    overflow: 'hidden',
    'border-radius': '19px',
    isolation: 'isolate',
  }))
    assert.equal(compact[property], value)
  const canvas = declarations('.discoverLife')
  for (const [property, value] of Object.entries({
    position: 'absolute',
    inset: '0',
    'z-index': '0',
    width: '100%',
    height: '100%',
    opacity: '0.94',
    'pointer-events': 'none',
  }))
    assert.equal(canvas[property], value)
  const content = declarations('.discoverBanner > div,\n.discoverCompact > div,\n.discoverAction')
  assert.equal(content.position, 'relative')
  assert.equal(content['z-index'], '1')
  const tabletBanner = declarations('.articleBody .discoverBanner', '(width <= 1023px)')
  assert.equal(tabletBanner.padding, '32px 48px', 'Tablet uses the same padding as desktop')
  const mobileBanner = declarations('.articleBody .discoverBanner', '(width <= 1023px)')
  assert.equal(mobileBanner['flex-direction'], 'column')
  assert.equal(mobileBanner['align-items'], 'flex-start')
  assert.equal(mobileBanner.padding, '32px 48px')
  assert.equal(declarations('.articleBody .discoverBanner', '(width <= 767px)').padding, '24px')
  assert.equal(declarations('.discoverBanner .discoverAction', '(width <= 1023px)')['align-self'], 'flex-start')
  const mobileCompact = declarations('.discoverCompact', '(width <= 1023px)')
  assert.equal(mobileCompact['min-height'], '0')
  assert.equal(mobileCompact.padding, '32px 24px')
  assert.equal(declarations('.sidebar > .discoverCompact', '(width <= 1023px)')['grid-column'], '1/-1')
  assert.equal(declarations('.discoverLife', '(width <= 1023px)').opacity, '0.42')
})

test('original JPEGs and content-hashed modern files retain their dimensions, sRGB profile and reviewed transfer reductions', async () => {
  const fixture = JSON.parse(read('scripts/fixtures/kb-discover-background-assets.json'))
  assert.equal(fixture.resize, false)
  assert.equal(fixture.crop, false)
  assert.match(fixture.encoding, /Lossy AVIF quality 75 \(4:4:4\) \/ WebP quality 90, effort 6, explicit sRGB ICC/)
  assert.equal(fixture.assets.length, 2)
  for (const background of backgrounds) {
    const sourcePath = `public${url(`${background.stem}.jpg`)}`
    const asset = fixture.assets.find(entry => entry.source === sourcePath)
    assert.ok(asset)
    assert.equal(asset.sha256, background.sourceHash)
    assert.equal(asset.bytes, background.sourceBytes)
    assert.deepEqual([asset.width, asset.height], [background.width, background.height])
    const original = fs.readFileSync(path.join(root, sourcePath))
    assert.equal(hash(original), background.sourceHash, 'JPEG fallback must remain byte-identical')
    assert.equal(original.length, background.sourceBytes)
    const sourceMetadata = await sharp(original).metadata()
    assert.deepEqual([sourceMetadata.width, sourceMetadata.height], [background.width, background.height])
    assert.equal(sourceMetadata.space, 'srgb')
    assert.equal(sourceMetadata.hasProfile, true)
    const sourcePixels = await sharp(original).toColourspace('srgb').raw().toBuffer({ resolveWithObject: true })
    assert.deepEqual(
      asset.outputs.map(output => output.path),
      [`public${url(background.avif)}`, `public${url(background.webp)}`],
    )
    for (const output of asset.outputs) {
      const bytes = fs.readFileSync(path.join(root, output.path))
      assert.equal(bytes.length, output.bytes)
      assert.equal(hash(bytes), output.sha256)
      assert.ok(output.path.includes(`.${output.sha256.slice(0, 8)}.`))
      assert.ok(bytes.length < original.length / 2)
      const metadata = await sharp(bytes).metadata()
      assert.deepEqual([metadata.width, metadata.height], [background.width, background.height])
      assert.equal(metadata.space, 'srgb')
      assert.equal(metadata.hasAlpha, false)
      assert.equal(metadata.hasProfile, true)
      assert.equal(metadata.icc.subarray(36, 40).toString('ascii'), 'acsp')
      assert.equal(hash(metadata.icc), 'c56e1685d888f5edb92fe07f2750f387f8fe8e91b32ff8fb0b56bfbbb9458353')
      if (output.format === 'avif') {
        assert.equal(metadata.format, 'heif')
        assert.equal(metadata.compression, 'av1')
        assert.equal(output.quality, 75)
      } else {
        assert.equal(metadata.format, 'webp')
        assert.equal(output.quality, 90)
      }
      const pixels = await sharp(bytes).toColourspace('srgb').raw().toBuffer({ resolveWithObject: true })
      assert.deepEqual(pixels.info, sourcePixels.info, 'Decoded dimensions and channels must not change')
      let total = 0
      for (let index = 0; index < pixels.data.length; index++)
        total += Math.abs(pixels.data[index] - sourcePixels.data[index])
      const meanDifference = total / sourcePixels.data.length
      assert.ok(Math.abs(meanDifference - output.meanAbsoluteChannelDifference) < 1e-9)
      assert.ok(
        meanDifference < (output.format === 'avif' ? 3 : 2),
        'Remain within the reviewed color-difference budget',
      )
    }
  }
})

test('Discover assets remain CSS-scoped without adding preloads or changing the GuideLife animation contract', () => {
  const references = []
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (
        /\.(?:tsx?|scss)$/.test(file) &&
        /discover-(?:banner-)?background\.(?:[0-9a-f]{8}\.)?(?:avif|webp|jpg)/.test(fs.readFileSync(file, 'utf8'))
      )
        references.push(path.relative(root, file))
    }
  }
  visit(path.join(root, 'src'))
  assert.deepEqual(references, [
    'src/components/KnowledgeHub/_discover-banner.scss',
    'src/components/KnowledgeHub/article-v2.module.scss',
  ])
  const guideSource = read('src/components/KnowledgeHub/GuideLife.tsx')
  assert.match(guideSource, /const CELL_STEP = 15\b/)
  assert.match(guideSource, /const CELL_SIZE = 10\b/)
  assert.match(guideSource, /context\.fillStyle = '#fff'/)
  assert.match(
    guideSource,
    /if \(!visible \|\| document\.hidden \|\| reducedMotion\.matches \|\| !columns \|\| !rows\) return/,
  )
  assert.match(guideSource, /}, 280\)/)
  assert.match(guideSource, /window\.clearInterval\(timer\)/)
  assert.equal(
    renderToStaticMarkup(element(GuideLife, { className: 'article-discoverLife' })),
    '<canvas class="article-discoverLife" aria-hidden="true"></canvas>',
  )
})
