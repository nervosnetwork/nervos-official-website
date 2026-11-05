import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { test } from 'node:test'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createInstance } from 'i18next'
import { I18nextProvider, useTranslation } from 'react-i18next'
import { DOMParser } from '@xmldom/xmldom'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const element = React.createElement
const styles = new Proxy({}, { get: (_, key) => key })
const noOp = () => undefined
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8')
const resources = Object.fromEntries(
  ['en', 'zh'].map(language => [
    language,
    { common: JSON.parse(read(`../../../public/locales/${language}/common.json`)) },
  ]),
)

function load(file, imports = {}) {
  const { outputText } = ts.transpileModule(read(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    URL,
    require: name => {
      if (name === 'react/jsx-runtime') return require(name)
      if (name.endsWith('.module.scss')) return { default: styles }
      if (name.endsWith('.svg')) return { default: () => null }
      assert.ok(Object.hasOwn(imports, name), `Unexpected article chrome dependency: ${name}`)
      return imports[name]
    },
  })
  return exports
}

function NextLink({ href, locale, children, ...props }) {
  return element(
    'a',
    { ...props, href: typeof href === 'string' ? href : href.pathname, 'data-locale': locale },
    children,
  )
}

// Keep menu contents observable during SSR without changing the production components.
function Contents({ children }) {
  return typeof children === 'function' ? children({ open: true, close: noOp }) : children
}
function Panel({ children, className, ...props }) {
  return element('div', { className, ...props }, children)
}
const Dialog = Object.assign(Contents, { Panel, Title: ({ children }) => element('h2', null, children) })
const Disclosure = Object.assign(Contents, { Button: ({ children }) => element('button', null, children), Panel })
const Popover = Object.assign(Contents, { Button: ({ children }) => element('button', null, children), Panel })

async function headerUI(language = 'zh') {
  const i18n = createInstance()
  await i18n.init({
    lng: language,
    fallbackLng: 'en',
    defaultNS: 'common',
    resources,
    interpolation: { escapeValue: false },
  })
  const content = load('../KnowledgeHub/content.ts')
  const router = {
    locale: language,
    pathname: '/knowledge-base/[...slug]',
    query: { slug: ['existing_article'] },
    events: { on: noOp, off: noOp },
    push: noOp,
  }
  const shared = {
    react: React,
    // next-i18next re-exports this real hook; both dictionaries remain available.
    'next-i18next': { useTranslation },
    '@headlessui/react': { Dialog, Disclosure, Popover, Portal: Contents, Transition: Contents },
    'next/link': { default: NextLink },
    'next/router': { useRouter: () => router },
    clsx: { default: (...values) => values.filter(Boolean).join(' ') },
    '../../utils/breakpoints': { DESKTOP_QUERY: '(min-width: 1024px)' },
  }
  const knowledge = load('./KnowledgeHeader.tsx', {
    ...shared,
    '../KnowledgeHub/Icon': { Icon: () => null },
    '../KnowledgeHub/analytics': { trackKBEvent: noOp },
    '../KnowledgeHub/content': content,
    '../KnowledgeHub/article-language': { setArticleLanguagePreference: noOp },
    './navigation-current': { navigationCurrent: () => undefined },
  })
  const { Header } = load('./index.tsx', {
    ...shared,
    '../StyledLink': { StyledLink: NextLink },
    '../../hooks': { useIsMobile: () => false },
    '../../utils': { isClient: () => false },
    '../ConwayGameOfLife/constants': { DISABLE_CGOL_MOUSE_CONTROLLER: 'disable-game-mouse' },
    './KnowledgeHeader': knowledge,
  })
  const render = (Component, props) =>
    new DOMParser().parseFromString(
      renderToStaticMarkup(element(I18nextProvider, { i18n }, element('div', null, element(Component, props)))),
      'text/html',
    )
  return { Header, ...knowledge, i18n, render }
}

const tags = (document, tag) => Array.from(document.getElementsByTagName(tag))
const withClass = (document, tag, name) =>
  tags(document, tag).filter(node => node.getAttribute('class').split(' ').includes(name))
