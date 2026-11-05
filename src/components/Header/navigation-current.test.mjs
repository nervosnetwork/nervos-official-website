import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'

const exports = {}
const source = readFileSync(new URL('./navigation-current.ts', import.meta.url), 'utf8')
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  exports,
})
const { navigationCurrent } = exports

test('marks exact internal destinations without marking Home on every page', () => {
  for (const path of ['/', '/knowledge-base', '/developers', '/community', '/ckbpage', '/learn', '/mining']) {
    assert.equal(navigationCurrent(path, path), 'page')
    if (path !== '/') assert.equal(navigationCurrent(path, '/'), undefined)
  }
})

test('marks Knowledge Base as the location for its topic, search, and article pages', () => {
  for (const path of ['/knowledge-base/topic', '/knowledge-base/search', '/knowledge-base/[...slug]']) {
    assert.equal(navigationCurrent(path, '/knowledge-base'), 'location')
  }
  assert.equal(navigationCurrent('/knowledge-base-other', '/knowledge-base'), undefined)
  assert.equal(navigationCurrent('/developers', 'https://docs.nervos.org/'), undefined)
  assert.equal(navigationCurrent('/wallets', '/mining'), undefined)
})
