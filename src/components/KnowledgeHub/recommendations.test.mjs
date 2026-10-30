import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import ts from 'typescript'

const { outputText } = ts.transpileModule(fs.readFileSync(new URL('./content.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
})
const { relatedArticles } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
const article = (id, overrides = {}) => ({
  id,
  language: 'en',
  date: '2026-01-01',
  hub: null,
  subjects: [],
  internalTags: [],
  relatedArticleIds: [],
  excludedFromRecommendations: false,
  ...overrides,
})
const catalog = (articles, featured = []) => ({ articles, featured })

test('editorial pins and relevant matches stay ahead of featured and latest fallbacks', () => {
  const current = article('current', { hub: 'hub', subjects: ['subject'], relatedArticleIds: ['pinned'] })
  const items = [
    current,
    article('latest', { date: '2026-10-01' }),
    article('same-hub', { hub: 'hub', subjects: ['other'] }),
    article('featured', { hub: 'hub', subjects: ['other'] }),
    article('relevant', { hub: 'hub', subjects: ['subject'] }),
    article('pinned'),
  ]
  assert.deepEqual(
    relatedArticles(current, catalog(items, [{ hub: 'hub', articleId: 'featured' }])).map(item => item.id),
    ['pinned', 'relevant', 'featured'],
  )
})

test('same-hub articles fill sparse matches before global latest articles', () => {
  const current = article('current', { hub: 'hub', subjects: ['subject'] })
  const items = [
    current,
    article('global-newest', { date: '2026-10-01' }),
    article('hub-older', { hub: 'hub', subjects: ['other'], date: '2026-01-01' }),
    article('hub-newer', { hub: 'hub', subjects: ['other'], date: '2026-02-01' }),
  ]
  assert.deepEqual(
    relatedArticles(current, catalog(items)).map(item => item.id),
    ['hub-newer', 'hub-older', 'global-newest'],
  )
})

test('unclassified articles get unique latest recommendations in their language, respecting exclusions', () => {
  const current = article('current', { language: 'zh' })
  const items = [
    current,
    article('english', { date: '2026-10-01' }),
    article('excluded', { language: 'zh', excludedFromRecommendations: true, date: '2026-10-01' }),
    article('older', { language: 'zh', date: '2026-01-01' }),
    article('newer', { language: 'zh', date: '2026-02-01' }),
    article('newest', { language: 'zh', date: '2026-03-01' }),
  ]
  assert.deepEqual(
    relatedArticles(current, catalog(items)).map(item => item.id),
    ['newest', 'newer', 'older'],
  )
  assert.deepEqual(relatedArticles(current, catalog([current])), [])
})
