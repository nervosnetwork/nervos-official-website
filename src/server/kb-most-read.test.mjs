import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const directory = path.dirname(fileURLToPath(import.meta.url))
const catalog = JSON.parse(
  fs.readFileSync(path.join(directory, '../../public/education_hub_articles/metadata/catalog.json'), 'utf8'),
)
const { outputText } = ts.transpileModule(fs.readFileSync(path.join(directory, 'kb-most-read.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
})
const exports = {}
vm.runInNewContext(outputText, { exports })
const { getKBMostRead } = exports

function localized(language) {
  return {
    ...catalog,
    articles: catalog.articles.filter(
      article =>
        article.language === language && !article.draft && (!article.date || Date.parse(article.date) <= Date.now()),
    ),
    featured: catalog.featured.filter(item => item.language === language),
  }
}
const ids = selection => Array.from(selection.articles, article => article.id)
const englishTopFour = [
  'Unbreakable_SHA256_Why_Even_Quantum_Computers_Cannot_Do_It',
  'block_time_in_blockchain',
  'secp256k1_a_key_algorithm',
  'zk_rollup_vs_optimistic_rollup',
]

test('the English homepage gets the verified annual GA order rather than catalog or editorial order', () => {
  const input = localized('en')
  input.articles.reverse()
  input.featured = []
  const result = getKBMostRead(input)
  assert.deepEqual(ids(result), englishTopFour)
  assert.equal(result.startDate, '2025-09-28')
  assert.equal(result.endDate, '2026-09-27')
  assert.deepEqual(Object.keys(result).sort(), ['articles', 'endDate', 'startDate'])
  assert.ok(
    result.articles.every(article => !Object.hasOwn(article, 'views')),
    'Raw GA counts stay server-side',
  )
})

test('each language uses only real translations, with no invented article or editorial padding', () => {
  assert.deepEqual(ids(getKBMostRead(localized('zh'))), [
    'block_time_in_blockchain',
    'secp256k1_a_key_algorithm',
    'zk_rollup_vs_optimistic_rollup',
    'what_is_secp256r1',
  ])
  assert.deepEqual(ids(getKBMostRead(localized('es'))), [
    'secp256k1_a_key_algorithm',
    'zk_rollup_vs_optimistic_rollup',
    'what_is_nakamoto_consensus',
  ])
  for (const language of ['en', 'zh', 'es', 'fr']) {
    assert.ok(getKBMostRead(localized(language)).articles.every(article => article.language === language))
  }
  assert.deepEqual(ids(getKBMostRead(localized('fr'))), [])
  const unrankedOnly = localized('en')
  unrankedOnly.articles = unrankedOnly.articles.filter(
    article => article.id === 'nervos_overview_of_a_layered_blockchain',
  )
  assert.equal(unrankedOnly.articles.length, 1)
  assert.deepEqual(ids(getKBMostRead(unrankedOnly)), [])
})

test('excluded and unavailable articles are skipped in favor of the next verified ranked articles', () => {
  const input = localized('en')
  input.articles = input.articles
    .filter(article => article.id !== englishTopFour[1])
    .map(article => ({ ...article, excludedFromRecommendations: article.id === englishTopFour[0] }))
  assert.deepEqual(ids(getKBMostRead(input)), [
    'secp256k1_a_key_algorithm',
    'zk_rollup_vs_optimistic_rollup',
    'comparing_blockchain_virtual_machines',
    'what_is_secp256r1',
  ])
})

test('selection preserves all canonical paths and never mutates the catalog or its article objects', () => {
  for (const language of ['en', 'zh', 'es']) {
    const input = localized(language)
    const before = JSON.stringify(input)
    for (const article of input.articles) Object.freeze(article)
    Object.freeze(input.articles)
    Object.freeze(input)
    for (const article of getKBMostRead(input).articles) {
      const original = input.articles.find(item => item.id === article.id)
      assert.equal(article, original)
      assert.equal(article.canonicalPath, original.canonicalPath)
    }
    assert.equal(JSON.stringify(input), before)
    assert.deepEqual(ids(getKBMostRead(input)), ids(getKBMostRead(input)), 'Repeated calls preserve ranking')
  }
})
