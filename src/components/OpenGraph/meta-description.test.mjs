import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DOMParser } from '@xmldom/xmldom'
import ts from 'typescript'
import kbHubs from '../../../scripts/fixtures/load-kb-hubs.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(import.meta.url)
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const element = React.createElement
const styles = new Proxy({}, { get: (_, key) => (key === '__esModule' ? false : String(key)) })
const clsx = (...values) => values.filter(Boolean).join(' ')
const Head = ({ children }) => element(React.Fragment, null, children)

function load(file, imports = {}, runtimeIntl = Intl, source = read(file)) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  })
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'Intl', outputText)(
    name => {
      if (name === 'react/jsx-runtime') return require(name)
      assert.ok(Object.hasOwn(imports, name), `Unexpected import in ${file}: ${name}`)
      return imports[name]
    },
    loaded,
    loaded.exports,
    runtimeIntl,
  )
  return loaded.exports
}

const descriptionModule = load('src/utils/meta-description.ts')
const { metaDescription } = descriptionModule
const sharing = load('src/utils/sharing-urls.ts')
const { OpenGraph } = load('src/components/OpenGraph/index.tsx', {
  'next/head': Head,
  '../../utils': {
    pick: (value, ...keys) => Object.fromEntries(keys.filter(key => key in value).map(key => [key, value[key]])),
  },
  '../../utils/sharing-urls': sharing,
  '../../utils/meta-description': descriptionModule,
})

const properties = {
  type: 'article',
  title: 'Existing article title',
  description: 'Existing description',
  url: 'https://preview.example/zh/knowledge-base/existing_article?source=sharing#section-1',
  site_name: 'Nervos Network',
  locale: 'zh',
  author: 'Existing author',
  section: 'Existing category',
  published_time: '2020-01-01T00:00:00Z',
  modified_time: '2021-01-01T00:00:00Z',
  image: { url: '/existing-cover.png', alt: 'Existing cover', width: '1200', height: '630', type: 'image/png' },
  twitter: {
    card: 'summary_large_image',
    site: '@NervosNetwork',
    creator: '@ExistingAuthor',
    domain: 'www.nervos.org',
  },
}
const descriptionKeys = new Set(['description', 'og:description', 'twitter:description'])
function documentFor(html) {
  return new DOMParser().parseFromString(`<html><head>${html}</head></html>`, 'text/html')
}
function metadata(html) {
  return Array.from(documentFor(html).getElementsByTagName('meta'), tag => ({
    key: tag.getAttribute('name') || tag.getAttribute('property'),
    content: tag.getAttribute('content'),
  }))
}
function renderMetadata(description) {
  return renderToStaticMarkup(element(OpenGraph, { properties: { ...properties, description } }))
}
function assertDescriptions(html, expected) {
  const descriptions = metadata(html).filter(tag => descriptionKeys.has(tag.key))
  assert.equal(descriptions.length, 3, 'Exactly one ordinary, Open Graph and Twitter description must be emitted')
  for (const key of descriptionKeys) {
    assert.deepEqual(
      descriptions.filter(tag => tag.key === key),
      [{ key, content: expected }],
    )
  }
  assert.ok([...expected].length <= 155)
}

test('description normalization preserves supplied short copy and makes missing copy explicitly empty', () => {
  for (const input of [undefined, null, '', ' \t\n\r\u00a0 ']) assert.equal(metaDescription(input), '')
  assert.equal(
    metaDescription('  Existing\n\t description\u00a0 with  spacing.  '),
    'Existing description with spacing.',
  )
  for (const input of [
    'Short supplied copy.',
    '区块链安全与共识。',
    'Seguridad, criptografía y consenso.',
    '😀 CKB 安全',
  ]) {
    assert.equal(metaDescription(input), input)
  }
})

test('155 codepoints are retained and longer English descriptions stop at complete word boundaries', () => {
  const exact = `${'a'.repeat(150)} word`
  assert.equal([...exact].length, 155)
  assert.equal(metaDescription(exact), exact)
  assert.equal(metaDescription(`${exact} next`), exact)
  assert.equal(metaDescription(`${'alpha '.repeat(25)}beta gamma delta`), `${'alpha '.repeat(25)}beta`)
  assert.equal(metaDescription(`${'word '.repeat(31)}elephant`), 'word '.repeat(31).trim())
  assert.equal(metaDescription('a'.repeat(156)), 'a'.repeat(155), 'An oversized single word still respects the cap')
  assert.equal(metaDescription('a'.repeat(155)), 'a'.repeat(155))
})

