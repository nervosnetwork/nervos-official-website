import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const jsxRuntime = require('react/jsx-runtime')

function load(file, imports = {}, globals = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    URL,
    require: name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`)
      return imports[name]
    },
    ...globals,
  })
  return exports
}

const urls = load('../../utils/sharing-urls.ts')
const { sharingPageUrl, sharingImageUrl } = urls
const { OpenGraph } = load('./index.tsx', {
  'react/jsx-runtime': jsxRuntime,
  'next/head': { default: 'Head' },
  '../../utils': { pick: (value, ...keys) => Object.fromEntries(keys.map(key => [key, value[key]])) },
  '../../utils/sharing-urls': urls,
})

function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}

function renderPage(router, props = {}) {
  const { Page } = load('../Page/index.tsx', {
    react: { forwardRef: callback => callback },
    'react/jsx-runtime': jsxRuntime,
    clsx: { clsx: (...values) => values.filter(Boolean).join(' ') },
    'next/router': { useRouter: () => router },
    '../Footer': { Footer: 'Footer' },
    '../Header': { Header: 'Header' },
    './index.module.scss': { default: { page: 'page' } },
    '../OpenGraph': { OpenGraph },
    '../../utils/sharing-urls': urls,
  })
  const tree = Page(props, null)
  const metadata = nodes(tree).find(node => node.type === OpenGraph)
  const tags = Object.fromEntries(
    nodes(OpenGraph(metadata.props))
      .filter(node => node.type === 'meta')
      .map(node => [node.props.property, node.props.content]),
  )
  return { tree, tags }
}

test('sharing page URLs use the production origin and omit the default language prefix', () => {
  assert.equal(sharingPageUrl('/en/developers'), 'https://www.nervos.org/developers')
  assert.equal(sharingPageUrl('/en'), 'https://www.nervos.org/')
  assert.equal(sharingPageUrl('https://preview.vercel.app/en/mining'), 'https://www.nervos.org/mining')
  assert.equal(
    sharingPageUrl('http://localhost:3000/knowledge-base/start-here'),
    'https://www.nervos.org/knowledge-base/start-here',
  )
  assert.equal(
    sharingPageUrl('/knowledge-base/Original_Article', 'zh'),
    'https://www.nervos.org/zh/knowledge-base/Original_Article',
  )
  assert.equal(
    sharingPageUrl('/zh/knowledge-base/Original_Article', 'zh'),
    'https://www.nervos.org/zh/knowledge-base/Original_Article',
  )
})

test('current query-based Hub and pagination URLs are preserved, not redesigned', () => {
  assert.equal(
    sharingPageUrl('/knowledge-base/topic?hub=nervos-ckb#subjects'),
    'https://www.nervos.org/knowledge-base/topic?hub=nervos-ckb',
  )
  assert.equal(
    sharingPageUrl('/knowledge-base/articles?page=2'),
    'https://www.nervos.org/knowledge-base/articles?page=2',
  )
  assert.equal(
    sharingPageUrl('/knowledge-base/What_is_Proposer_Builder_Separation%20_in_Ethereum'),
    'https://www.nervos.org/knowledge-base/What_is_Proposer_Builder_Separation%20_in_Ethereum',
  )
  assert.equal(
    sharingPageUrl('/knowledge-base/topic?hub=Quantum%20Computing%20%26%20Blockchain%20Security'),
    'https://www.nervos.org/knowledge-base/topic?hub=Quantum%20Computing%20%26%20Blockchain%20Security',
  )
})

test('sharing images are absolute without replacing external image hosts or assets', () => {
  assert.equal(sharingImageUrl('/images/topics/Developers.png'), 'https://www.nervos.org/images/topics/Developers.png')
  assert.equal(sharingImageUrl('images/logo.png'), 'https://www.nervos.org/images/logo.png')
  assert.equal(
    sharingImageUrl('http://nervos.org/education_hub_articles/a/images/image1.png'),
    'https://www.nervos.org/education_hub_articles/a/images/image1.png',
  )
  assert.equal(
    sharingImageUrl('//images.example.com/existing-cover.png?size=large'),
    'https://images.example.com/existing-cover.png?size=large',
  )
  assert.equal(
    sharingImageUrl('https://images.example.com/existing-cover.png'),
    'https://images.example.com/existing-cover.png',
  )
})

test('legacy metadata base is identical on server, client, and preview deployments', () => {
  for (const env of [
    {},
    { NEXT_BASE_URL: 'www.nervos.org', NEXT_PUBLIC_VERCEL_ENV: 'production' },
    {
      NEXT_BASE_URL: 'https://www.nervos.org',
      VERCEL_URL: 'preview.vercel.app',
      NEXT_PUBLIC_VERCEL_URL: 'preview.vercel.app',
    },
  ]) {
    const { BASE_URL } = load('../../utils/env.ts', { './sharing-urls': urls }, { process: { env } })
    assert.equal(BASE_URL, 'https://www.nervos.org')
    assert.equal(`${BASE_URL}/images/topics/Developers.png`, 'https://www.nervos.org/images/topics/Developers.png')
  }
})

test('Page defaults share the current page and keep all visible children and classes intact', () => {
  for (const [asPath, locale, expected] of [
    ['/knowledge-base', 'en', '/knowledge-base'],
    ['/knowledge-base/start-here', 'en', '/knowledge-base/start-here'],
    ['/knowledge-base/articles?page=2', 'en', '/knowledge-base/articles?page=2'],
    ['/knowledge-base/topic?hub=nervos-ckb', 'en', '/knowledge-base/topic?hub=nervos-ckb'],
    ['/knowledge-base', 'zh', '/zh/knowledge-base'],
  ]) {
    const children = jsxRuntime.jsx('section', { children: 'Unchanged page content' })
    const { tree, tags } = renderPage(
      { asPath, locale, defaultLocale: 'en' },
      { children, className: 'existing-class', id: 'existing-id' },
    )
    assert.equal(tags['og:url'], `https://www.nervos.org${expected}`)
    assert.equal(tags['twitter:url'], tags['og:url'])
    assert.equal(tags['og:image'], 'https://www.nervos.org/images/logo.png')
    assert.equal(tags['twitter:image'], tags['og:image'])
    assert.equal(tree.props.className, 'page existing-class')
    assert.equal(tree.props.id, 'existing-id')
    assert.ok(nodes(tree).includes(children))
    assert.equal(nodes(tree).filter(node => node.type === 'Header').length, 1)
    assert.equal(nodes(tree).filter(node => node.type === 'Footer').length, 1)
    assert.equal(nodes(tree).filter(node => node.type === 'link' && node.props.rel === 'canonical').length, 0)
  }
})

