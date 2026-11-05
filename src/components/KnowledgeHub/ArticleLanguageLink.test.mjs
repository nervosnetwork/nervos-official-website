import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function load(relative, imports) {
  const { outputText } = ts.transpileModule(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  vm.runInNewContext(outputText, { exports, URL, require: name => imports[name] })
  return exports
}

const language = load('./article-language.ts', {})
const content = load('./content.ts', {})
const NextLink = () => null

function components(preference, ssr = false) {
  return load('./ArticleLanguageLink.tsx', {
    'next/link': { default: NextLink },
    react: { useSyncExternalStore: (_subscribe, _snapshot, serverSnapshot) => (ssr ? serverSnapshot() : preference) },
    'react/jsx-runtime': require('react/jsx-runtime'),
    './content': content,
    './article-language': language,
  })
}

const article = { language: 'en', canonicalPath: '/knowledge-base/translated', availableLanguages: ['en', 'zh'] }

test('article links expose the preferred Next locale while preserving native click handlers and targets', () => {
  const { ArticleLanguageLink } = components('zh')
  const onClick = () => undefined
  const link = ArticleLanguageLink({
    article,
    href: '/knowledge-base/translated?from=card#body',
    onClick,
    target: '_blank',
    children: 'Read',
  })
  assert.equal(link.type, NextLink)
  assert.equal(link.props.locale, 'zh')
  assert.equal(link.props.href, '/knowledge-base/translated?from=card#body')
  assert.equal(link.props.onClick, onClick, 'do not replace native/modified navigation with a click-only redirect')
  assert.equal(link.props.target, '_blank')
  assert.equal(link.props.children, 'Read')
})

test('cards without translations fall back to English; title-only fallbacks keep their search URL', () => {
  const { ArticleLanguageLink } = components('zh')
  const english = ArticleLanguageLink({ article: { ...article, availableLanguages: ['en'] } })
  assert.equal(english.props.locale, 'en')
  const search = ArticleLanguageLink({ href: '/knowledge-base/search?q=CKB' })
  assert.equal(search.props.href, '/knowledge-base/search?q=CKB')
  assert.equal(search.props.locale, 'en')
})

test('SSR uses no stored preference and localized paths do not accumulate prefixes', () => {
  const { ArticleLanguageLink, useArticleLanguagePreference } = components('zh', true)
  assert.equal(useArticleLanguagePreference(), null)
  const link = ArticleLanguageLink({
    article: { ...article, language: 'zh', canonicalPath: '/zh/knowledge-base/translated' },
  })
  assert.equal(link.props.href, '/knowledge-base/translated')
  assert.equal(link.props.locale, 'zh')
  const spanish = ArticleLanguageLink({
    article: { ...article, language: 'es', canonicalPath: '/es/knowledge-base/translated' },
  })
  assert.equal(spanish.props.href, '/knowledge-base/translated')
  assert.equal(spanish.props.locale, 'en')
})

test('URL-object overrides retain query and hash', () => {
  const link = components('zh').ArticleLanguageLink({
    article,
    href: { pathname: '/zh/knowledge-base/translated', query: { from: 'guide' }, hash: '#details' },
  })
  assert.equal(link.props.href.pathname, '/knowledge-base/translated')
  assert.equal(link.props.href.query.from, 'guide')
  assert.equal(link.props.href.hash, '#details')
  assert.equal(link.props.locale, 'zh')
})

test('markdown article links use the preference, while external links and in-page anchors stay native', () => {
  const { ArticleContentLink } = components('zh')
  const languagesByArticle = { translated: ['en', 'zh'] }
  const link = ArticleContentLink({
    href: 'https://www.nervos.org/knowledge-base/translated#details',
    languagesByArticle,
    children: 'Read',
  })
  assert.equal(link.type, NextLink)
  assert.equal(link.props.href, '/knowledge-base/translated#details')
  assert.equal(link.props.locale, 'zh')
  for (const href of ['https://example.org/knowledge-base/translated', '#details']) {
    const external = ArticleContentLink({ href, languagesByArticle, children: 'Read' })
    assert.equal(external.type, 'a')
    assert.equal(external.props.href, href)
    assert.equal(external.props.children, 'Read')
  }
})
