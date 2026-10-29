import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DOMParser } from '@xmldom/xmldom'
import ts from 'typescript'
import * as sass from 'sass'
import postcss from 'postcss'

const require = createRequire(import.meta.url)
const element = React.createElement
const styles = new Proxy({}, { get: (_, key) => key })
const clsx = (...values) => values.filter(Boolean).join(' ')
const noOp = () => undefined
const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8')

// Keep Next's href/locale boundary observable without requiring a live router.
function NextLink({ href, locale, ...props }) {
  return element('a', { ...props, href: typeof href === 'string' ? href : href.pathname, 'data-locale': locale })
}

function load(file, imports = {}, globals = {}) {
  const { outputText } = ts.transpileModule(read(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    URL,
    ...globals,
    require: name => {
      if (name === 'react/jsx-runtime') return require(name)
      if (name.endsWith('.module.scss')) return { default: styles }
      if (name.endsWith('.svg')) return { default: () => null }
      assert.ok(Object.hasOwn(imports, name), `Unexpected language UI dependency: ${name}`)
      return imports[name]
    },
  })
  return exports
}

const content = load('./content.ts')
const article = (language = 'en', availableLanguages = ['en', 'zh']) => ({
  id: 'Existing_Article',
  language,
  availableLanguages,
  canonicalPath: `${language === 'en' ? '' : `/${language}`}/knowledge-base/Existing_Article`,
  title: 'Existing article',
  subtitle: '',
  date: null,
  coverImage: null,
  authors: [],
  hub: 'nervos-ckb',
  subjects: ['architecture'],
  readingMinutes: 5,
})

function languageUI(initialPreference) {
  const storage = new Map(initialPreference ? [['kb-article-language', initialPreference]] : [])
  const writes = []
  const store = load(
    './article-language.ts',
    {},
    {
      window: {
        localStorage: {
          getItem: key => storage.get(key) ?? null,
          setItem: (key, value) => {
            storage.set(key, value)
            writes.push(value)
          },
        },
        addEventListener: noOp,
        removeEventListener: noOp,
      },
    },
  )
  const links = load('./ArticleLanguageLink.tsx', {
    react: { useSyncExternalStore: (_subscribe, snapshot) => snapshot() },
    'next/link': { default: NextLink },
    './content': content,
    './article-language': store,
  })
  const { ArticleLanguageSwitch } = load('./ArticleLanguageSwitch.tsx', {
    clsx: { default: clsx },
    'next/link': { default: NextLink },
    './content': content,
    './ArticleLanguageLink': links,
  })
  return { store, writes, links, ArticleLanguageSwitch }
}

function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}
const dom = node => new DOMParser().parseFromString(renderToStaticMarkup(element('div', null, node)), 'text/html')
const tags = (node, tag) => Array.from(node.getElementsByTagName(tag))
const withClass = (node, tag, name) =>
  tags(node, tag).find(item => item.getAttribute('class').split(' ').includes(name))

test('switch offers only published EN/ZH options with correct route, locale and current-page semantics', () => {
  const { ArticleLanguageSwitch, writes } = languageUI('zh')
  for (const [language, available, expected] of [
    ['en', ['en', 'zh', 'es'], ['en', 'zh']],
    ['zh', ['en', 'zh'], ['en', 'zh']],
    ['en', ['en'], ['en']],
    ['zh', ['zh'], ['zh']],
    ['es', ['en', 'zh', 'es'], ['en', 'zh']],
    ['es', ['es'], []],
  ]) {
    const currentArticle = article(language, available)
    const tree = ArticleLanguageSwitch({ article: currentArticle })
    const options = nodes(tree).filter(node => node.type === NextLink)
    assert.deepEqual(
      options.map(node => node.props.locale),
      expected,
    )
    if (!expected.length) {
      assert.equal(tree, null)
      continue
    }
    assert.equal(tree.props['aria-label'], 'Article language')
    for (const option of options) {
      assert.equal(option.props.href, '/knowledge-base/Existing_Article')
      assert.equal(option.props.hrefLang, option.props.locale)
      assert.equal(option.props.lang, option.props.locale)
      assert.equal(option.props['aria-current'], language === option.props.locale ? 'page' : undefined)
    }
    const rendered = tags(dom(tree), 'a')
    assert.deepEqual(
      rendered.map(node => node.textContent),
      expected.map(value => (value === 'en' ? 'EN' : '中文')),
    )
    assert.equal(
      rendered.filter(node => node.getAttribute('aria-current') === 'page').length,
      expected.includes(language) ? 1 : 0,
    )
  }
  const missingMetadata = article('en')
  delete missingMetadata.availableLanguages
  assert.deepEqual(
    nodes(ArticleLanguageSwitch({ article: missingMetadata }))
      .filter(node => node.type === NextLink)
      .map(node => node.props.locale),
    ['en'],
    'Missing availability must not invent a Chinese translation',
  )
  assert.deepEqual(writes, [], 'Rendering a language or fallback page must never save an inferred preference')
})

