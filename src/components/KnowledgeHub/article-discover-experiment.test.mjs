import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const source = fs.readFileSync(new URL('./article-discover-experiment.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
})
const storageKey = 'kb-article-discover-placement-v1'
const imports = { DESKTOP_QUERY: '(min-width: 1024px)' }
const moduleRequire = () => imports

function browser({ saved, search = '', random = 0.25, blocked = false, writeBlocked = false } = {}) {
  const values = new Map(saved === undefined ? [] : [[storageKey, saved]])
  const document = { documentElement: { dataset: {} } }
  const window = {
    location: { search },
    localStorage: {
      getItem: key => {
        if (blocked) throw new Error('Storage unavailable')
        return values.get(key) ?? null
      },
      setItem: (key, value) => {
        if (blocked || writeBlocked) throw new Error('Storage unavailable')
        values.set(key, value)
      },
    },
  }
  const context = vm.createContext({
    exports: {},
    require: moduleRequire,
    window,
    document,
    URLSearchParams,
    Math: { random: () => random },
  })
  vm.runInContext(outputText, context)
  return { api: context.exports, context, values, window, root: document.documentElement }
}

test('the random assignment splits at 0.5 and is saved for later page loads', () => {
  for (const [random, expected] of [
    [0, 'A'],
    [0.4999, 'A'],
    [0.5, 'B'],
    [0.9999, 'B'],
  ]) {
    const first = browser({ random })
    assert.equal(first.api.initializeArticleDiscoverExperiment().variant, expected)
    assert.equal(first.values.get(storageKey), expected)
    const next = browser({ saved: first.values.get(storageKey), random: 1 - random })
    assert.equal(next.api.initializeArticleDiscoverExperiment().variant, expected)
    assert.equal(next.root.dataset.articleDiscoverVariant, expected)
  }
})

test('malformed assignments and unknown preview values fall back to a valid saved random assignment', () => {
  const env = browser({ saved: 'invalid', search: '?article_variant=unknown', random: 0.75 })
  const assignment = env.api.initializeArticleDiscoverExperiment()
  assert.equal(assignment.variant, 'B')
  assert.equal(assignment.preview, false)
  assert.equal(env.values.get(storageKey), 'B')
})

test('preview links change the displayed variant without overwriting the remembered assignment', () => {
  for (const variant of ['A', 'B']) {
    const saved = variant === 'A' ? 'B' : 'A'
    const env = browser({ saved, search: `?article_variant=${variant}` })
    const assignment = env.api.initializeArticleDiscoverExperiment()
    assert.equal(assignment.variant, variant)
    assert.equal(assignment.preview, true)
    assert.equal(env.root.dataset.articleDiscoverVariant, variant)
    assert.equal(env.values.get(storageKey), saved)
    env.window.location.search = ''
    assert.equal(env.api.initializeArticleDiscoverExperiment().variant, saved)
  }
})

test('a preview visit does not assign a new visitor before they join the test', () => {
  const env = browser({ search: '?article_variant=B', random: 0.1 })
  env.api.initializeArticleDiscoverExperiment()
  assert.equal(env.values.size, 0)
  env.window.location.search = ''
  assert.equal(env.api.initializeArticleDiscoverExperiment().variant, 'A')
})

test('blocked browser storage retains a stable assignment in memory for the current document', () => {
  const env = browser({ blocked: true, random: 0.75 })
  assert.equal(env.api.initializeArticleDiscoverExperiment().variant, 'B')
  env.context.Math.random = () => 0.1
  assert.equal(env.api.initializeArticleDiscoverExperiment().variant, 'B')
})

test('readable invalid storage with blocked writes cannot rerandomize an already rendered variant', () => {
  const env = browser({ saved: 'invalid', writeBlocked: true, random: 0.75 })
  assert.equal(env.api.initializeArticleDiscoverExperiment().variant, 'B')
  env.context.Math.random = () => 0.1
  assert.equal(env.api.initializeArticleDiscoverExperiment().variant, 'B')
})

test('click attribution keeps the displayed assignment when another tab changes browser storage', () => {
  const env = browser({ saved: 'A' })
  assert.equal(env.api.initializeArticleDiscoverExperiment().variant, 'A')
  env.values.set(storageKey, 'B')
  assert.equal(env.api.initializeArticleDiscoverExperiment().variant, 'A')
  assert.equal(env.root.dataset.articleDiscoverVariant, 'A')
})

test('the head bootstrap is self-contained and applies the variant before React renders', () => {
  const env = browser({ saved: 'B' })
  vm.runInContext(env.api.ARTICLE_DISCOVER_BOOTSTRAP, env.context)
  assert.equal(env.root.dataset.articleDiscoverVariant, 'B')
  assert.equal(env.root.dataset.articleDiscoverAssignment, 'B')
})

test('the document bootstrap survives the server compiler replacing browser guards', () => {
  const serverOutput = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    transformers: {
      before: [
        context => node => {
          const visit = child =>
            ts.isTypeOfExpression(child) &&
            ts.isIdentifier(child.expression) &&
            ['window', 'document'].includes(child.expression.text)
              ? ts.factory.createStringLiteral('undefined')
              : ts.visitEachChild(child, visit, context)
          return ts.visitNode(node, visit)
        },
      ],
    },
  }).outputText
  const server = vm.createContext({ exports: {}, require: moduleRequire })
  vm.runInContext(serverOutput, server)
  const env = browser({ saved: 'B' })
  vm.runInContext(server.exports.ARTICLE_DISCOVER_BOOTSTRAP, env.context)
  assert.equal(env.root.dataset.articleDiscoverVariant, 'B')
})

test('server rendering is safe without browser globals', () => {
  const context = vm.createContext({ exports: {}, require: moduleRequire })
  vm.runInContext(outputText, context)
  assert.equal(context.exports.initializeArticleDiscoverExperiment().variant, 'A')
  assert.doesNotThrow(() => vm.runInContext(context.exports.ARTICLE_DISCOVER_BOOTSTRAP, context))
})
