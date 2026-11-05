import assert from 'node:assert/strict'
import fs from 'node:fs'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)

function load(relative, globals = {}, imports = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    URL,
    ...globals,
    require: name => (Object.hasOwn(imports, name) ? imports[name] : require(name)),
  })
  return exports
}

const api = load('./article-language.ts')
const available = { translated: ['en', 'zh'], english: ['en'], Old_Article: ['en', 'zh'] }

test('article choices are limited to English and Chinese, with published English fallback', () => {
  assert.equal(api.articleLinkLanguage(null, 'zh', ['en', 'zh']), 'zh')
  assert.equal(api.articleLinkLanguage(null, 'es', ['en', 'es']), 'en')
  assert.equal(api.articleLinkLanguage('en', 'zh', ['en', 'zh']), 'en')
  assert.equal(api.articleLinkLanguage('zh', 'en', ['en', 'zh']), 'zh')
  assert.equal(api.articleLinkLanguage('zh', 'en', ['en']), 'en')
  assert.equal(api.articleLinkLanguage('zh', 'en', []), 'en')
  for (const value of [undefined, null, 'fr', 'es', 'ZH', '', '{}']) assert.equal(api.asArticleLanguage(value), null)
})

test('article routes preserve their query, hash, case and spelling while leaving locale to Next Link', () => {
  for (const href of [
    '/zh/knowledge-base/Old_Article?from=reading%20list#details',
    'https://www.nervos.org/es/knowledge-base/Old_Article?from=reading%20list#details',
    'https://nervos.org/knowledge-base/Old_Article?from=reading%20list#details',
  ]) {
    const target = api.resolveArticleContentLink(href, 'zh', 'en', available)
    assert.equal(target.href, '/knowledge-base/Old_Article?from=reading%20list#details')
    assert.equal(target.locale, 'zh')
  }
  assert.equal(api.articleLinkHref('/fr/knowledge-base/Old_Article?x=1#part'), '/knowledge-base/Old_Article?x=1#part')
})

test('markdown links resolve only known published article IDs and trusted hosts', () => {
  const translated = api.resolveArticleContentLink('/knowledge-base/translated', 'zh', 'en', available)
  assert.equal(translated.locale, 'zh')
  const fallback = api.resolveArticleContentLink('/zh/knowledge-base/english', 'zh', 'zh', available)
  assert.equal(fallback.locale, 'en')
  for (const href of [
    '#details',
    '/knowledge-base/search?q=test',
    '/knowledge-base/unpublished',
    '/knowledge-base/constructor',
    '/knowledge-base/%ZZ',
    '/knowledge-base/translated/extra',
    'https://evil.example/knowledge-base/translated',
    'https://www.nervos.org.evil.example/knowledge-base/translated',
    '//evil.example/knowledge-base/translated',
    'https://user@www.nervos.org/knowledge-base/translated',
    'https://www.nervos.org:444/knowledge-base/translated',
    'javascript:alert(1)',
    'mailto:hello@nervos.org',
  ])
    assert.equal(api.resolveArticleContentLink(href, 'zh', 'en', available), null, href)
})

function browser(initial = null, { blockedRead = false, blockedWrite = false } = {}) {
  const values = new Map(initial === null ? [] : [['kb-article-language', initial]])
  const callbacks = new Set()
  let writes = 0
  const window = {
    localStorage: {
      getItem(key) {
        if (blockedRead) throw new Error('storage disabled')
        return values.get(key) ?? null
      },
      setItem(key, value) {
        writes++
        if (blockedWrite) throw new Error('storage disabled')
        values.set(key, value)
      },
    },
    addEventListener: (name, callback) => {
      assert.equal(name, 'storage')
      callbacks.add(callback)
    },
    removeEventListener: (name, callback) => {
      assert.equal(name, 'storage')
      callbacks.delete(callback)
    },
  }
  return {
    window,
    values,
    callbacks,
    get writes() {
      return writes
    },
    change(key, value) {
      if (key === null) values.clear()
      else if (value === null) values.delete(key)
      else values.set(key, value)
      callbacks.forEach(callback => callback({ key, newValue: value }))
    },
  }
}

