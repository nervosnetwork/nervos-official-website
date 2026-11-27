import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const directory = path.dirname(fileURLToPath(import.meta.url))
const publicRoot = path.resolve(directory, '../../../../../public')
const source = fs.readFileSync(path.join(directory, 'index.tsx'), 'utf8')
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText

function render(props = {}) {
  const loaded = { exports: {} }
  const imports = {
    react: require('react'),
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': 'a',
    'next/image': 'img',
    'next-i18next': { useTranslation: () => [key => key] },
    clsx: require('clsx'),
    '../../../../components/ConwayGameOfLife/constants': { DISABLE_CGOL_MOUSE_CONTROLLER: 'noMouseController' },
    './SubscribeWrap': { SubscribeWrap: 'SubscribeWrap' },
    './icons': Object.fromEntries(
      ['X', 'Discord', 'Telegram', 'LinkedIn', 'Reddit', 'Youtube', 'T'].map(name => [`${name}Icon`, `svg-${name}`]),
    ),
    './index.module.scss': { footerMedia: 'footerMedia', medias: 'medias', darkSocials: 'darkSocials' },
  }
  vm.runInNewContext(output, {
    module: loaded,
    exports: loaded.exports,
    require: name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`)
      return imports[name]
    },
  })
  return loaded.exports.FooterMedia(props)
}

function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}

test('the default footer retains its existing social SVGs and subscription component', () => {
  const tree = nodes(render())
  assert.equal(tree.filter(node => node.type === 'SubscribeWrap').length, 1)
  assert.equal(tree.filter(node => node.type === 'img').length, 0)
  assert.equal(tree.filter(node => typeof node.type === 'string' && node.type.startsWith('svg-')).length, 7)
  assert.ok(tree.some(node => node.props?.className === 'medias'))
  assert.equal(tree.filter(node => node.type === 'a' && node.props['aria-label']).length, 0)
})

test('the opt-in light-page footer uses original local Figma assets, names and root dimensions', () => {
  const tree = nodes(render({ darkSocialIcons: true }))
  const links = tree.filter(node => node.type === 'a')
  assert.deepEqual(
    links.map(node => node.props.href),
    nodes(render())
      .filter(node => node.type === 'a')
      .map(node => node.props.href),
  )
  assert.deepEqual(
    links.map(node => node.props['aria-label']),
    ['Twitter', 'Discord', 'Telegram', 'LinkedIn', 'Reddit', 'YouTube', 'Nervos Talk'],
  )
  for (const link of links) {
    const image = nodes(link).find(node => node.type === 'img')
    assert.ok(image)
    const { src, width, height, style, alt } = image.props
    assert.match(src, /^\/images\/information-pages\/footer-[a-z]+\.svg$/)
    const svg = fs.readFileSync(path.join(publicRoot, src), 'utf8')
    const root = svg.match(/<svg\b[^>]*>/)?.[0]
    assert.ok(root)
    assert.equal(width, Number(root.match(/\bwidth="([^"]+)"/)?.[1]))
    assert.equal(height, Number(root.match(/\bheight="([^"]+)"/)?.[1]))
    assert.equal(style.width, width)
    assert.equal(style.height, height)
    assert.equal(alt, '')
    assert.equal(link.props.target, '_blank')
    assert.equal(link.props.rel, 'noopener noreferrer')
  }
})
