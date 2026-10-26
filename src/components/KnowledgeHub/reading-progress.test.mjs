import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const exports = {}
const source = readFileSync(new URL('./reading-progress.ts', import.meta.url), 'utf8')
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  exports,
})
const { readingProgress } = exports

test('progress starts below the article bar and finishes when the article end enters the viewport', () => {
  assert.equal(readingProgress(200, 2200, 800, 80), 0)
  assert.equal(readingProgress(80, 2080, 800, 80), 0)
  assert.equal(readingProgress(-560, 1440, 800, 80), 50)
  assert.equal(readingProgress(-1200, 800, 800, 80), 100)
  assert.equal(readingProgress(-1800, 200, 800, 80), 100)
})

test('short articles and resized viewports produce bounded progress', () => {
  assert.equal(readingProgress(200, 600, 800, 80), 0)
  assert.equal(readingProgress(80, 600, 800, 80), 100)
  assert.equal(readingProgress(-560, 1440, 1000, 80), 59)
})