test('multilingual text and astral emoji use Unicode codepoints without splitting an available word', () => {
  assert.equal(metaDescription('安全'.repeat(80)), '安全'.repeat(77))
  assert.equal(metaDescription('😀'.repeat(156)), '😀'.repeat(155))
  const emojiBoundary = `${'😀'.repeat(150)} word`
  assert.equal([...emojiBoundary].length, 155)
  assert.equal(metaDescription(`${emojiBoundary} next`), emojiBoundary)
  const spanish = 'La seguridad de las redes distribuidas depende del consenso y de la criptografía. '.repeat(3)
  const normalized = spanish.trim()
  const result = metaDescription(spanish)
  assert.ok(result.length > 100 && [...result].length <= 155)
  assert.ok(normalized.startsWith(result))
  assert.match(normalized.slice(result.length), /^\s/)
  assert.doesNotMatch(result, /\uFFFD|\s$/)
})

test('missing Segmenter safely normalizes short copy and preserves whole English words with a Unicode fallback', () => {
  const nativeSegmenter = Intl.Segmenter
  const { metaDescription: fallback } = load('src/utils/meta-description.ts', {}, Object.freeze({}))
  const exact = `${'a'.repeat(150)} word`
  const cases = [
    [undefined, ''],
    [null, ''],
    ['', ''],
    [' \t\n ', ''],
    ['  Short\n\t supplied\u00a0 copy. ', 'Short supplied copy.'],
    ['短描述 😀', '短描述 😀'],
    [exact, exact],
    [`${exact} next`, exact],
    [`${'alpha '.repeat(25)}beta gamma delta`, `${'alpha '.repeat(25)}beta`],
    [`${'word '.repeat(31)}elephant`, 'word '.repeat(31).trim()],
    ['a'.repeat(156), 'a'.repeat(155)],
    ['😀'.repeat(156), '😀'.repeat(155)],
    [`${'😀'.repeat(150)} word next`, `${'😀'.repeat(150)} word`],
    ['安全'.repeat(80), `${'安全'.repeat(77)}安`],
  ]
  for (const [input, expected] of cases) {
    let result
    assert.doesNotThrow(() => {
      result = fallback(input)
    })
    assert.equal(result, expected)
    assert.ok([...result].length <= 155)
    assert.doesNotMatch(result, /\uFFFD|\s$/)
    assert.ok(
      Array.from(result).every(character => !/^[\uD800-\uDFFF]$/.test(character)),
      'No unpaired surrogate',
    )
  }
  assert.equal(Intl.Segmenter, nativeSegmenter, 'Fallback tests must not change the global Intl object')
})

test('actual OpenGraph renders all three descriptions without Segmenter for long English, Chinese and emoji copy', () => {
  const fallbackModule = load('src/utils/meta-description.ts', {}, Object.freeze({}))
  const { OpenGraph: FallbackOpenGraph } = load('src/components/OpenGraph/index.tsx', {
    'next/head': Head,
    '../../utils': {
      pick: (value, ...keys) => Object.fromEntries(keys.filter(key => key in value).map(key => [key, value[key]])),
    },
    '../../utils/sharing-urls': sharing,
    '../../utils/meta-description': fallbackModule,
  })
  for (const [description, expected] of [
    [`${'word '.repeat(31)}elephant`, 'word '.repeat(31).trim()],
    ['a'.repeat(156), 'a'.repeat(155)],
    ['安全'.repeat(80), `${'安全'.repeat(77)}安`],
    ['😀'.repeat(156), '😀'.repeat(155)],
  ]) {
    let html
    assert.doesNotThrow(() => {
      html = renderToStaticMarkup(element(FallbackOpenGraph, { properties: { ...properties, description } }))
    })
    assertDescriptions(html, expected)
  }
})