test('preference is SSR-safe and explicit choices persist across a fresh page load', () => {
  assert.equal(api.getArticleLanguagePreference(), null)
  api.setArticleLanguagePreference('zh')
  assert.equal(api.getArticleLanguagePreference(), null)
  const environment = browser()
  const first = load('./article-language.ts', { window: environment.window })
  assert.equal(first.getArticleLanguagePreference(), null)
  assert.equal(environment.writes, 0)
  first.setArticleLanguagePreference('zh')
  assert.equal(first.getArticleLanguagePreference(), 'zh')
  const nextPage = load('./article-language.ts', { window: environment.window })
  assert.equal(nextPage.getArticleLanguagePreference(), 'zh')
  assert.equal(nextPage.articleLinkLanguage(nextPage.getArticleLanguagePreference(), 'en', ['en']), 'en')
  assert.equal(nextPage.getArticleLanguagePreference(), 'zh', 'fallback must not erase the explicit preference')
  assert.equal(environment.writes, 1, 'rendering, reloading and fallback must never persist an inferred choice')
})

test('same-tab choices and cross-tab storage changes notify subscribers and clean up', () => {
  const environment = browser()
  const store = load('./article-language.ts', { window: environment.window })
  const updates = []
  const unsubscribe = store.subscribeArticleLanguagePreference(() => updates.push(store.getArticleLanguagePreference()))
  store.setArticleLanguagePreference('zh')
  environment.change('unrelated', 'en')
  environment.change(store.ARTICLE_LANGUAGE_STORAGE_KEY, 'en')
  environment.change(store.ARTICLE_LANGUAGE_STORAGE_KEY, 'fr')
  environment.change(null, null)
  assert.deepEqual(updates, ['zh', 'en', null, null])
  unsubscribe()
  assert.equal(environment.callbacks.size, 0)
  store.setArticleLanguagePreference('en')
  assert.equal(updates.length, 4)
})

test('blocked reads or writes still allow an explicit choice for the current tab', () => {
  for (const options of [{ blockedRead: true, blockedWrite: true }, { blockedWrite: true }]) {
    const environment = browser('en', options)
    const store = load('./article-language.ts', { window: environment.window })
    store.setArticleLanguagePreference('zh')
    assert.equal(store.getArticleLanguagePreference(), 'zh')
    assert.equal(store.articleLinkLanguage(store.getArticleLanguagePreference(), 'en', ['en', 'zh']), 'zh')
    store.setArticleLanguagePreference('en')
    assert.equal(store.getArticleLanguagePreference(), 'en')
  }
})

test('server availability excludes draft and scheduled translations and includes migration aliases', () => {
  const markdown = 'Article body'
  const sourceSHA256 = crypto.createHash('sha256').update(markdown).digest('hex')
  const article = (id, language, extra = {}) => ({
    id,
    language,
    sourceFile: `${id}/index_${language}.md`,
    sourceSHA256,
    draft: false,
    date: null,
    canonicalPath: `${language === 'en' ? '' : `/${language}`}/knowledge-base/${id}`,
    ...extra,
  })
  const catalog = {
    articles: [
      article('translated', 'en'),
      article('translated', 'zh'),
      article('translated', 'es'),
      article('draft_translation', 'en'),
      article('draft_translation', 'zh', { draft: true }),
      article('scheduled_translation', 'en'),
      article('scheduled_translation', 'zh', { date: '2999-01-01' }),
    ],
    hubs: [],
    subjects: [],
    featured: [],
  }
  const source = load(
    '../../server/kb-content.ts',
    { process: { cwd: () => '/fixture' } },
    {
      'node:fs': {
        readFileSync(file) {
          if (file.endsWith('/catalog.json')) return JSON.stringify(catalog)
          if (file.endsWith('/slug-migrations.json'))
            return JSON.stringify({ renames: [{ from: 'Old_Article', to: 'translated' }] })
          return markdown
        },
      },
    },
  )
  const availability = source.getKBArticleLanguages()
  assert.deepEqual(Array.from(availability.translated), ['en', 'zh', 'es'])
  assert.deepEqual(Array.from(availability.Old_Article), ['en', 'zh', 'es'])
  assert.deepEqual(Array.from(availability.draft_translation), ['en'])
  assert.deepEqual(Array.from(availability.scheduled_translation), ['en'])
  assert.deepEqual(Array.from(source.getKBCatalog('en').articles[0].availableLanguages), ['en', 'zh', 'es'])
  assert.equal(source.getKBArticleStatus('draft_translation', 'zh'), 'unpublished')
  assert.equal(source.getKBArticle('draft_translation', 'zh'), null)
  assert.equal(source.getKBArticle('scheduled_translation', 'zh'), null)
})
