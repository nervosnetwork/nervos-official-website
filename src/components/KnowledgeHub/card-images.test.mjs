import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DOMParser } from '@xmldom/xmldom'
import ts from 'typescript'
import kbHubs from '../../../scripts/fixtures/load-kb-hubs.mjs'

const require = createRequire(import.meta.url)
const styles = new Proxy({}, { get: (_, key) => key })
const element = React.createElement
const image = require('next/image')

const common = {
  react: React,
  clsx: { default: (...values) => values.filter(Boolean).join(' ') },
  'next/image': image,
  'next/link': { default: 'a' },
  './Icon': { Icon: () => null },
  './ArticleLanguageLink': { ArticleLanguageLink: ({ article: _article, ...props }) => element('a', props) },
  './analytics': { trackKBEvent: () => undefined },
  '../../utils/kb-hubs': kbHubs,
}

function evaluate(file, imports = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    require: name => {
      if (name === 'react/jsx-runtime') return require(name)
      if (name.endsWith('.module.scss')) return { default: styles }
      const dependencies = { ...common, ...imports }
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected image-rendering dependency: ${name}`)
      return dependencies[name]
    },
  })
  return exports
}

const content = evaluate('content.ts')
const components = evaluate('Components.tsx', { './content': content })
const article = {
  id: 'local-article',
  language: 'en',
  canonicalPath: '/knowledge-base/local-article',
  title: 'Existing article title',
  subtitle: 'Existing summary',
  coverImage: '/education_hub_articles/local-article/images/image1.png',
  date: '2026-01-01',
  authors: ['Nervos'],
  readingMinutes: 5,
}
const parse = html => new DOMParser().parseFromString(html, 'text/html')
const nodes = (document, tag) => Array.from(document.getElementsByTagName(tag))
const attr = (node, name) => Array.from(node.attributes).find(item => item.name.toLowerCase() === name)?.value
const renderCard = props =>
  parse(renderToStaticMarkup(element(components.ArticleCard, { article, title: article.title, ...props })))
const cover = document =>
  nodes(document, 'div').find(node => ['cover', 'horizontalCover', 'coverPlaceholder'].includes(attr(node, 'class')))

function displayedSize(sizes, width) {
  for (const entry of sizes.split(',').map(value => value.trim())) {
    const condition = entry.match(/^\(max-width: ([\d.]+)px\)\s+(.*)$/)
    if (condition && width > Number(condition[1])) continue
    const value = condition?.[2] ?? entry
    const pixels = value.match(/^([\d.]+)px$/)
    if (pixels) return Number(pixels[1])
    const calculation = value.match(/^calc\(([\d.]+)vw - ([\d.]+)px\)$/)
    assert.ok(calculation, `Supported sizes expression: ${value}`)
    return (Number(calculation[1]) * width) / 100 - Number(calculation[2])
  }
  assert.fail(`No sizes branch for viewport ${width}`)
}

test('local PNG/JPEG covers use responsive lazy fill images while retaining original card wrappers and text', () => {
  for (const horizontal of [false, true]) {
    const document = renderCard({ horizontal, tag: 'Existing tag' })
    const wrapper = cover(document)
    const images = nodes(document, 'img')
    assert.equal(images.length, 1)
    assert.equal(wrapper.nodeName, 'div')
    assert.equal(attr(wrapper, 'class'), horizontal ? 'horizontalCover' : 'cover')
    assert.equal(attr(wrapper, 'style'), 'position:relative')
    assert.equal(attr(images[0], 'data-nimg'), 'fill')
    assert.equal(attr(images[0], 'loading'), 'lazy')
    assert.equal(attr(images[0], 'alt'), '')
    assert.match(attr(images[0], 'style'), /object-fit:cover;object-position:center/)
    assert.ok(attr(images[0], 'src').startsWith('/_next/image?url='))
    assert.ok(attr(images[0], 'srcset').split(', ').length > 1)
    assert.ok(nodes(document, 'h3').some(node => node.textContent === article.title))
    assert.equal(nodes(document, 'a')[0].getAttribute('href'), article.canonicalPath)
    if (horizontal) assert.equal(attr(wrapper, 'aria-label'), 'Article cover')
    else {
      const tag = nodes(document, 'span').find(node => attr(node, 'class') === 'tag')
      assert.equal(tag.textContent, 'Existing tag')
      assert.equal(tag.parentNode, wrapper.parentNode, 'The remote mobile tag layout needs a direct card child')
      assert.equal(wrapper.nextSibling, tag, 'Keep the tag after the cover, not inside the image wrapper')
      assert.equal(tag.nextSibling.nodeName, 'h3')
      assert.equal(nodes(wrapper, 'span').length, 0)
    }
  }
})

test('grid image sizes follow every existing density and mobile/tablet breakpoint including card borders', () => {
  for (const [size, desktopColumns] of [
    ['small', 5],
    ['medium', 4],
    ['large', 3],
  ]) {
    const sizes = attr(nodes(renderCard({ size }), 'img')[0], 'sizes')
    for (const width of [375, 540, 541, 750, 751, 950, 1024, 1025, 1264, 1600]) {
      const container = Math.min(1200, width - (width <= 750 ? 40 : 64))
      const columns = width <= 540 ? 1 : width <= 1024 ? 2 : desktopColumns
      const expected = (container - 16 * (columns - 1)) / columns - 2
      assert.ok(Math.abs(displayedSize(sizes, width) - expected) < 0.001, `${size}, ${width}px`)
    }
  }
})

test('horizontal cards retain compact default sizes and allow the article-page mobile full-width override', () => {
  const regular = attr(nodes(renderCard({ horizontal: true }), 'img')[0], 'sizes')
  assert.equal(displayedSize(regular, 750), 88)
  assert.equal(displayedSize(regular, 751), 200)
  const imageSizes = '(max-width: 600px) calc(100vw - 40px), (max-width: 900px) 160px, 200px'
  const overridden = attr(nodes(renderCard({ horizontal: true, imageSizes }), 'img')[0], 'sizes')
  assert.equal(overridden, imageSizes)
  assert.equal(displayedSize(overridden, 390), 350)
  assert.equal(displayedSize(overridden, 700), 160)
  assert.equal(displayedSize(overridden, 1100), 200)
})

test('hidden D-21 cards stay nonfocusable and their optimized images are never eager or preloaded', () => {
  const document = renderCard({ hidden: true })
  const anchor = nodes(document, 'a')[0]
  assert.equal(attr(anchor, 'hidden'), '')
  assert.equal(attr(anchor, 'style'), 'display:none')
  assert.equal(attr(anchor, 'tabindex'), '-1')
  const images = nodes(document, 'img')
  assert.equal(images.length, 1)
  assert.ok(images.every(node => attr(node, 'loading') === 'lazy' && attr(node, 'fetchpriority') !== 'high'))
  assert.equal(nodes(document, 'link').filter(node => attr(node, 'rel') === 'preload').length, 0)
})

test('external, animated/unsupported and unsafe image URLs keep their existing raw background fallback', () => {
  for (const src of [
    'https://example.com/cover.png',
    '//example.com/cover.jpg',
    '/images/knowledge-hub/cover.png',
    '/education_hub_articles/local-article/images/animation.gif',
    '/education_hub_articles/local-article/images/animation.apng',
    '/education_hub_articles/local-article/images/animation.webp',
    '/education_hub_articles/local-article/images/cover.svg',
    '/education_hub_articles/local-article/images/cover.avif',
    '/education_hub_articles/../cover.png',
    '/education_hub_articles/local-article/%2e%2e/cover.jpg',
    '/education_hub_articles/local-article/images%2fcover.jpg',
    '/education_hub_articles/local-article/images/cover.png?download=1',
    '/education_hub_articles/local-article/images/%invalid.png',
  ]) {
    const document = renderCard({ article: { ...article, coverImage: src } })
    assert.equal(nodes(document, 'img').length, 0, src)
    assert.equal(
      attr(cover(document), 'style'),
      `background-image:url(${JSON.stringify(src)});background-size:cover;background-position:center`,
      src,
    )
  }
  for (const src of [null, undefined, '']) {
    const document = renderCard({ article: { ...article, coverImage: src } })
    assert.equal(nodes(document, 'img').length, 0)
    assert.equal(attr(cover(document), 'style'), undefined)
    assert.equal(cover(document).textContent, 'No cover image')
  }
})

test('safe local JPEG and encoded-space filenames also use the optimizer without changing their source identity', () => {
  for (const src of [
    '/education_hub_articles/local-article/images/cover.jpg',
    '/education_hub_articles/local-article/images/cover.JPEG',
    '/education_hub_articles/local-article/images/cover%20photo.png',
  ]) {
    const document = renderCard({ article: { ...article, coverImage: src } })
    const rendered = nodes(document, 'img')[0]
    assert.ok(rendered, src)
    assert.equal(new URL(attr(rendered, 'src'), 'http://localhost').searchParams.get('url'), src)
  }
})

test('Most read reuses the same cover renderer with its original borderless 4/2/1-column geometry', () => {
  const { KnowledgeHubHome } = evaluate('Home.tsx', {
    './Components': components,
    './content': content,
    './fixtures': { hubs: [] },
    '@headlessui/react': {},
    'next/head': { default: () => null },
    'next/router': { useRouter: () => ({ locale: 'en' }) },
    '../Page': { Page: ({ children }) => element('main', null, children({ renderHeader: () => null })) },
    './KnowledgeFooter': { KnowledgeFooter: () => null },
    './GuideLife': { GuideLife: () => null },
    './NeuronIcon': { NeuronIcon: () => null },
    './search-analytics': { trackKBSearch: () => undefined },
    './useNewsletterSignup': { useNewsletterSignup: () => ({}) },
  })
  const document = parse(
    renderToStaticMarkup(
      element(KnowledgeHubHome, {
        catalog: { articles: [], hubs: [], subjects: [], featured: [] },
        counts: {},
        mostRead: { articles: [article], startDate: '2026-01-01', endDate: '2026-10-23' },
      }),
    ),
  )
  const wrapper = cover(document)
  const rendered = nodes(wrapper, 'img')[0]
  assert.equal(attr(wrapper, 'class'), 'coverPlaceholder')
  assert.equal(attr(wrapper, 'aria-label'), 'Article cover')
  assert.equal(attr(rendered, 'loading'), 'lazy')
  assert.equal(wrapper.parentNode.nodeName, 'a')
  assert.equal(attr(wrapper.parentNode, 'class'), 'popularCard')
  assert.ok(wrapper.parentNode.textContent.includes(article.title))
  for (const width of [375, 540, 541, 750, 751, 950, 951, 1264, 1600]) {
    const container = Math.min(1200, width - (width <= 750 ? 40 : 64))
    const columns = width <= 540 ? 1 : width <= 950 ? 2 : 4
    assert.ok(
      Math.abs(displayedSize(attr(rendered, 'sizes'), width) - (container - 16 * (columns - 1)) / columns) < 0.001,
    )
  }
})