test('explicit switch clicks persist, including active EN on a page reached through Chinese fallback', () => {
  const { ArticleLanguageSwitch, links, store, writes } = languageUI()
  const translated = article()
  const choose = (currentArticle, language) =>
    nodes(ArticleLanguageSwitch({ article: currentArticle })).find(
      node => node.type === NextLink && node.props.locale === language,
    )
  choose(translated, 'zh').props.onClick()
  assert.equal(store.getArticleLanguagePreference(), 'zh')
  assert.equal(links.ArticleLanguageLink({ article: translated }).props.locale, 'zh')
  const englishOnly = article('en', ['en'])
  assert.equal(links.ArticleLanguageLink({ article: englishOnly }).props.locale, 'en')
  assert.equal(store.getArticleLanguagePreference(), 'zh', 'A missing translation preserves the saved choice')
  const activeEnglish = choose(englishOnly, 'en')
  assert.equal(activeEnglish.props['aria-current'], 'page')
  activeEnglish.props.onClick()
  assert.equal(store.getArticleLanguagePreference(), 'en')
  assert.equal(links.ArticleLanguageLink({ article: translated }).props.locale, 'en')
  assert.deepEqual(writes, ['zh', 'en'])
  const chinese = choose(translated, 'zh')
  chinese.props.onAuxClick({ button: 2 })
  assert.equal(store.getArticleLanguagePreference(), 'en', 'Opening the context menu does not select a language')
  assert.deepEqual(writes, ['zh', 'en'])
  chinese.props.onAuxClick({ button: 1 })
  assert.equal(store.getArticleLanguagePreference(), 'zh', 'Opening the translation in a new tab saves the choice')
  assert.deepEqual(writes, ['zh', 'en', 'zh'])
})

function pageUI() {
  const language = languageUI()
  const routes = []
  const hooks = {
    ...React,
    useEffect: noOp,
    useRef: () => ({ current: null }),
    useState: initial => [initial, noOp],
    useMemo: callback => callback(),
  }
  const common = {
    react: hooks,
    clsx: { default: clsx },
    'next/link': { default: NextLink },
    'next/router': {
      useRouter: () => ({ pathname: '/knowledge-base/[slug]', query: {}, push: (...args) => routes.push(args) }),
    },
    './content': content,
    './analytics': { trackKBEvent: noOp },
    '../../utils/kb-hubs': { kbHubPath: id => `/knowledge-base/topic/${id}` },
  }
  const Popover = ({ children, ...props }) =>
    element('div', props, typeof children === 'function' ? children({ close: noOp }) : children)
  Popover.Button = props => element('button', props)
  Popover.Panel = props => element('div', props)
  const { Header } = load('../Header/index.tsx', {
    ...common,
    'next-i18next': { useTranslation: () => [key => key] },
    '@headlessui/react': { Popover, Portal: ({ children }) => children, Transition: ({ children }) => children },
    '../StyledLink': { StyledLink: NextLink },
    '../../hooks': { useIsMobile: () => true },
    '../../utils': { isClient: () => false },
    '../ConwayGameOfLife/constants': { DISABLE_CGOL_MOUSE_CONTROLLER: 'disable-game-mouse' },
  })
  const headerProps = []
  const shared = load('./Shared.tsx', {
    ...common,
    'next/head': { default: () => null },
    '../Page': {
      Page: ({ children }) =>
        children({
          renderHeader: props => {
            headerProps.push(props)
            return element(Header, props)
          },
          renderFooter: () => null,
        }),
    },
    './Home': { Icon: () => null, Newsletter: () => null },
    './KnowledgeFooter': { KnowledgeFooter: () => null },
    './Components': { ArrowButton: () => null },
    './GuideLife': { GuideLife: () => null },
  })
  const { ContentArticle } = load('./ContentArticle.tsx', {
    ...common,
    'next/image': { default: 'img' },
    'react-markdown': { default: ({ children, className }) => element('div', { className }, children) },
    'remark-gfm': {},
    'rehype-raw': {},
    'rehype-sanitize': { defaultSchema: {} },
    './Home': { Icon: () => null, PreviewNotice: () => null },
    './Shared': { ...shared, DiscoverBanner: () => null, useActiveSection: () => '' },
    './Components': { ArticleCard: () => null },
    './markdown-headings': {},
    './article-features': { articleSocialActionsEnabled: false },
    './ArticleLanguageSwitch': language,
    './ArticleLanguageLink': language.links,
  })
  return { ...language, ...shared, ContentArticle, Header, headerProps, routes }
}

