import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { DOMParser } from '@xmldom/xmldom'
import matter from 'gray-matter'
import ts from 'typescript'
import kbHubs from '../../../scripts/fixtures/load-kb-hubs.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(import.meta.url)
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const articleFile = 'src/components/KnowledgeHub/ContentArticle.tsx'
const styles = new Proxy({}, { get: (_, key) => key })
const element = React.createElement
function articleBodyWithoutAlts(html) {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const body = Array.from(document.getElementsByTagName('article')).find(
    node => node.getAttribute('class') === 'articleBody',
  )
  assert.ok(body, 'The complete article body must render')
  // Likes are intentionally hidden until real voting is available.
  for (const node of Array.from(body.getElementsByTagName('button'))) {
    if (node.getAttribute('class') === 'likeButton') node.parentNode.removeChild(node)
  }
  // Exclude the new B-only intro and unwrap the neutral bottom-banner tracking
  // container; continue comparing all existing content and image attributes.
  for (const node of Array.from(body.getElementsByTagName('div'))) {
    if (node.getAttribute('class') === 'mobileDiscoverBanner') node.parentNode.removeChild(node)
    if (node.getAttribute('data-discover-banner') === 'bottom') {
      while (node.firstChild) node.parentNode.insertBefore(node.firstChild, node)
      node.parentNode.removeChild(node)
    }
  }
  // The language controls live in the navigation; this image regression keeps
  // comparing the complete article body, including its title, cover and links.
  return body.toString().replace(/\salt="[^"]*"/g, '')
}
const hash = value => createHash('sha256').update(value).digest('hex')

