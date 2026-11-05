import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DOMParser } from '@xmldom/xmldom'
import ts from 'typescript'

process.env.SKIP_ENV_VALIDATION = '1'
const { default: settings } = await import('../../../next.config.mjs')
const root = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(import.meta.url)
const nextImageLoader = require('next/dist/build/webpack/loaders/next-image-loader').default

const svgrRequire = createRequire(require.resolve('@svgr/webpack'))
const { transform } = svgrRequire('@svgr/core')
const svgo = svgrRequire('@svgr/plugin-svgo')
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8')

function load(filename, dependencies) {
  const { outputText } = ts.transpileModule(read(filename), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(
    name => {
      if (name === 'react/jsx-runtime') return require(name)
      assert.ok(Object.hasOwn(dependencies, name), `${filename}: unexpected runtime dependency ${name}`)
      return dependencies[name]
    },
    loaded,
    loaded.exports,
  )
  return loaded.exports
}

const { ExternalSvg } = load('src/components/ExternalSvg/index.tsx', {})
const trace = {
  traceChild() {
    return this
  },
  traceAsyncFn(callback) {
    return callback()
  },
  traceFn(callback) {
    return callback()
  },
}

async function asset(filename, options = {}) {
  const bytes = fs.readFileSync(path.join(root, filename))
  const resourcePath = path.join(root, filename)
  const expectedSvg = transform.sync(
    bytes.toString(),
    {},
    {
      filePath: resourcePath,
      caller: { name: '@svgr/webpack', defaultPlugins: [svgo] },
    },
  )
  const { clone } = configuredRules()
  let emitted
  let output = bytes
  // Webpack executes loaders right-to-left and converts their input according
  // to loader.raw. Exercise the actual configured optimizer -> Next chain.
  for (const step of [...clone.use].reverse()) {
    const isNext = step.loader === 'next-image-loader'
    const implementation = isNext ? nextImageLoader : require(step.loader)
    const raw = isNext || implementation.raw
    const input = raw ? Buffer.from(output) : output.toString()
    output = await implementation.call(
      {
        rootContext: root,
        resourcePath,
        resourceQuery: '?url',
        currentTraceSpan: trace,
        cacheable() {
          return undefined
        },
        getOptions: () =>
          isNext
            ? { ...step.options, compilerType: 'client', isDev: false, assetPrefix: '', basePath: '', ...options }
            : (step.options ?? {}),
        emitFile: (name, content) => {
          emitted = { name, content }
        },
      },
      input,
    )
  }
  const javascript = output.toString()
  assert.ok(emitted, `${filename}: the real Next loader emits a file`)
  assert.equal(emitted.content.toString(), expectedSvg, `${filename}: preserve the existing SVGR/SVGO rendering`)
  assert.deepEqual(fs.readFileSync(resourcePath), bytes, `${filename}: source SVG remains unchanged`)
  assert.doesNotMatch(javascript, /data:image|<svg/, `${filename}: no embedded SVG or raster in the JS module`)
  const data = JSON.parse(javascript.replace(/^export default /, '').replace(/;$/, ''))
  return { data, emitted, bytes, javascript, expectedSvg }
}

function configuredRules() {
  // The installed Next loader's rule shape, including its metadata exclusions.
  const imageRule = {
    test: /\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|svg)$/i,
    loader: 'next-image-loader',
    issuer: { not: /\.(css|scss|sass)$/i },
    dependency: { not: ['url'] },
    resourceQuery: { not: [/__next_metadata/, /__next_metadata_route__/, /__next_metadata_image_meta__/] },
    options: { compilerType: 'server', isDev: false, assetPrefix: '/cdn', basePath: '/site' },
  }
  const config = { module: { rules: [imageRule] } }
  assert.equal(settings.webpack(config), config)
  const clone = config.module.rules.find(rule => rule.use?.some(step => step.loader === 'next-image-loader'))
  const svgr = config.module.rules.find(rule => rule.use?.includes('@svgr/webpack'))
  assert.ok(clone && svgr)
  return { imageRule, clone, svgr }
}

function matches(condition, value) {
  if (condition instanceof RegExp) return condition.test(value)
  if (typeof condition === 'string') return value.startsWith(condition)
  if (Array.isArray(condition)) return condition.some(item => matches(item, value))
  if (condition.and && !condition.and.every(item => matches(item, value))) return false
  if (condition.or && !condition.or.some(item => matches(item, value))) return false
  if (condition.not && matches(condition.not, value)) return false
  return true
}

