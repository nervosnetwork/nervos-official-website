import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const expectedClass = 'disable_cgol_mouse_controller'

function evaluate(source, dependencies = {}) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    require: name => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected runtime dependency: ${name}`)
      return dependencies[name]
    },
  })
  return exports
}

const constants = evaluate(read('./constants.ts'))

test('the navigation opt-out class keeps its value without loading any runtime dependencies', () => {
  assert.deepEqual(Object.keys(constants), ['DISABLE_CGOL_MOUSE_CONTROLLER'])
  assert.equal(constants.DISABLE_CGOL_MOUSE_CONTROLLER, expectedClass)
})

test('existing game-control imports retain their backwards-compatible class export', () => {
  const controls = evaluate(read('./useGameKeybindings.ts'), {
    react: {},
    interactjs: {},
    './constants': constants,
  })
  assert.equal(controls.DISABLE_CGOL_MOUSE_CONTROLLER, expectedClass)
  assert.equal(typeof controls.useGameKeyboardHandler, 'function')
  assert.equal(typeof controls.useGameMouseHandler, 'function')
  assert.match(
    read('./index.tsx'),
    /export \* from ['"]\.\/useGameKeybindings['"]/,
    'the public entry keeps its exports',
  )
})

test('navigation and presentational cards import only the pure constant rather than the game engine', () => {
  for (const file of [
    '../Header/index.tsx',
    '../Footer/components/FooterMedia/index.tsx',
    '../Footer/components/FooterLinkGroup/index.tsx',
    '../../pages/home/Card/index.tsx',
  ]) {
    const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const imports = source.statements.filter(ts.isImportDeclaration)
    const gameImports = imports.filter(node => node.moduleSpecifier.text.includes('ConwayGameOfLife'))
    assert.equal(gameImports.length, 1, `${file}: one constant-only game import`)
    assert.ok(gameImports[0].moduleSpecifier.text.endsWith('/ConwayGameOfLife/constants'), file)
    const bindings = gameImports[0].importClause.namedBindings
    assert.ok(ts.isNamedImports(bindings), file)
    assert.deepEqual(
      bindings.elements.map(binding => binding.propertyName?.text ?? binding.name.text),
      ['DISABLE_CGOL_MOUSE_CONTROLLER'],
      file,
    )
  }
})