function evaluate(source, imports = {}) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    URL,
    require: name => {
      if (name === 'react/jsx-runtime') return require(name)
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`)
      return imports[name]
    },
  })
  return exports
}

const headingModule = evaluate(read('src/components/KnowledgeHub/markdown-headings.ts'))
function loadArticle(source, socialActions = false, realImages = false) {
  return evaluate(source, {
    clsx: { default: (...values) => values.filter(Boolean).join(' ') },
    react: React,
    'next/image': realImages
      ? require('next/image')
      : { default: ({ unoptimized: _unoptimized, ...props }) => element('img', props) },
    'next/link': { default: 'a' },
    'next/router': { useRouter: () => ({}) },
    'react-markdown': { default: ReactMarkdown },
    'remark-gfm': { default: remarkGfm },
    'rehype-raw': { default: rehypeRaw },
    'rehype-sanitize': { default: rehypeSanitize, defaultSchema },
    './Home': {
      Icon: ({ name }) => element('img', { src: `/decorative/${name}.svg`, alt: '' }),
      PreviewNotice: () => null,
    },
    './Shared': {
      PreviewPage: ({ children }) => element('main', null, children),
      DiscoverBanner: () => element('img', { src: '/decorative/banner.svg', alt: '' }),
      useActiveSection: () => '',
    },
    './Components': { ArticleCard: () => null, ArrowButton: ({ children, href }) => element('a', { href }, children) },
    './ArticleLanguageSwitch': { ArticleLanguageSwitch: () => null },
    '../Header/KnowledgeHeader': { LanguageToggle: () => null },
    './article-discover-experiment': {
      ARTICLE_DISCOVER_DESKTOP_QUERY: '(min-width: 1024px)',
      ARTICLE_DISCOVER_EXPERIMENT_ID: 'article_discover_placement_v1',
      initializeArticleDiscoverExperiment: () => ({ variant: 'A', preview: false }),
    },
    './reading-progress': evaluate(read('src/components/KnowledgeHub/reading-progress.ts')),
    './ArticleLanguageLink': {
      ArticleLanguageLink: ({ article: _article, ...props }) => element('a', props),
      ArticleContentLink: ({ languagesByArticle: _languages, currentLanguage: _language, ...props }) =>
        element('a', props),
    },
    './content': { articlePath: article => article.canonicalPath, formatArticleDate: () => 'Existing date' },
    './article-v2.module.scss': { default: styles },
    './pages-v2.module.scss': { default: styles },
    './markdown-headings': headingModule,
    './article-features': { articleSocialActionsEnabled: socialActions },
    './analytics': { trackKBEvent: () => undefined },
    '../../utils/kb-hubs': kbHubs,
  }).ContentArticle
}

const ContentArticle = loadArticle(read(articleFile))
// Integration checks may explicitly select the incoming approved UI revision.
// Ordinary CI keeps the existing HEAD baseline, including in shallow checkouts.
// Compare the complete body; only alt attributes are excluded below.
const previousRevision = process.env.KB_ARTICLE_UI_BASELINE_REVISION || 'HEAD'
const PreviousArticle = loadArticle(
  execFileSync('git', ['show', `${previousRevision}:${articleFile}`], { cwd: root, encoding: 'utf8' }),
)
const defaultArticle = {
  id: 'existing_article',
  title: 'Existing article title',
  subtitle: 'Existing subtitle',
  canonicalPath: '/knowledge-base/existing_article',
  authors: ['Existing author'],
  date: null,
  readingMinutes: 5,
  language: 'en',
  coverImage: '/existing-cover.png',
}
function renderArticle(markdown, article = {}, Component = ContentArticle, imageDimensions = {}) {
  return renderToStaticMarkup(
    element(Component, {
      article: { ...defaultArticle, ...article },
      markdown,
      related: [],
      subjects: [],
      headings: [{ id: 'section-1', label: 'Existing section' }],
      hub: null,
      preview: false,
      imageDimensions,
    }),
  )
}
function images(html) {
  const document = new DOMParser().parseFromString(html, 'text/html')
  return Array.from(document.getElementsByTagName('img'), image => ({
    src: image.getAttribute('src'),
    alt: image.getAttribute('alt'),
    loading: image.getAttribute('loading'),
    className: image.getAttribute('class'),
  }))
}
const bodyImages = html => {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const markdown = Array.from(document.getElementsByTagName('div')).find(
    node => node.getAttribute('class') === 'articleMarkdown',
  )
  return markdown ? images(markdown.toString()) : []
}

const fallbackCases = [
  ['empty inline', '![](inline.png)'],
  ['whitespace inline', '![ \t ](whitespace.png)'],
  ['placeholder inline', '![alt_text](placeholder.png)'],
  ['padded mixed-case inline', '![  AlT_TeXt  ](padded.png)'],
  ['full reference', '![alt_text][picture]\n\n[picture]: reference.png'],
  ['empty reference', '![][picture]\n\n[picture]: empty-reference.png'],
  ['collapsed reference', '![ALT_TEXT][]\n\n[ALT_TEXT]: collapsed.png'],
  ['shortcut reference', '![alt_text]\n\n[alt_text]: shortcut.png'],
  ['linked image', '[![alt_text](linked.png)](/existing-target)'],
  ['raw missing alt', '<img src="raw-missing.png">'],
  ['raw empty alt', '<img src="raw-empty.png" alt="">'],
  ['raw whitespace alt', '<img src="raw-whitespace.png" alt=" &#9;&#10; ">'],
  ['raw placeholder alt', '<img src="raw-placeholder.png" alt="  ALT_TEXT  ">'],
]

test('the real Markdown, raw HTML and sanitize pipeline replaces missing and placeholder descriptions', () => {
  for (const [name, markdown] of fallbackCases) {
    const rendered = bodyImages(renderArticle(markdown))
    assert.equal(rendered.length, 1, name)
    assert.equal(rendered[0].alt, defaultArticle.title, name)
  }
  assert.match(renderArticle('[![alt_text](linked.png)](/existing-target)'), /<a href="\/existing-target"><img/)
})

test('meaningful descriptions survive the full pipeline exactly, including padding and escaped characters', () => {
  for (const [markdown, expected] of [
    ['![Diagram of the CKB cell model](diagram.png)', 'Diagram of the CKB cell model'],
    ['![  Existing description  ](padded.png)', '  Existing description  '],
    ['![alt_text diagram](literal.png)', 'alt_text diagram'],
    ['![Existing reference description][ref]\n\n[ref]: reference.png', 'Existing reference description'],
    ['[![现有图片说明](linked.png)](/existing-target)', '现有图片说明'],
    ['<img src="raw.png" alt="  Diagrama de células  ">', '  Diagrama de células  '],
    ['<img src="escaped.png" alt="Cell &quot;A&quot; &amp; B &lt;C&gt;">', 'Cell "A" & B <C>'],
  ]) {
    assert.equal(bodyImages(renderArticle(markdown))[0].alt, expected)
  }
})

test('English, Chinese and Spanish covers and body fallbacks use their own article titles', () => {
  for (const [language, title] of [
    ['en', 'Existing article title'],
    ['zh', '现有中文文章标题'],
    ['es', 'Título del artículo existente'],
  ]) {
    const rendered = images(renderArticle('![](body.png)\n\n<img src="raw.png" alt="alt_text">', { language, title }))
    const cover = rendered.find(image => image.className === 'articleCover')
    assert.equal(cover.alt, title, language)
    assert.equal(cover.src, defaultArticle.coverImage, language)
    assert.equal(cover.loading, '', 'Cover loading behavior is unchanged')
    assert.deepEqual(
      rendered.filter(image => image.loading === 'lazy').map(image => image.alt),
      [title, title],
    )
  }
})

test('relative, rooted and external body image paths and lazy loading remain unchanged', () => {
  const paths = [
    'images/cell.png',
    '/existing.png',
    'https://example.com/cell.png',
    'http://example.com/cell.png',
    '//example.com/cell.png',
  ]
  const rendered = bodyImages(renderArticle(paths.map(src => `![](${src})`).join('\n\n'), { id: 'existing article' }))
  assert.deepEqual(
    rendered.map(image => image.src),
    ['/education_hub_articles/existing%20article/images/cell.png', ...paths.slice(1)],
  )
  assert.ok(rendered.every(image => image.loading === 'lazy'))
})

test('fallback titles remain safely escaped and raw HTML still passes through sanitization', () => {
  const title = 'Cell "A" & <script>alert(1)</script> \'B\''
  const html = renderArticle('<img src="raw.png" onerror="alert(1)">\n\n<script>alert(2)</script>', { title })
  assert.equal(bodyImages(html)[0].alt, title)
  assert.equal(images(html).find(image => image.className === 'articleCover').alt, title)
  assert.match(html, /alt="Cell &quot;A&quot; &amp; &lt;script&gt;alert\(1\)&lt;\/script&gt; &#x27;B&#x27;"/)
  assert.doesNotMatch(html, /<script|\sonerror=/)
})

test('decorative component stubs and the existing social decoration retain empty alt', () => {
  const html = renderArticle('![](body.png)', {}, loadArticle(read(articleFile), true))
  const decorations = images(html).filter(image => image.src.startsWith('/decorative/'))
  assert.ok(decorations.length > 0)
  assert.ok(decorations.every(image => image.alt === ''))
  const socials = images(html).filter(image => /^\/images\/(twitter|linkedin|reddit|facebook)\.svg$/.test(image.src))
  assert.equal(socials.length, 4)
  assert.ok(socials.every(image => image.alt === ''))
  assert.equal(bodyImages(html)[0].alt, defaultArticle.title)
})

test('fixture article body HTML is identical to the approved Git revision after removing alt attributes', () => {
  const markdown =
    '# Existing section\n\nVisible **article text**.\n\n' + fallbackCases.map(([, value]) => value).join('\n\n')
  assert.equal(
    articleBodyWithoutAlts(renderArticle(markdown)),
    articleBodyWithoutAlts(renderArticle(markdown, {}, PreviousArticle)),
  )
})

test('all 320 published article renditions preserve source hashes and body HTML except image alt', context => {
  const catalog = JSON.parse(read('public/education_hub_articles/metadata/catalog.json'))
  const articles = catalog.articles.filter(article => !article.draft)
  assert.equal(articles.length, 320)
  const counts = { articles: articles.length, covers: 0, bodyImages: 0, blank: 0, placeholder: 0, preserved: 0 }
  for (const article of articles) {
    const sourceFile = `public/education_hub_articles/${article.sourceFile}`
    const raw = read(sourceFile)
    const { content } = matter(raw)
    assert.equal(hash(raw), article.sourceSHA256, `${sourceFile}: source hash`)
    assert.equal(hash(content), article.bodySHA256, `${sourceFile}: body hash`)
    const before = renderArticle(content, article, PreviousArticle)
    const after = renderArticle(content, article)
    assert.equal(
      articleBodyWithoutAlts(after),
      articleBodyWithoutAlts(before),
      `${sourceFile}: only article body alt attributes may change`,
    )
    const beforeImages = bodyImages(before)
    const afterImages = bodyImages(after)
    assert.equal(afterImages.length, beforeImages.length, sourceFile)
    counts.bodyImages += afterImages.length
    for (const [index, image] of beforeImages.entries()) {
      const normalized = image.alt.trim().toLowerCase()
      const fallback = !normalized || normalized === 'alt_text'
      counts[!normalized ? 'blank' : normalized === 'alt_text' ? 'placeholder' : 'preserved'] += 1
      assert.equal(afterImages[index].alt, fallback ? article.title : image.alt, `${sourceFile}: image ${index + 1}`)
    }
    const cover = images(after).find(image => image.className === 'articleCover')
    assert.equal(Boolean(cover), Boolean(article.coverImage), sourceFile)
    if (cover) {
      counts.covers += 1
      assert.equal(cover.alt, article.title, `${sourceFile}: cover title`)
    }
    assert.equal(hash(read(sourceFile)), article.sourceSHA256, `${sourceFile}: source remains unchanged`)
  }
  context.diagnostic(JSON.stringify(counts))
})

test('D17 uses responsive Next images with intrinsic dimensions, hero priority and lazy body images', () => {
  const Component = loadArticle(read(articleFile), false, true)
  const imageDimensions = {
    '/existing-cover.png': { width: 1920, height: 1080, type: 'png' },
    '/education_hub_articles/existing_article/images/body.png': { width: 1200, height: 800, type: 'png' },
    '/education_hub_articles/existing_article/images/movie.gif': { width: 1511, height: 1209, type: 'gif' },
  }
  const html = renderArticle(
    '![alt_text](images/body.png)\n\n<img src="images/body.png" alt="Raw diagram" onerror="bad()">\n\n' +
      '![Reference][image]\n\n[image]: images/body.png\n\n![Animation](images/movie.gif)\n\n![External](https://example.com/x.png)',
    {},
    Component,
    imageDimensions,
  )
  const document = new DOMParser().parseFromString(html, 'text/html')
  const images = Array.from(document.getElementsByTagName('img'))
  const optimized = images.filter(
    image => image.getAttribute('data-nimg') === '1' && image.getAttribute('src').startsWith('/_next/image?'),
  )
  assert.equal(optimized.length, 4)
  const hero = optimized[0]
  assert.equal(hero.getAttribute('width'), '1920')
  assert.equal(hero.getAttribute('height'), '1080')
  assert.match(hero.getAttribute('style'), /aspect-ratio:1920 \/ 1080/)
  assert.equal(hero.getAttribute('fetchpriority'), 'high')
  assert.notEqual(hero.getAttribute('loading'), 'lazy')
  assert.match(hero.getAttribute('sizes'), /650px/)
  for (const image of optimized.slice(1)) {
    assert.equal(image.getAttribute('width'), '1200')
    assert.equal(image.getAttribute('height'), '800')
    assert.equal(image.getAttribute('loading'), 'lazy')
    assert.match(image.getAttribute('srcSet') || image.getAttribute('srcset'), /_next\/image\?url=/)
    assert.match(image.getAttribute('sizes'), /690px/)
  }
  assert.equal(optimized[1].getAttribute('alt'), defaultArticle.title)
  assert.equal(optimized[2].getAttribute('alt'), 'Raw diagram')
  assert.equal(optimized[3].getAttribute('alt'), 'Reference')
  const animation = images.find(image => image.getAttribute('alt') === 'Animation')
  assert.equal(animation.getAttribute('src'), '/education_hub_articles/existing_article/images/movie.gif')
  assert.equal(animation.getAttribute('width'), '1511')
  assert.equal(animation.getAttribute('height'), '1209')
  assert.equal(animation.getAttribute('loading'), 'lazy')
  assert.ok(images.some(image => image.getAttribute('src') === 'https://example.com/x.png'))
  assert.doesNotMatch(html, /\sonerror=/)
})

test('D17 tiny body images retain intrinsic size and never enlarge to the article column', () => {
  const html = renderArticle('![Small](small.png)', {}, loadArticle(read(articleFile), false, true), {
    '/education_hub_articles/existing_article/small.png': { width: 90, height: 60, type: 'png' },
  })
  assert.match(html, /width="90" height="60"/)
  assert.match(html, /sizes="[^"]*90px/)
  assert.doesNotMatch(html, /style="width:100%/)
})
