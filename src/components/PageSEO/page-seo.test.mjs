import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DOMParser } from '@xmldom/xmldom'
import ts from 'typescript'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(import.meta.url)
const element = React.createElement
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const Head = ({ children }) => element(React.Fragment, null, children)

function load(file, imports, document, source = read(file)) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'document', outputText)(
    name => {
      if (name === 'react/jsx-runtime') return require(name)
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency in ${file}: ${name}`)
      return imports[name]
    },
    loaded,
    loaded.exports,
    document,
  )
  return loaded.exports
}

function links(html) {
  const document = new DOMParser().parseFromString(`<html><head>${html}</head></html>`, 'text/html')
  return Array.from(document.getElementsByTagName('link'), link => ({
    rel: link.getAttribute('rel'),
    href: link.getAttribute('href'),
    language: link.getAttribute('hrefLang'),
  }))
}

const seo = {
  canonical: 'https://www.nervos.org/zh/knowledge-base/existing_article',
  language: 'zh',
  alternates: [
    { language: 'en', url: 'https://www.nervos.org/knowledge-base/existing_article' },
    { language: 'zh', url: 'https://www.nervos.org/zh/knowledge-base/existing_article' },
    { language: 'x-default', url: 'https://www.nervos.org/knowledge-base/existing_article' },
  ],
}

test('shared PageSEO emits one canonical and exactly the server-supplied alternates, with stable language keys', () => {
  const { PageSEO } = load('src/components/PageSEO/index.tsx', {
    'next/head': Head,
    'next/router': {},
    react: { ...React, useEffect: () => undefined },
  })
  const tree = PageSEO({ seo })
  const html = renderToStaticMarkup(tree)
  assert.deepEqual(links(html), [
    { rel: 'canonical', href: seo.canonical, language: '' },
    ...seo.alternates.map(alternate => ({ rel: 'alternate', href: alternate.url, language: alternate.language })),
  ])
  const [canonical, alternates] = tree.props.children
  assert.equal(canonical.key, 'canonical')
  assert.deepEqual(
    alternates.map(link => link.key),
    ['alternate-en', 'alternate-zh', 'alternate-x-default'],
  )
  assert.equal(
    links(html).some(link => link.language === 'es'),
    false,
    'No language is invented by the renderer',
  )
  assert.deepEqual(
    links(renderToStaticMarkup(PageSEO({ seo: { ...seo, alternates: [] } }))),
    [{ rel: 'canonical', href: seo.canonical, language: '' }],
    'A page without real translations emits no alternate links',
  )
  assert.equal(PageSEO({}), null, 'Unclassified pages do not invent canonical or alternate targets')
})

test('client navigation sets the actual content language, including returning to English and unclassified pages', () => {
  const document = { documentElement: { lang: 'fr' } }
  const events = new EventEmitter()
  let pendingEffect
  let dependencies
  const { PageSEO } = load(
    'src/components/PageSEO/index.tsx',
    {
      'next/head': Head,
      'next/router': { events },
      react: {
        ...React,
        useEffect: (effect, deps) => {
          pendingEffect = effect
          dependencies = deps
        },
      },
    },
    document,
  )
  for (const [props, expected] of [
    [{ seo, fallbackLanguage: 'es' }, 'zh'],
    [{ seo: { ...seo, language: 'en', alternates: [] }, fallbackLanguage: 'zh' }, 'en'],
    [{ fallbackLanguage: 'es' }, 'es'],
    [{}, 'en'],
  ]) {
    PageSEO(props)
    assert.deepEqual(dependencies, [expected, props.fallbackLanguage ?? 'en', props.navigationKey])
    assert.equal(typeof pendingEffect, 'function')
    const cleanup = pendingEffect()
    assert.equal(document.documentElement.lang, expected)
    cleanup()
    assert.equal(events.listenerCount('routeChangeComplete'), 0)
  }
})

test('unchanged content language is reapplied across locale and path changes despite Next router lang resets', () => {
  for (const eventBeforeEffects of [true, false]) {
    const document = { documentElement: { lang: 'en' } }
    const events = new EventEmitter()
    let previousDependencies
    let pendingEffect
    let cleanup
    let effectCount = 0
    const { PageSEO } = load(
      'src/components/PageSEO/index.tsx',
      {
        'next/head': Head,
        'next/router': { events },
        react: {
          ...React,
          useEffect: (effect, dependencies) => {
            if (!previousDependencies || dependencies.some((value, index) => value !== previousDependencies[index])) {
              pendingEffect = effect
            }
            previousDependencies = dependencies
          },
        },
      },
      document,
    )
    const flush = () => {
      if (!pendingEffect) return
      cleanup?.()
      cleanup = pendingEffect()
      pendingEffect = undefined
      effectCount += 1
    }
    const navigations = [
      { language: 'en', locale: 'en', path: '/' },
      { language: 'en', locale: 'ko', path: '/' },
      { language: 'en', locale: 'ko', path: '/knowledge-base' },
      { language: 'zh', locale: 'zh', path: '/knowledge-base/real_article' },
      { language: 'en', locale: 'zh', path: '/knowledge-base/start-here' },
      { language: 'en', locale: 'zh', path: '/knowledge-base/start-here?source=link' },
    ]
    for (const [index, { language, locale, path }] of navigations.entries()) {
      PageSEO({ seo: { ...seo, language }, fallbackLanguage: locale, navigationKey: path })
      if (!eventBeforeEffects) flush()
      // Next 14 changes lang to URL locale after rendering, before routeChangeComplete.
      document.documentElement.lang = locale
      events.emit('routeChangeComplete', path)
      if (eventBeforeEffects) flush()
      assert.equal(document.documentElement.lang, language, `${path}, locale=${locale}`)
      assert.equal(effectCount, index + 1, 'Both locale-only and path-only changes rerun the effect')
      assert.equal(events.listenerCount('routeChangeComplete'), 1, 'Only the current language listener remains')
    }
    // Even a repeated navigation with unchanged React dependencies must repair Next's lang reset.
    document.documentElement.lang = 'zh'
    events.emit('routeChangeComplete', navigations.at(-1).path)
    assert.equal(document.documentElement.lang, 'en')
    cleanup()
    assert.equal(events.listenerCount('routeChangeComplete'), 0)
  }
})

test('the custom Document uses server content language and preserves the standard Head/Main/NextScript shell', () => {
  class DocumentBase extends React.Component {
    static getInitialProps = () => 'inherited framework loader'
  }
  const Html = ({ children, ...props }) => element('html', props, children)
  const DocumentHead = () => element('head')
  const Main = () => element('div', { id: '__next' })
  const NextScript = () => element('script', { id: '__NEXT_DATA__' })
  const { default: SiteDocument } = load('src/pages/_document.page.tsx', {
    'next/document': { __esModule: true, default: DocumentBase, Html, Head: DocumentHead, Main, NextScript },
  })
  assert.equal(SiteDocument.getInitialProps, DocumentBase.getInitialProps)
  assert.equal(Object.hasOwn(SiteDocument, 'getInitialProps'), false, 'Retain the default document data lifecycle')
  for (const [pageProps, locale, language] of [
    [{ pageSEO: seo }, 'en', 'zh'],
    [{ pageSEO: { ...seo, language: 'en' } }, 'zh', 'en'],
    [{}, 'es', 'es'],
    [undefined, 'fr', 'fr'],
    [{}, undefined, 'en'],
  ]) {
    const tree = new SiteDocument({ __NEXT_DATA__: { props: { pageProps } }, locale }).render()
    assert.equal(tree.type, Html)
    assert.equal(tree.props.lang, language)
    const [head, body] = tree.props.children
    assert.equal(head.type, DocumentHead)
    assert.equal(body.type, 'body')
    assert.deepEqual(
      body.props.children.map(child => child.type),
      [Main, NextScript],
    )
    assert.equal(
      renderToStaticMarkup(tree),
      `<html lang="${language}"><head></head><body><div id="__next"></div><script id="__NEXT_DATA__"></script></body></html>`,
    )
  }
})

test('App passes server metadata and route locale to PageSEO without altering visible page markup', () => {
  const file = 'src/pages/_app.page.tsx'
  const previousSource = execFileSync('git', ['show', `HEAD:${file}`], { cwd: root, encoding: 'utf8' })
  const PageSEO = () => null
  const imports = {
    react: { ...React, useEffect: () => undefined },
    'next/head': () => null,
    'next/router': { useRouter: () => ({ locale: 'es', asPath: '/foundation' }) },
    'next-i18next': { appWithTranslation: component => component },
    'next/font/local': () => ({ className: 'existing-font' }),
    '../utils': { IS_PROD: false, api: { withTRPC: component => component } },
    '../components/LinkClickTracker': { LinkClickTracker: () => null },
    '../components/ScrollDepthTracker': { ScrollDepthTracker: () => null },
    '../components/PageSEO': { PageSEO },
    '../components/GoogleAnalytics': { GoogleAnalytics: () => null },
    '../utils/ga': { GA_ENABLED: false },
    'swiper/css': {},
    '../styles/globals.scss': {},
  }
  const App = load(file, imports).default
  const PreviousApp = load(file, imports, undefined, previousSource).default
  const Component = props => element('article', { className: 'existing-layout' }, props.message)
  const props = {
    Component,
    pageProps: { pageSEO: seo, message: 'Existing visible content' },
    router: { locale: 'es', asPath: '/foundation' },
  }
  const tree = App(props)
  const metadata = tree.props.children[2].props.children.find(child => child.type === PageSEO)
  assert.deepEqual(metadata.props, { seo, fallbackLanguage: 'es', navigationKey: '/foundation' })
  const visible = renderToStaticMarkup(tree)
  assert.equal(visible, renderToStaticMarkup(PreviousApp(props)))
  assert.equal(
    visible,
    '<main class="existing-font"><article class="existing-layout">Existing visible content</article></main>',
  )
  const WithStableID = () => {
    const id = React.useId()
    return element('svg', null, element('mask', { id }), element('g', { mask: `url(#${id})` }))
  }
  assert.equal(
    renderToStaticMarkup(App({ ...props, Component: WithStableID })),
    renderToStaticMarkup(PreviousApp({ ...props, Component: WithStableID })),
    'Head-only metadata must not move the existing tree or change React-generated SVG mask IDs',
  )
  assert.equal(read('src/components/KnowledgeHub/Home.tsx').includes('rel="canonical"'), false)
  assert.equal(read('src/components/KnowledgeHub/Shared.tsx').includes('rel="canonical"'), false)
})
