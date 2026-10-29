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
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8')
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const element = React.createElement
const avif = '/images/knowledge-hub/guide-background.1c63b618.avif'
const webp = '/images/knowledge-hub/guide-background.420c8299.webp'
const jpeg = '/images/knowledge-hub/guide-background.jpg'
const source = read('src/components/KnowledgeHub/Home.tsx')
const guideSource = read('src/components/KnowledgeHub/GuideLife.tsx')
const stylesheet = postcss.parse(
  sass.compile(path.join(directory, 'home-v2.module.scss'), { logger: sass.Logger.silent }).css,
)
const fixture = JSON.parse(read('scripts/fixtures/kb-guide-background-assets.json'))

// The source image and generated profile are immutable asset evidence. Runtime
// source and complete stylesheet hashes are intentionally not frozen here.
const baseline = {
  sourceImage: '8f6f4a36346db0979c87bc05021cbe3f0f8e16ab125a07a910e41279da2323eb',
  srgbProfile: 'c56e1685d888f5edb92fe07f2750f387f8fe8e91b32ff8fb0b56bfbbb9458353',
}

function withoutPreload(text) {
  const ast = ts.createSourceFile('Home.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const links = []
  const visit = node => {
    if (
      ts.isJsxSelfClosingElement(node) &&
      node.tagName.getText(ast) === 'link' &&
      node.attributes.properties.some(
        attribute =>
          ts.isJsxAttribute(attribute) && attribute.name.text === 'href' && attribute.initializer?.text === avif,
      )
    )
      links.push(node)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.equal(links.length, 1, 'Only the explicitly approved typed preload is added')
  const node = links[0]
  const attributes = {}
  for (const attribute of node.attributes.properties) {
    if (ts.isJsxAttribute(attribute)) {
      assert.ok(attribute.initializer && ts.isStringLiteral(attribute.initializer))
      attributes[attribute.name.text] = attribute.initializer.text
      continue
    }
    assert.ok(
      ts.isJsxSpreadAttribute(attribute) && ts.isObjectLiteralExpression(attribute.expression),
      'Only an explicit literal attribute spread is allowed',
    )
    assert.equal(attribute.expression.properties.length, 1)
    const property = attribute.expression.properties[0]
    assert.ok(ts.isPropertyAssignment(property))
    assert.equal(property.name.getText(ast), 'fetchpriority')
    assert.ok(ts.isStringLiteral(property.initializer))
    assert.equal(property.initializer.text, 'high')
    attributes.fetchpriority = property.initializer.text
  }
  assert.deepEqual(attributes, { rel: 'preload', as: 'image', href: avif, type: 'image/avif', fetchpriority: 'high' })
  const start = text.lastIndexOf('\n', node.getStart(ast)) + 1
  const end = text.indexOf('\n', node.getEnd()) + 1
  assert.equal(text.slice(start, node.getStart(ast)).trim(), '')
  assert.equal(text.slice(node.getEnd(), end).trim(), '')
  return text.slice(0, start) + text.slice(end)
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

const styles = new Proxy({}, { get: (_, key) => key })
const { GuideLife } = load(guideSource, {
  react: React,
  './guide-life': load(read('src/components/KnowledgeHub/guide-life.ts')),
})
const article = id => ({
  id,
  title: `Existing ${id}`,
  language: 'en',
  canonicalPath: `/knowledge-base/${id}`,
  date: null,
  readingMinutes: 5,
  coverImage: null,
})
const pageProps = {
  catalog: {
    articles: [article('hub-article')],
    hubs: [{ id: 'existing-hub', name: 'Existing hub' }],
    subjects: [],
    featured: [],
  },
  counts: { 'existing-hub': 1 },
  mostRead: { startDate: '2025-09-28', endDate: '2026-09-27', articles: [article('ranked-article')] },
}

function renderHome(text) {
  const head = []
  const { KnowledgeHubHome } = load(text, {
    react: React,
    'next/link': { default: 'a' },
    '@headlessui/react': {},
    'next/head': {
      default: ({ children }) => {
        head.push(children)
        return null
      },
    },
    'next/router': { useRouter: () => ({ locale: 'en' }) },
    '../Page': {
      Page: ({ className, children }) =>
        element('main', { className }, children({ renderHeader: () => element('header', null, 'Existing header') })),
    },
    './fixtures': { hubs: [{ description: 'Existing hub description' }] },
    './content': { articlePath: value => value.canonicalPath, featuredArticles: catalog => catalog.articles },
    './home-v2.module.scss': { default: styles },
    './Icon': { Icon: ({ name }) => element('svg', { 'data-icon': name, 'aria-hidden': true }) },
    './ArticleLanguageLink': { ArticleLanguageLink: ({ article: _article, ...props }) => element('a', props) },
    './Components': {
      ArrowButton: props => element('a', props),
      HubCard: ({ name, titles }) =>
        element('div', { className: 'hub-card' }, element('h3', null, name), titles.join(', ')),
      ArticleCover: ({ children, className }) => element('div', { className }, children),
    },
    './KnowledgeFooter': { KnowledgeFooter: () => element('footer', null, 'Existing footer') },
    './GuideLife': { GuideLife },
    './NeuronIcon': { NeuronIcon: () => element('svg', { 'data-icon': 'neuron' }) },
    './analytics': { trackKBEvent: () => undefined },
    './search-analytics': { trackKBSearch: () => undefined },
    './useNewsletterSignup': {
      useNewsletterSignup: () => ({
        onSubmit: () => undefined,
        isSubmitting: false,
        status: '',
        isError: false,
        isInvalid: false,
      }),
    },
  })
  const main = renderToStaticMarkup(element(KnowledgeHubHome, pageProps))
  return { main, head: renderToStaticMarkup(element(React.Fragment, null, head)) }
}

test('the real Home render adds one typed high-priority preload only; the visible main tree is unchanged', () => {
  const previous = withoutPreload(source)
  const warnings = []
  const originalError = console.error
  let current
  try {
    console.error = (...args) => warnings.push(args.map(String).join(' '))
    current = renderHome(source)
  } finally {
    console.error = originalError
  }
  assert.deepEqual(warnings, [], 'The native link must not trigger React 18 unknown fetchPriority warnings')
  const before = renderHome(previous)
  assert.equal(current.main, before.main, 'Head-only loading hints must not change the visible React tree')
  const withoutHint = current.head.replace(
    /<link\b(?=[^>]*href="\/images\/knowledge-hub\/guide-background\.1c63b618\.avif")[^>]*\/>/,
    '',
  )
  assert.equal(withoutHint, before.head)
  const doc = new DOMParser().parseFromString(
    `<html><head>${current.head}</head><body>${current.main}</body></html>`,
    'text/html',
  )
  const links = Array.from(doc.getElementsByTagName('link')).filter(link => link.getAttribute('href') === avif)
  assert.equal(links.length, 1)
  const link = links[0]
  assert.equal(link.parentNode.tagName, 'head')
  assert.equal(link.getAttribute('rel'), 'preload')
  assert.equal(link.getAttribute('as'), 'image')
  assert.equal(link.getAttribute('href'), avif)
  assert.equal(link.getAttribute('type'), 'image/avif')
  assert.equal(link.getAttribute('fetchpriority'), 'high')
  assert.equal(link.hasAttribute('fetchPriority'), false)
  const guide = Array.from(doc.getElementsByTagName('div')).find(node => node.getAttribute('class') === 'guideBanner')
  assert.ok(guide)
  const directChildren = Array.from(guide.childNodes).filter(node => node.nodeType === 1)
  assert.deepEqual(
    directChildren.map(node => [node.tagName, node.getAttribute('class')]),
    [
      ['canvas', 'guideLife'],
      ['div', 'guideContent'],
    ],
  )
  assert.equal(directChildren[0].getAttribute('aria-hidden'), 'true')
  assert.match(guide.textContent, /Start hereWhat is Nervos\?A complete guide for beginners\./)
  const button = guide.getElementsByTagName('button')[0]
  assert.equal(button.getAttribute('class'), 'guideButton')
  assert.equal(button.textContent, 'Take the guide →')
  assert.ok(current.main.indexOf('guideBanner') < current.main.indexOf('topics-title'))
})

test('CSS retains the JPEG fallback, center/cover, geometry and isolation below an ordered image-set', () => {
  const guideRules = []
  stylesheet.walkRules(rule => {
    if (
      rule.selector === '.guideBanner' &&
      rule.parent.type === 'root' &&
      rule.nodes.some(node => node.prop === 'background-image')
    )
      guideRules.push(rule)
  })
  assert.equal(guideRules.length, 1)
  const rule = guideRules[0]
  const declarations = Object.fromEntries(
    rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value]),
  )
  assert.equal(declarations.background, `#111 url("${jpeg}") center/cover no-repeat`)
  assert.equal(declarations['min-height'], '340px')
  assert.equal(declarations['margin-top'], '64px')
  assert.equal(declarations.padding, '32px 48px')
  assert.equal(declarations.isolation, 'isolate')
  const inherited = {}
  stylesheet.walkRules(entry => {
    if (entry.selector === '.guideBanner' && entry.parent.type === 'root')
      entry.walkDecls(declaration => {
        inherited[declaration.prop] = declaration.value
      })
  })
  assert.equal(inherited.position, 'relative')
  assert.equal(inherited.overflow, 'hidden')
  assert.equal(inherited.color, '#fff')
  assert.equal(inherited['border-radius'], '20px')
  assert.equal(
    declarations['background-image'],
    `image-set(url("${avif}") type("image/avif"), url("${webp}") type("image/webp"), url("${jpeg}") type("image/jpeg"))`,
  )
  assert.ok(
    rule.nodes.findIndex(node => node.prop === 'background') <
      rule.nodes.findIndex(node => node.prop === 'background-image'),
  )
})

test('the real GuideLife component remains a decorative canvas without additional visible wrappers', () => {
  const html = renderToStaticMarkup(element(GuideLife, { className: 'guideLife' }))
  assert.equal(html, '<canvas class="guideLife" aria-hidden="true"></canvas>')
})

test('new formats preserve 2400×680 pixels and explicit sRGB ICC; original JPEG and asset hashes are fixed', async () => {
  assert.equal(fixture.source.file, `public${jpeg}`)
  assert.equal(fixture.source.sha256, baseline.sourceImage)
  assert.equal(fixture.encoding.resize, false)
  assert.equal(fixture.encoding.crop, false)
  assert.equal(fixture.encoding.iccProfile, 'srgb')
  const original = fs.readFileSync(path.join(root, fixture.source.file))
  assert.equal(original.length, fixture.source.bytes)
  assert.equal(hash(original), baseline.sourceImage, 'The original JPEG remains a byte-identical fallback')
  const sourceMetadata = await sharp(original).metadata()
  assert.deepEqual([sourceMetadata.width, sourceMetadata.height], [2400, 680])
  const sourcePixels = await sharp(original).toColourspace('srgb').raw().toBuffer({ resolveWithObject: true })
  assert.deepEqual(
    fixture.outputs.map(output => output.file),
    [`public${avif}`, `public${webp}`],
  )
  for (const output of fixture.outputs) {
    const bytes = fs.readFileSync(path.join(root, output.file))
    assert.equal(bytes.length, output.bytes)
    assert.equal(hash(bytes), output.sha256)
    assert.ok(
      output.file.includes(`.${output.sha256.slice(0, 8)}.`),
      'Immutable paths must contain the actual content hash',
    )
    assert.ok(bytes.length < original.length / 2, 'Each modern format must substantially reduce transfer size')
    const metadata = await sharp(bytes).metadata()
    assert.deepEqual([metadata.width, metadata.height], [2400, 680])
    assert.deepEqual([output.width, output.height], [2400, 680])
    assert.equal(metadata.space, 'srgb')
    assert.equal(metadata.hasAlpha, false)
    assert.equal(metadata.hasProfile, true)
    assert.equal(metadata.icc.subarray(36, 40).toString('ascii'), 'acsp')
    assert.equal(hash(metadata.icc), baseline.srgbProfile)
    if (output.format === 'avif') {
      assert.equal(metadata.format, 'heif')
      assert.equal(metadata.compression, 'av1')
    } else assert.equal(metadata.format, output.format)
    const pixels = await sharp(bytes).toColourspace('srgb').raw().toBuffer({ resolveWithObject: true })
    assert.deepEqual(pixels.info, sourcePixels.info, 'Decoded dimensions and channels must not change')
    let total = 0
    for (let index = 0; index < pixels.data.length; index++)
      total += Math.abs(pixels.data[index] - sourcePixels.data[index])
    const meanDifference = total / sourcePixels.data.length
    assert.ok(
      Math.abs(meanDifference - output.meanAbsoluteChannelDifference) < 1e-9,
      'The recorded color difference must match the asset bytes',
    )
    assert.ok(
      meanDifference < (output.format === 'avif' ? 3 : 2),
      'Mean decoded-channel difference must remain within the reviewed quality budget',
    )
  }
})

test('the guide background preload is scoped to the KB home, not a shared shell or unrelated page', () => {
  const references = []
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (
        /\.(?:tsx?|scss)$/.test(file) &&
        /guide-background\.(?:[0-9a-f]{8}\.)?(?:avif|webp|jpg)/.test(fs.readFileSync(file, 'utf8'))
      )
        references.push(path.relative(root, file))
    }
  }
  visit(path.join(root, 'src'))
  assert.deepEqual(references.sort(), [
    'src/components/KnowledgeHub/Home.tsx',
    'src/components/KnowledgeHub/home-v2.module.scss',
  ])
})