test('SVG URL opt-in preserves Next settings and runs the SVGR optimizer before static image emission', () => {
  const { imageRule, clone, svgr } = configuredRules()
  for (const key of ['issuer', 'dependency']) assert.equal(clone[key], imageRule[key], key)
  assert.equal(clone.loader, undefined, 'The explicit use chain must not also retain shorthand loader/options')
  assert.equal(clone.options, undefined)
  assert.equal(clone.use.length, 2)
  assert.equal(clone.use[0].loader, imageRule.loader)
  assert.equal(clone.use[0].options, imageRule.options)
  assert.equal(clone.use[1].loader, path.join(root, 'scripts/svg-static-loader.cjs'))
  assert.ok(clone.resourceQuery.and.includes(imageRule.resourceQuery), 'Next metadata query guards are retained')
  assert.ok(imageRule.test.test('ordinary.svg'), 'The callback does not mutate Next’s original test')
  // Next 14 removes SVG from the first image rule after invoking user webpack.
  // The independently cloned query rule must survive that normalization.
  imageRule.test = /\.(png|jpg|jpeg|gif|webp|avif|ico|bmp)$/i
  assert.equal(imageRule.test.test('drawing.svg'), false)
  assert.equal(clone.test.test('drawing.svg'), true)
  assert.equal(clone.test.test('drawing.SVG'), true)
  assert.equal(clone.test.test('drawing.png'), false)
  assert.ok(svgr.test.test('ordinary.svg'))
  imageRule.resourceQuery.not.push(/^\?url$/)
  assert.equal(matches(clone.resourceQuery, '?url'), false, 'The original query guard remains active, not just copied')
})

test('only exact ?url imports use static SVG files while ordinary imports retain SVGR', () => {
  const { clone, svgr } = configuredRules()
  for (const query of ['', '?raw', '?url=1', '?url&other=1', '?noturl', '?__next_metadata']) {
    assert.equal(matches(clone.resourceQuery, query), false, query)
    assert.equal(matches(svgr.resourceQuery, query), true, query)
  }
  assert.equal(matches(clone.resourceQuery, '?url'), true)
  assert.equal(matches(svgr.resourceQuery, '?url'), false)
  assert.equal(matches(clone.issuer, '/pages/wallets.tsx'), true)
  assert.equal(matches(clone.issuer, '/styles/page.scss'), false)
  assert.equal(matches(clone.dependency, 'url'), false)
  assert.equal(matches(clone.dependency, 'esm'), true)
})

test('missing Next static image support fails explicitly rather than silently inlining SVGs', () => {
  assert.throws(() => settings.webpack({ module: { rules: [] } }), /Next static image imports/)
})

const parseImage = html => {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const images = Array.from(document.getElementsByTagName('img'))
  assert.equal(images.length, 1)
  assert.equal(document.getElementsByTagName('svg').length, 0)
  return images[0]
}

test('ExternalSvg emits the original static URL and intrinsic dimensions without image optimization', () => {
  const data = { src: '/_next/static/media/brand.12345678.svg', width: 334, height: 48 }
  const html = renderToStaticMarkup(React.createElement(ExternalSvg, { src: data }))
  const image = parseImage(html)
  assert.equal(image.getAttribute('src'), data.src)
  assert.equal(image.getAttribute('width'), '334')
  assert.equal(image.getAttribute('height'), '48')
  assert.equal(image.getAttribute('alt'), '')
  assert.equal(image.hasAttribute('srcset'), false)
  assert.equal(image.hasAttribute('loading'), false, 'Keep existing loading behavior unless explicitly requested')
  assert.doesNotMatch(html, /_next\/image\?|data:image|\[object Object\]/)
})

test('display overrides and ordinary img attributes pass through without changing decorative geometry', () => {
  const html = renderToStaticMarkup(
    React.createElement(ExternalSvg, {
      src: { src: '/_next/static/media/left.12345678.svg', width: 5733, height: 3539 },
      width: 430,
      height: 265,
      alt: 'Wallet decoration',
      className: 'existing-class',
      'data-position': 'left',
      'aria-hidden': true,
      loading: 'lazy',
      style: { transform: 'rotate(-90deg)', transformOrigin: 'right top', mixBlendMode: 'difference' },
    }),
  )
  const image = parseImage(html)
  for (const [name, value] of Object.entries({
    width: '430',
    height: '265',
    alt: 'Wallet decoration',
    class: 'existing-class',
    'data-position': 'left',
    'aria-hidden': 'true',
    loading: 'lazy',
  }))
    assert.equal(image.getAttribute(name), value, name)
  assert.equal(
    image.getAttribute('style'),
    'transform:rotate(-90deg);transform-origin:right top;mix-blend-mode:difference',
  )
})

