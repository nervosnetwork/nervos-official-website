import assert from 'node:assert/strict'
import fs from 'node:fs'
import ts from 'typescript'
import { KB_HUBS } from '../../config/kb-hubs.mjs'

// Component VM tests use the same pure Hub resolver as production. Compile it
// once per test process rather than duplicating URL behavior in mock modules.
const compiled = ts.transpileModule(fs.readFileSync(new URL('../../src/utils/kb-hubs.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText
const loaded = { exports: {} }
new Function('require', 'module', 'exports', compiled)(
  name => {
    assert.equal(name, '../../config/kb-hubs.mjs', `Unexpected Hub resolver dependency: ${name}`)
    return { KB_HUBS }
  },
  loaded,
  loaded.exports,
)

export default loaded.exports
