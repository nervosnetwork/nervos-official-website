import assert from 'node:assert/strict'
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
import matter from 'gray-matter'
import ts from 'typescript'
import * as sass from 'sass'
import postcss from 'postcss'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(import.meta.url)
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const styles = new Proxy({}, { get: (_, key) => key })
const clsx = (...values) => values.filter(Boolean).join(' ')
const t = key => key
const element = React.createElement
const countH1 = html => (html.match(/<h1(?:\s|>)/g) || []).length

function evaluate(source, imports = {}, globals = {}) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    ...globals,
    require: name => {
      if (name === 'react/jsx-runtime') return require(name)
      assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`)
      return imports[name]
    },
  })
  return exports
}

function findNode(file, predicate) {
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let result
  const visit = node => {
    if (predicate(node)) result = node
    if (!result) ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(result, `Required source node missing in ${file}`)
  return result.getText(source)
}

const variable = (file, name) => findNode(file, node => ts.isVariableDeclaration(node) && node.name.getText() === name)

test('each shared core page renders one H1, preserving its title wrapper and decorative icon sibling', () => {
  const { Header } = evaluate(read('src/components/BaseSeparatePage/Header/index.tsx'), {
    react: React,
    clsx: { default: clsx },
    './index.module.scss': { default: styles },
  })
  const expectedWidths = { developers: '550px', mining: '550px', learn: '528px' }
  for (const page of ['ckbpage', 'developers', 'mining', 'learn', 'community', 'wallets']) {
    const source = `const ${variable(`src/pages/${page}/index.page.tsx`, 'title')}; exports.title = title`
    const { title } = evaluate(
      source,
      {},
      {
        t,
        Trans: ({ children }) => children,
        HeartIcon: props => element('svg', props),
      },
    )
    const html = renderToStaticMarkup(
      element(Header, {
        title,
        floatIcons: element('div', { className: 'existing-icons' }, 'decoration'),
      }),
    )
    assert.equal(countH1(html), 1, page)
    assert.match(html, /<div class="title"><h1(?:\s[^>]*)?>/)
    assert.match(html, /<\/h1><div class="existing-icons">decoration<\/div>/)
    assert.doesNotMatch(html, /<h1[^>]*><div/)
    if (expectedWidths[page]) assert.ok(html.includes(`max-width:${expectedWidths[page]}`), page)
  }
})

test('home intro has one existing primary title on both desktop and mobile', () => {
  const source = `const ${variable('src/pages/home/index.page.tsx', 'SlideCKBIntro')}; exports.Intro = SlideCKBIntro`
  for (const mobile of [false, true]) {
    const { Intro } = evaluate(
      source,
      {},
      {
        useTranslation: () => ({ t }),
        useIsMobile: () => mobile,
        ScreenSlide: ({ children }) => element('section', null, children),
        OpenIcon: props => element('svg', props),
        styles,
        clsx,
        DISABLE_CGOL_MOUSE_CONTROLLER: 'disable-game-mouse',
      },
    )
    const html = renderToStaticMarkup(element(Intro))
    assert.equal(countH1(html), 1)
    assert.match(html, /<h1 class="titleText disable-game-mouse">text1<\/h1>/)
    assert.match(html, /<div class="titleText disable-game-mouse">l2_text1<\/div>/)
  }
})

test('Foundation and Journey reuse their existing title copy and style class as the H1', () => {
  for (const [page, className, text] of [
    ['foundation', 'foundationTitle', 'foundation'],
    ['journey', 'title', 'title'],
  ]) {
    const source = findNode(
      `src/pages/${page}/index.page.tsx`,
      node => ts.isJsxElement(node) && node.openingElement.tagName.getText() === 'h1',
    )
    const { title } = evaluate(`exports.title = (${source})`, {}, { styles, t })
    assert.equal(renderToStaticMarkup(title), `<h1 class="${className}">${text}</h1>`)
  }
})

function loadArticle() {
  const headingModule = evaluate(read('src/components/KnowledgeHub/markdown-headings.ts'))
  return evaluate(read('src/components/KnowledgeHub/ContentArticle.tsx'), {
    clsx: { default: clsx },
    react: React,
    'next/image': { default: 'img' },
    'next/link': { default: 'a' },
    'next/router': { useRouter: () => ({}) },
    'react-markdown': { default: ReactMarkdown },
    'remark-gfm': { default: remarkGfm },
    'rehype-raw': { default: rehypeRaw },
    'rehype-sanitize': { default: rehypeSanitize, defaultSchema },
    './Home': { Icon: () => null, PreviewNotice: () => null },
    './Shared': {
      PreviewPage: ({ children }) => element('main', null, children),
      DiscoverBanner: () => null,
      useActiveSection: () => '',
    },
    './Components': { ArticleCard: () => null },
    './content': { articlePath: article => article.canonicalPath, formatArticleDate: () => 'Existing date' },
    './article-v2.module.scss': { default: styles },
    './pages-v2.module.scss': { default: styles },
    './markdown-headings': headingModule,
    './article-features': { articleSocialActionsEnabled: false },
    './analytics': { trackKBEvent: () => undefined },
  }).ContentArticle
}

const ContentArticle = loadArticle()
function renderArticle(markdown) {
  return renderToStaticMarkup(
    element(ContentArticle, {
      article: {
        id: 'existing_article',
        title: 'Existing title',
        subtitle: '',
        canonicalPath: '/knowledge-base/existing_article',
        authors: [],
        date: null,
        readingMinutes: 5,
        language: 'en',
        coverImage: null,
      },
      markdown,
      related: [],
      subjects: [],
      headings: [],
      hub: null,
      preview: false,
    }),
  )
}

test('Markdown and raw HTML body H1s become H2s without changing text or section anchors', () => {
  const html = renderArticle('# Body **heading**\n\n## Existing section\n\n<h1 id="raw-heading">Raw heading</h1>')
  assert.equal(countH1(html), 1)
  assert.match(html, /<h1>Existing title<\/h1>/)
  assert.match(html, /<h2 id="user-content-section-1">Body <strong>heading<\/strong><\/h2>/)
  assert.match(html, /<h2 id="user-content-section-2">Existing section<\/h2>/)
  assert.match(html, /<h2 id="user-content-raw-heading">Raw heading<\/h2>/)
})

test('the four existing articles containing body H1s each retain one page H1', () => {
  for (const file of [
    'layer_1_vs_layer_2/index_zh.md',
    'pi400_ckb_node_setup_guide/index.md',
    'pi400_ckb_node_setup_guide/index_zh.md',
    'what_is_a_multisig_wallet/index_zh.md',
  ]) {
    const { content } = matter(read(`public/education_hub_articles/${file}`))
    assert.equal(countH1(renderArticle(content)), 1, file)
  }
})

function css(file) {
  return postcss.parse(sass.compile(path.join(root, file), { loadPaths: [root], logger: sass.Logger.silent }).css)
}
function declaration(stylesheet, selector, property, media) {
  let value
  stylesheet.walkRules(rule => {
    if (rule.selector.replace(/\s+/g, ' ') !== selector.replace(/\s+/g, ' ')) return
    const enclosingMedia = rule.parent.type === 'atrule' ? rule.parent.params : undefined
    if (enclosingMedia !== media) return
    rule.walkDecls(property, decl => (value = decl.value))
  })
  return value
}

test('semantic headings neutralize browser defaults without changing the existing typography or margins', () => {
  const header = css('src/components/BaseSeparatePage/Header/index.module.scss')
  assert.equal(declaration(header, '.headerContent .title > h1', 'margin'), '0')
  assert.equal(declaration(header, '.headerContent .title > h1', 'font'), 'inherit')
  assert.equal(declaration(header, '.headerContent .title', 'font-size'), '65px')
  assert.equal(declaration(header, '.headerContent .title', 'margin-top'), '-100px')
  assert.equal(declaration(header, '.headerContent .title', 'line-height'), '90%')
  const home = css('src/pages/home/index.module.scss')
  assert.equal(declaration(home, 'h1.titleText', 'margin'), '0')
  assert.equal(declaration(home, '.slideCKBIntro .titleText', 'font-size'), '60px')
  assert.equal(declaration(home, '.slideCKBIntro .titleText', 'max-width'), '380px')
  assert.equal(declaration(css('src/pages/foundation/index.module.scss'), '.foundationTitle', 'margin'), '0 0 48px')
  assert.equal(declaration(css('src/pages/journey/index.module.scss'), '.title', 'margin'), '200px 0 17px')
  const article = css('src/components/KnowledgeHub/pages-v2.module.scss')
  const selector = '.page .articleMarkdown > :is(h1, h2)'
  assert.equal(declaration(article, selector, 'font-size'), '20px')
  assert.equal(declaration(article, selector, 'font-weight'), '600')
  assert.equal(declaration(article, selector, 'font-size', '(width <= 900px)'), '24px')
  assert.equal(declaration(article, selector, 'line-height', '(width <= 900px)'), '1.3')
})