test('the real optimizer/Next chain matches existing rendering for seventeen assets without changing their sources', async () => {
  const walletIcons = fs
    .readdirSync(path.join(root, 'src/pages/wallets/icons'))
    .filter(filename => filename.endsWith('.svg'))
  const files = [
    ...walletIcons.map(filename => `src/pages/wallets/icons/${filename}`),
    'src/pages/wallets/embellished_left.svg',
    'src/pages/wallets/embellished_right.svg',
    'src/pages/media-kit/embellished/left.svg',
    'src/pages/media-kit/embellished/right.svg',
  ]
  assert.equal(files.length, 17)
  const dimensions = new Map()
  for (const filename of files) {
    const { data, emitted } = await asset(filename)
    assert.match(data.src, /^\/_next\/static\/media\/[^/]+\.[a-f0-9]{8}\.svg$/)
    assert.ok(data.width > 0 && data.height > 0)
    assert.equal(emitted.name, data.src.slice('/_next'.length))
    dimensions.set(filename, [data.width, data.height])
  }
  for (const [filename, size] of [
    ['src/pages/wallets/icons/GateWeb3Wallet.svg', [282, 47]],
    ['src/pages/wallets/icons/coinex.svg', [334, 48]],
    ['src/pages/media-kit/embellished/left.svg', [695, 1063]],
    ['src/pages/media-kit/embellished/right.svg', [684, 492]],
  ])
    assert.deepEqual(dimensions.get(filename), size, filename)
  const prefixed = await asset('src/pages/wallets/icons/wallet.svg', {
    compilerType: 'server',
    assetPrefix: '/cdn',
    basePath: '/site',
  })
  assert.match(prefixed.data.src, /^\/cdn\/_next\/static\/media\/wallet\.[a-f0-9]{8}\.svg$/)
  assert.match(prefixed.emitted.name, /^(?:\.\.\/){2}static\/media\/wallet\./)
})

test('Media Kit retains the historical SVGO pattern-scale rounding rather than serving the unoptimized crop', async () => {
  for (const filename of ['src/pages/media-kit/embellished/left.svg', 'src/pages/media-kit/embellished/right.svg']) {
    const { bytes, emitted } = await asset(filename)
    const raw = new DOMParser().parseFromString(bytes.toString(), 'image/svg+xml')
    const optimized = new DOMParser().parseFromString(emitted.content.toString(), 'image/svg+xml')
    assert.equal(raw.getElementsByTagName('use')[0].getAttribute('transform'), 'scale(0.000244141 0.000470367)')
    assert.equal(optimized.getElementsByTagName('use')[0].getAttribute('transform'), 'scale(.00024 .00047)')
    assert.equal(optimized.documentElement.hasAttribute('viewBox'), false, 'Match the original SVGR root attributes')
    assert.equal(optimized.documentElement.getAttribute('width'), raw.documentElement.getAttribute('width'))
    assert.equal(optimized.documentElement.getAttribute('height'), raw.documentElement.getAttribute('height'))
  }
})

test('Media Kit keeps both original positions, dimensions and outer difference blending', async () => {
  const [left, right] = await Promise.all([
    asset('src/pages/media-kit/embellished/left.svg'),
    asset('src/pages/media-kit/embellished/right.svg'),
  ])
  for (const item of [left, right]) assert.match(item.bytes.toString(), /style="mix-blend-mode:difference"/)
  const illustrationFile = 'src/pages/media-kit/illustration/index.tsx'
  const illustrationSource = ts.createSourceFile(illustrationFile, read(illustrationFile), ts.ScriptTarget.Latest, true)
  const illustration = load(
    illustrationFile,
    Object.fromEntries(
      illustrationSource.statements
        .filter(ts.isImportDeclaration)
        .map(node => [node.moduleSpecifier.text, { src: '/fixture.png', width: 1, height: 1 }]),
    ),
  ).default
  const { default: MediaKit } = load('src/pages/media-kit/index.page.tsx', {
    'next/router': { useRouter: () => ({ pathname: '/media-kit' }) },
    'next/image': 'img',
    'next/head': 'head',
    'next-i18next': { useTranslation: () => [key => key, { language: 'en' }] },
    'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
    'src/utils': { BASE_URL: 'https://www.nervos.org' },
    '../../server/page-seo': { withStaticPageSEO: (_, callback) => callback },
    '../../components/Page': { Page: 'div' },
    '../../components/StyledLink': { StyledLink: 'a' },
    '../../components/ExternalSvg': { ExternalSvg },
    './embellished/left.svg?url': left.data,
    './embellished/right.svg?url': right.data,
    './illustration': illustration,
    './index.module.scss': { embellished: 'existing-embellished' },
  })
  const decorations = []
  function visit(node) {
    if (!React.isValidElement(node)) return
    if (node.type === ExternalSvg) decorations.push(node)
    React.Children.forEach(node.props.children, visit)
  }
  visit(MediaKit())
  assert.equal(decorations.length, 2)
  for (const [index, expected] of [left.data, right.data].entries()) {
    const image = parseImage(renderToStaticMarkup(decorations[index]))
    assert.equal(image.getAttribute('src'), expected.src)
    assert.equal(image.getAttribute('width'), String(expected.width))
    assert.equal(image.getAttribute('height'), String(expected.height))
    assert.equal(image.getAttribute('data-position'), index === 0 ? 'left' : 'right')
    assert.equal(image.getAttribute('class'), 'existing-embellished')
    assert.equal(image.getAttribute('style'), 'mix-blend-mode:difference')
    assert.equal(image.getAttribute('alt'), '')
  }
})