test('existing article-specific URLs, copy, and cover stay authoritative', () => {
  const properties = {
    type: 'article',
    title: 'Existing article title',
    description: 'Existing summary',
    site_name: 'Nervos Network',
    url: 'https://www.nervos.org/zh/knowledge-base/Original_Article',
    image: { url: '/education_hub_articles/Original_Article/images/image1.png', alt: 'Existing cover description' },
    twitter: { card: 'summary_large_image', site: '@NervosNetwork' },
  }
  const { tags } = renderPage(
    { asPath: '/knowledge-base/Original_Article?utm_source=example', locale: 'zh', defaultLocale: 'en' },
    { openGraph: properties },
  )
  assert.equal(tags['og:url'], properties.url)
  assert.equal(tags['og:title'], properties.title)
  assert.equal(tags['og:description'], properties.description)
  assert.equal(tags['og:image'], `https://www.nervos.org${properties.image.url}`)
  assert.equal(tags['og:image:alt'], properties.image.alt)
})

test('legacy callback metadata retains its existing cover and resolves /en correctly', () => {
  const { tags } = renderPage(
    { asPath: '/developers', locale: 'en', defaultLocale: 'en' },
    {
      openGraph: defaults => ({
        ...defaults,
        url: 'https://www.nervos.org/en/developers',
        image: { url: '/images/topics/Developers.png' },
      }),
    },
  )
  assert.equal(tags['og:url'], 'https://www.nervos.org/developers')
  assert.equal(tags['og:image'], 'https://www.nervos.org/images/topics/Developers.png')
})