const article = {
  id: 'existing_article',
  title: '中文文章标题',
  language: 'zh',
  availableLanguages: ['en', 'zh', 'es'],
  canonicalPath: '/zh/knowledge-base/existing_article',
}

test('Chinese article keeps its English brand, contribution action and desktop/mobile navigation', async () => {
  const { Header, i18n, render } = await headerUI()
  const document = render(Header, { variant: 'knowledgeArticle', articleLanguage: article })
  for (const brand of withClass(document, 'a', 'brand')) {
    assert.equal(brand.textContent, 'Knowledge BaseEducation Hub')
    assert.equal(brand.getAttribute('data-locale'), 'en')
  }
  assert.equal(withClass(document, 'a', 'brand').length, 2, 'Desktop and mobile share the English brand')
  assert.deepEqual(
    withClass(document, 'span', 'writeArticleFace').map(node => node.textContent),
    ['Write an article', 'Write an article'],
  )
  const desktopMenu = withClass(document, 'div', 'menuPopoverContent')[0]
  assert.ok(desktopMenu)
  assert.match(desktopMenu.textContent, /DevelopersDocsGithubExplorer/)
  assert.match(desktopMenu.textContent, /LearnKnowledge Base/)
  assert.doesNotMatch(desktopMenu.textContent, /开发者|知识库|教育中心|撰写文章|社区基金/)
  assert.equal(tags(document, 'nav')[0].getAttribute('aria-label'), 'Site navigation')
  assert.equal(withClass(document, 'h2', 'navigationLabel')[0].textContent, 'Navigation')
  assert.equal(i18n.language, 'zh', 'Fixing article chrome must not change the active i18n locale')
  assert.equal(i18n.t('navigation.knowledge_base'), '知识库', 'Chinese resources remain loaded and active')
  assert.equal(article.language, 'zh')
  assert.equal(article.title, '中文文章标题')
})

test('English article chrome preserves Chinese language selection and only offers EN/Chinese translations', async () => {
  const { Header, render } = await headerUI()
  const document = render(Header, { variant: 'knowledgeArticle', articleLanguage: article })
  const toggle = withClass(document, 'div', 'languageToggle')[0]
  assert.equal(toggle.getAttribute('aria-label'), 'Language')
  assert.deepEqual(
    tags(toggle, 'a').map(node => [
      node.textContent,
      node.getAttribute('data-locale'),
      node.getAttribute('aria-current'),
    ]),
    [
      ['EN', 'en', ''],
      ['中文', 'zh', 'page'],
    ],
  )
  const group = withClass(document, 'fieldset', 'languageGroup')[0]
  assert.equal(tags(group, 'legend')[0].textContent, 'Language')
  assert.deepEqual(
    tags(group, 'input').map(node => [node.getAttribute('value'), node.hasAttribute('checked')]),
    [
      ['en', false],
      ['zh', true],
    ],
  )
  assert.deepEqual(
    tags(group, 'span').map(node => node.textContent),
    ['English', '简体中文'],
  )
  assert.ok(tags(toggle, 'a').every(node => node.getAttribute('href') === '/knowledge-base/existing_article'))
})

test('shared navigation still follows the current locale outside article mode', async () => {
  const { NavigationMenu, i18n, render } = await headerUI()
  const document = render(NavigationMenu, {})
  assert.equal(tags(document, 'nav')[0].getAttribute('aria-label'), '网站导航')
  assert.equal(withClass(document, 'h2', 'navigationLabel')[0].textContent, '导航')
  assert.match(document.documentElement.textContent, /知识库/)
  assert.equal(i18n.language, 'zh')
})

test('a right-aligned desktop menu does not force English on unrelated Chinese site pages', async () => {
  const { Header, render } = await headerUI()
  const document = render(Header, { variant: 'default' })
  const desktopMenu = withClass(document, 'div', 'menuPopoverContent')[0]
  assert.ok(desktopMenu.getAttribute('class').split(' ').includes('rightMenu'))
  assert.match(desktopMenu.textContent, /开发者文档Github区块浏览器/)
  assert.match(desktopMenu.textContent, /学习知识库/)
  assert.doesNotMatch(desktopMenu.textContent, /Developers|Knowledge Base/)
})