test('actual OpenGraph emits the same normalized description in all three tags for every input class', () => {
  const cases = [
    ['  Short\n\t copy.  ', 'Short copy.'],
    ['', ''],
    [' \t\n ', ''],
    [undefined, ''],
    [null, ''],
    [`${'alpha '.repeat(25)}beta gamma delta`, `${'alpha '.repeat(25)}beta`],
    ['a'.repeat(156), 'a'.repeat(155)],
    ['安全'.repeat(80), '安全'.repeat(77)],
    ['😀'.repeat(156), '😀'.repeat(155)],
  ]
  for (const [input, expected] of cases) assertDescriptions(renderMetadata(input), expected)
})

test('changing the description leaves every other sharing field unchanged', () => {
  const other = html => metadata(html).filter(tag => !descriptionKeys.has(tag.key))
  const baseline = other(renderMetadata('Existing description'))
  assert.ok(baseline.length > 15)
  for (const input of ['', 'Changed SEO description', 'word '.repeat(100), '安全'.repeat(80)]) {
    assert.deepEqual(other(renderMetadata(input)), baseline)
  }
  const values = Object.fromEntries(baseline.map(tag => [tag.key, tag.content]))
  assert.equal(values['og:title'], properties.title)
  assert.equal(values['twitter:title'], properties.title)
  assert.equal(values['og:type'], properties.type)
  assert.equal(values['og:locale'], properties.locale)
  assert.equal(values['article:author'], properties.author)
  assert.equal(values['article:published_time'], properties.published_time)
  assert.equal(values['article:modified_time'], properties.modified_time)
  assert.equal(values['og:url'], 'https://www.nervos.org/zh/knowledge-base/existing_article?source=sharing')
  assert.equal(values['twitter:url'], values['og:url'])
  assert.equal(values['og:image'], 'https://www.nervos.org/existing-cover.png')
  assert.equal(values['twitter:image'], values['og:image'])
  assert.equal(values['og:image:alt'], properties.image.alt)
})

test('description text is escaped as metadata while its supplied characters survive parsing', () => {
  const input = 'A "quote" & <script>alert(1)</script> — CKB\'s 😀 description.'
  const html = renderMetadata(input)
  assertDescriptions(html, input)
  assert.match(html, /&quot;quote&quot;/)
  assert.match(html, /&amp;/)
  assert.match(html, /&lt;script&gt;/)
  assert.equal(documentFor(html).getElementsByTagName('script').length, 0)
})

function loadPreviewPage() {
  const Page = ({ openGraph, children }) =>
    element(
      React.Fragment,
      null,
      element(OpenGraph, { properties: openGraph }),
      typeof children === 'function' ? children({ renderHeader: () => null, renderFooter: () => null }) : children,
    )
  return load('src/components/KnowledgeHub/Shared.tsx', {
    clsx,
    react: React,
    'next/head': Head,
    'next/link': 'a',
    '../Page': { Page },
    './Home': { Icon: () => null, Newsletter: () => null },
    './index.module.scss': styles,
    './pages.module.scss': styles,
    './home-v2.module.scss': styles,
    './pages-v2.module.scss': styles,
    './KnowledgeFooter': { KnowledgeFooter: () => null },
    './article-v2.module.scss': styles,
    './Components': { ArrowButton: () => null },
    './GuideLife': { GuideLife: () => null },
    './analytics': { trackKBEvent: () => undefined },
    '../../utils/kb-hubs': kbHubs,
  }).PreviewPage
}

test('PreviewPage retains its description, title and robots policy while shared PageSEO owns the only canonical', () => {
  const PreviewPage = loadPreviewPage()
  const { PageSEO } = load('src/components/PageSEO/index.tsx', {
    'next/head': Head,
    'next/router': {},
    react: React,
  })
  for (const [preview, noindex, robots] of [
    [false, false, null],
    [false, true, 'noindex, follow'],
    [true, false, 'noindex, nofollow'],
  ]) {
    const html = renderToStaticMarkup(
      element(
        React.Fragment,
        null,
        element(PageSEO, {
          seo: {
            canonical: 'https://www.nervos.org/zh/knowledge-base/existing_article',
            language: 'zh',
            alternates: [],
          },
        }),
        element(
          PreviewPage,
          {
            title: properties.title,
            canonicalPath: '/zh/knowledge-base/existing_article',
            preview,
            noindex,
            newsletter: false,
            description: 'Obsolete duplicate description must not render',
            openGraph: { ...properties, description: '  One\n description  ' },
          },
          element('p', null, 'Existing body'),
        ),
      ),
    )
    assertDescriptions(html, 'One description')
    const doc = documentFor(html)
    assert.equal(
      doc.getElementsByTagName('title')[0].textContent,
      preview ? `${properties.title} — Knowledge Base preview` : properties.title,
    )
    const canonical = Array.from(doc.getElementsByTagName('link')).filter(
      tag => tag.getAttribute('rel') === 'canonical',
    )
    assert.equal(canonical.length, 1)
    assert.equal(canonical[0].getAttribute('href'), 'https://www.nervos.org/zh/knowledge-base/existing_article')
    assert.deepEqual(
      metadata(html).filter(tag => tag.key === 'robots'),
      robots ? [{ key: 'robots', content: robots }] : [],
    )
    assert.match(html, /<p>Existing body<\/p>/)
  }
})