test('article page places actual switches in desktop navigation and the mobile header slot only', () => {
  const ui = pageUI()
  const currentArticle = article('zh')
  const tree = ui.ContentArticle({
    article: currentArticle,
    markdown: '',
    related: [],
    subjects: [],
    headings: [],
    hub: null,
  })
  assert.equal(tree.type, ui.PreviewPage)
  assert.equal(tree.props.mobileHeaderActions.type, ui.ArticleLanguageSwitch)
  assert.equal(tree.props.mobileHeaderActions.props.article, currentArticle)
  assert.equal(tree.props.mobileHeaderActions.props.mobile, true)
  const desktop = nodes(tree).filter(node => node.type === ui.ArticleLanguageSwitch)
  assert.equal(desktop.length, 1)
  assert.equal(desktop[0].props.mobile, undefined)
  const document = dom(tree)
  const articleNav = withClass(document, 'div', 'articleNav')
  const mobileActions = withClass(document, 'div', 'mobileActions')
  assert.equal(tags(articleNav, 'nav').filter(node => node.getAttribute('aria-label') === 'Article language').length, 1)
  assert.equal(
    tags(mobileActions, 'nav').filter(node => node.getAttribute('aria-label') === 'Article language').length,
    1,
  )
  assert.equal(ui.headerProps[0].mobileActions, tree.props.mobileHeaderActions)
  dom(element(ui.PreviewPage, { title: 'General KB page', revision: true, children: 'Content' }))
  assert.equal(ui.headerProps[1].mobileActions, undefined)
  assert.equal(withClass(dom(element(ui.Header, { variant: 'knowledgeHub' })), 'div', 'mobileActions'), undefined)
  assert.equal(withClass(dom(element(ui.Header)), 'div', 'mobileActions'), undefined)
})

test('article brand, categories and Knowledge Hub header outbound navigation explicitly select English', () => {
  const ui = pageUI()
  const tree = ui.ContentArticle({
    article: article('zh'),
    markdown: '',
    related: [],
    headings: [],
    hub: { id: 'nervos-ckb', name: 'Nervos CKB' },
    subjects: [{ id: 'architecture', name: 'Architecture' }],
  })
  assert.equal(nodes(tree).find(node => node.props?.className === 'articleBrand').props.locale, 'en')
  const categories = nodes(tree).find(node => node.props?.className === 'categories')
  nodes(categories)
    .filter(node => node.type === 'button')
    .forEach(node => node.props.onClick())
  assert.deepEqual(
    ui.routes.map(args => args[0]),
    ['/knowledge-base/topic/nervos-ckb', '/knowledge-base/topic/nervos-ckb?subject=architecture'],
  )
  assert.ok(ui.routes.every(args => args[2].locale === 'en'))
  const header = dom(element(ui.Header, { variant: 'knowledgeHub' }))
  assert.equal(withClass(header, 'a', 'logo').getAttribute('data-locale'), 'en')
  const menu = withClass(header, 'div', 'menuPopoverContent')
  const internal = tags(menu, 'a').filter(node => node.getAttribute('href').startsWith('/'))
  assert.ok(internal.length > 0)
  assert.ok(internal.every(node => node.getAttribute('data-locale') === 'en'))
  assert.equal(withClass(dom(element(ui.Header)), 'a', 'logo').getAttribute('data-locale'), '')
})

test('desktop and mobile selectors hand off at the same 900px breakpoint with mobile actions before Menu', () => {
  const css = file =>
    postcss.parse(sass.compile(new URL(file, import.meta.url).pathname, { logger: sass.Logger.silent }).css)
  const declarations = (stylesheet, selector, property, media) => {
    let value
    stylesheet.walkRules(rule => {
      if (rule.selector !== selector) return
      const parentMedia = rule.parent.type === 'atrule' ? rule.parent.params : undefined
      if (parentMedia === media)
        rule.walkDecls(property, decl => {
          value = decl.value
        })
    })
    return value
  }
  const header = css('../Header/index.module.scss')
  const articleStyle = css('./article-v2.module.scss')
  const media = '(width <= 900px)'
  assert.equal(declarations(articleStyle, '.desktopLanguage', 'display'), 'flex')
  assert.equal(declarations(articleStyle, '.desktopLanguage', 'display', media), 'none')
  assert.equal(declarations(header, '.mobileActions', 'display'), 'none')
  assert.equal(declarations(header, '.knowledgeHub.withMobileActions .mobileActions', 'display', media), 'flex')
  assert.equal(declarations(header, '.knowledgeHub .logo', 'order'), '0')
  assert.equal(declarations(header, '.knowledgeHub.withMobileActions .mobileActions', 'order', media), '1')
  assert.equal(declarations(header, '.knowledgeHub.withMobileActions .menuPopover', 'order', media), '2')
  assert.equal(declarations(header, '.knowledgeHub .languagePopover', 'display'), 'none')
})
