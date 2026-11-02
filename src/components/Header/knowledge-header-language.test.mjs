import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const styles = new Proxy({}, { get: (_, key) => key })
const NextLink = () => null
const noOp = () => undefined

function load(file, imports = {}, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    URL,
    ...globals,
    require: name => {
      if (name.endsWith('/utils/breakpoints'))
        return { DESKTOP_QUERY: '(min-width: 1024px)', BELOW_DESKTOP_QUERY: '(max-width: 1023px)' }
      if (name === 'react/jsx-runtime') return require(name)
      if (name.endsWith('.module.scss')) return { default: styles }
      if (name.endsWith('.svg')) return { default: () => null }
      assert.ok(Object.hasOwn(imports, name), `Unexpected header language dependency: ${name}`)
      return imports[name]
    },
  })
  return exports
}

function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}

function headerUI() {
  const storage = new Map()
  const routes = []
  const language = load(
    '../KnowledgeHub/article-language.ts',
    {},
    {
      window: {
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
        addEventListener: noOp,
        removeEventListener: noOp,
      },
    },
  )
  const content = load('../KnowledgeHub/content.ts')
  const header = load('./KnowledgeHeader.tsx', {
    react: {},
    '@headlessui/react': {},
    'next/link': { default: NextLink },
    'next/router': { useRouter: () => ({ push: (...args) => routes.push(args) }) },
    'next-i18next': { useTranslation: () => ({ t: (_key, fallback) => fallback }) },
    clsx: { default: (...values) => values.filter(Boolean).join(' ') },
    '../KnowledgeHub/Icon': { Icon: () => null },
    '../KnowledgeHub/analytics': { trackKBEvent: noOp },
    '../KnowledgeHub/content': content,
    '../KnowledgeHub/article-language': language,
    './navigation-current': { navigationCurrent: () => undefined },
  })
  return { ...header, language, routes }
}

const article = (language = 'en', availableLanguages = ['en', 'zh']) => ({
  id: 'existing_article',
  title: 'Existing article',
  language,
  availableLanguages,
  canonicalPath: `${language === 'en' ? '' : `/${language}`}/knowledge-base/existing_article`,
})

test('remote desktop language UI uses real EN/ZH links without placeholders or duplicate controls', () => {
  const { LanguageToggle } = headerUI()
  for (const [language, available, expected] of [
    ['en', ['en', 'zh', 'es'], ['en', 'zh']],
    ['zh', ['en', 'zh'], ['en', 'zh']],
    ['en', ['en'], []],
    ['zh', ['zh'], []],
    ['es', ['es'], []],
  ]) {
    const tree = LanguageToggle({ article: article(language, available) })
    const links = nodes(tree).filter(node => node.type === NextLink)
    assert.deepEqual(
      links.map(node => node.props.locale),
      expected,
    )
    for (const link of links) {
      assert.equal(link.props.href, '/knowledge-base/existing_article')
      assert.equal(link.props.hrefLang, link.props.locale)
      assert.equal(link.props['aria-current'], language === link.props.locale ? 'page' : undefined)
      assert.equal(link.props.disabled, undefined)
      assert.equal(link.props.className, 'languageOption')
    }
  }
  assert.equal(LanguageToggle({}), null)
  assert.equal(LanguageToggle({ article: article('en', ['en']) }), null)
})

test('desktop language links persist a choice for normal and middle clicks, not context-menu clicks', () => {
  const { LanguageToggle, language } = headerUI()
  const tree = LanguageToggle({ article: article() })
  const links = nodes(tree).filter(node => node.type === NextLink)
  links[1].props.onClick()
  assert.equal(language.getArticleLanguagePreference(), 'zh')
  links[0].props.onAuxClick({ button: 2 })
  assert.equal(language.getArticleLanguagePreference(), 'zh')
  links[0].props.onAuxClick({ button: 1 })
  assert.equal(language.getArticleLanguagePreference(), 'en')
})

test('remote mobile menu language radios keep the current language and navigate only to existing translations', () => {
  const { LanguageRadioGroup, language, routes } = headerUI()
  let closed = 0
  const tree = LanguageRadioGroup({ article: article('zh'), onSelect: () => closed++ })
  const inputs = nodes(tree).filter(node => node.type === 'input')
  assert.equal(tree.props.className, 'languageGroup')
  assert.equal(tree.props.disabled, undefined)
  assert.deepEqual(
    inputs.map(node => [node.props.value, node.props.checked]),
    [
      ['en', false],
      ['zh', true],
    ],
  )
  inputs[0].props.onChange()
  assert.equal(language.getArticleLanguagePreference(), 'en')
  assert.equal(closed, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(routes)), [['/knowledge-base/existing_article', null, { locale: 'en' }]])
  const englishOnly = LanguageRadioGroup({ article: article('en', ['en']) })
  assert.equal(englishOnly, null)
  language.setArticleLanguagePreference('zh')
  const bilingual = LanguageRadioGroup({ article: article('en') })
  const englishInput = nodes(bilingual).find(node => node.type === 'input' && node.props.value === 'en')
  englishInput.props.onClick()
  assert.equal(language.getArticleLanguagePreference(), 'en', 'Selecting active EN saves the explicit choice')
  assert.equal(LanguageRadioGroup({}), null)
})