function loadArticle(capture) {
  return load('src/components/KnowledgeHub/ContentArticle.tsx', {
    clsx,
    react: React,
    'next/image': ({ unoptimized: _unoptimized, ...props }) => element('img', props),
    'next/link': 'a',
    'next/router': { useRouter: () => ({}) },
    'react-markdown': ({ children, className }) => element('div', { className }, children),
    'remark-gfm': () => undefined,
    'rehype-raw': () => undefined,
    'rehype-sanitize': { __esModule: true, default: () => undefined, defaultSchema: { attributes: {} } },
    './Home': { Icon: ({ name }) => element('span', { 'data-icon': name }), PreviewNotice: () => null },
    './Shared': {
      PreviewPage: props => {
        capture(props)
        return element('main', null, props.children)
      },
      DiscoverBanner: () => element('aside', null, 'Existing discovery banner'),
      useActiveSection: () => '',
    },
    './Components': { ArticleCard: ({ title }) => element('p', null, title) },
    './ArticleLanguageSwitch': { ArticleLanguageSwitch: () => null },
    './ArticleLanguageLink': {
      ArticleLanguageLink: ({ article: _article, ...props }) => element('a', props),
      ArticleContentLink: ({ languagesByArticle: _languages, currentLanguage: _language, ...props }) =>
        element('a', props),
    },
    './content': { articlePath: article => article.canonicalPath, formatArticleDate: () => 'Existing date' },
    './article-v2.module.scss': styles,
    './pages-v2.module.scss': styles,
    './markdown-headings': { headingPlugin: () => undefined },
    './article-features': { articleSocialActionsEnabled: false },
    './analytics': { trackKBEvent: () => undefined },
    '../../utils/kb-hubs': kbHubs,
  }).ContentArticle
}

test('article description overrides metadata only; title, visible subtitle, body and all visible markup stay unchanged', () => {
  let captured
  const ContentArticle = loadArticle(props => {
    captured = props
  })
  const article = {
    id: 'existing_article',
    title: 'Existing visible title',
    subtitle: 'Existing visible subtitle',
    canonicalPath: '/knowledge-base/existing_article',
    authors: ['Existing author'],
    date: null,
    readingMinutes: 5,
    language: 'en',
    coverImage: '/existing-cover.png',
  }
  const props = {
    markdown: '## Existing body heading\n\nExisting body content & punctuation.',
    related: [],
    recent: [],
    subjects: [],
    headings: [{ id: 'section-1', label: 'Existing body heading' }],
    hub: null,
    preview: false,
  }
  const render = description =>
    renderToStaticMarkup(element(ContentArticle, { ...props, article: { ...article, description } }))
  const baseline = render(undefined)
  assert.match(baseline, /<h1>Existing visible title<\/h1>/)
  assert.match(baseline, /<p class="subhead">Existing visible subtitle<\/p>/)
  assert.ok(baseline.includes('Existing body content &amp; punctuation.'))
  for (const description of [
    undefined,
    null,
    '',
    ' \t\n ',
    'SEO-only copy',
    '  SEO-only\n copy  ',
    'word '.repeat(80),
    '安全'.repeat(80),
  ]) {
    assert.equal(render(description), baseline, 'SEO field changes must not change any visible markup')
    assert.equal(captured.title, article.title)
    assert.equal(captured.canonicalPath, article.canonicalPath)
    assert.equal(captured.openGraph.description, description?.trim() || article.subtitle)
    assertDescriptions(
      renderToStaticMarkup(element(OpenGraph, { properties: captured.openGraph })),
      metaDescription(description?.trim() || article.subtitle),
    )
  }
  renderToStaticMarkup(element(ContentArticle, { ...props, article: { ...article, subtitle: '', description: '  ' } }))
  assertDescriptions(renderToStaticMarkup(element(OpenGraph, { properties: captured.openGraph })), '')
})

test('Foundation emits localized plain-text descriptions while its visible markup remains unchanged from HEAD', () => {
  const file = 'src/pages/foundation/index.page.tsx'
  const previousSource = execFileSync('git', ['show', `HEAD:${file}`], { cwd: root, encoding: 'utf8' })
  const icons = new Proxy(
    {},
    {
      get: (_, name) =>
        String(name).startsWith('Img')
          ? { src: `/existing-foundation/${String(name)}.png` }
          : props => element('svg', { ...props, 'data-icon': String(name) }),
    },
  )
  for (const language of ['en', 'zh', 'es']) {
    const translated = JSON.parse(read(`public/locales/${language}/foundation.json`))
    const common = JSON.parse(read(`public/locales/${language}/common.json`))
    const translate = (data, key) => key.split('.').reduce((value, part) => value?.[part], data) ?? key
    for (const safari of [false, true]) {
      const imports = {
        react: React,
        'next/link': 'a',
        clsx,
        'next/head': Head,
        'react-device-detect': { isSafari: safari, isIOS: false },
        'next-i18next': {
          useTranslation: namespace => [
            key => translate(namespace === 'common' ? common.category : translated, key),
            { language },
          ],
          Trans: ({ t, i18nKey, components }) =>
            element(
              React.Fragment,
              null,
              ...t(i18nKey)
                .split(/(<tag[12]>[\s\S]*?<\/tag[12]>)/g)
                .map((text, key) => {
                  const match = /^<(tag[12])>([\s\S]*)<\/\1>$/.exec(text)
                  return match ? React.cloneElement(components[match[1]], { key }, match[2]) : text
                }),
            ),
        },
        'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
        '../../server/page-seo': { withStaticPageSEO: (_route, load) => load },
        'src/components/Header': {
          LanguagePopover: () => element('nav', { 'aria-label': 'Existing language choices' }),
        },
        '../../components/OpenGraph': { OpenGraph },
        '../../utils/sharing-urls': sharing,
        './FoundationFooter': { Footer: props => element('footer', props, 'Existing Foundation footer') },
        './icons': icons,
        './index.module.scss': styles,
      }
      const Foundation = load(file, imports).default
      const html = renderToStaticMarkup(element(Foundation))
      const plainDescription = translated.slogan.replace(/<\/?tag[12]>/g, '')
      assertDescriptions(html, metaDescription(plainDescription))
      const values = Object.fromEntries(metadata(html).map(tag => [tag.key, tag.content]))
      assert.doesNotMatch(values.description, /<[^>]*>/)
      assert.ok(plainDescription.startsWith(values.description))
      assert.equal(values['og:title'], 'Nervos Network | Foundation')
      assert.equal(values['twitter:title'], values['og:title'])
      assert.equal(values['og:type'], 'website')
      assert.equal(values['og:site_name'], 'Nervos Network')
      assert.equal(values['og:url'], `https://www.nervos.org${language === 'en' ? '' : `/${language}`}/foundation`)
      assert.equal(values['twitter:url'], values['og:url'])
      assert.equal(values['og:image'], undefined)
      assert.equal(values['twitter:image'], undefined)

      const visibleImports = {
        ...imports,
        'next/head': () => null,
        '../../components/OpenGraph': { OpenGraph: () => null },
      }
      const CurrentVisible = load(file, visibleImports).default
      const PreviousVisible = load(file, visibleImports, Intl, previousSource).default
      const visible = renderToStaticMarkup(element(CurrentVisible))
      assert.equal(visible, renderToStaticMarkup(element(PreviousVisible)), `${language}, Safari=${safari}`)
      assert.ok(visible.includes(`<h1 class="foundationTitle">${translated.foundation}</h1>`))
      assert.match(visible, /<strong class="emphasis">/)
    }
  }
})
