import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import vm from 'node:vm'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8')
const classNames = { default: new Proxy({}, { get: (_, key) => String(key) }) }

function load(filename) {
  const { outputText } = ts.transpileModule(read(filename), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  })
  const dialog = ({ children }) => React.createElement('div', null, children)
  dialog.Panel = dialog
  const dependencies = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    clsx: (...values) => values.filter(Boolean).join(' '),
    'next/image': 'img',
    'next-i18next': { useTranslation: () => [key => key] },
    '@headlessui/react': { Dialog: dialog },
    'src/components/StyledLink': {
      StyledLink: ({ children, href }) => React.createElement('a', { href }, children),
    },
  }
  const compiledModule = { exports: {} }
  vm.runInNewContext(outputText, {
    exports: compiledModule.exports,
    module: compiledModule,
    require: name => {
      if (name.endsWith('.scss')) return { __esModule: true, ...classNames }
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected import: ${name}`)
      return dependencies[name]
    },
  })
  return compiledModule.exports
}

test('existing author avatars use their supplied names without changing image paths or layout classes', () => {
  const ExpandedAuthors = load('src/components/KnowledgeBase/ExpandedAuthorList/index.tsx').default
  const html = renderToStaticMarkup(
    React.createElement(ExpandedAuthors, {
      isShow: true,
      post: { authors: [{ name: 'Existing Author', avatar: '/existing-author.png' }] },
    }),
  )
  assert.match(html, /<img src="\/existing-author.png" alt="Existing Author"\/>/)
  assert.match(html, /class="expandedAuthorAvatar"/)
  assert.match(html, /<div>Existing Author<\/div>/)
  assert.equal(renderToStaticMarkup(React.createElement(ExpandedAuthors, { isShow: false, post: {} })), '')
})

test('contributor and editor avatars use the existing username and keep their original dimensions', () => {
  const author = {
    username: 'known-contributor',
    avatar: '/existing-avatar.png',
    github: 'https://github.com/known-contributor',
    editTime: '2026-09-01T00:00:00.000Z',
  }
  const { ContributorsDialog } = load('src/components/BaseSeparatePage/ContributorsDialog/index.tsx')
  const { Info } = load('src/components/BaseSeparatePage/Info/index.tsx')
  for (const element of [
    React.createElement(ContributorsDialog, { contributors: [author], status: true, onClose: () => undefined }),
    React.createElement(Info, { info: 'Existing info', author }),
  ]) {
    const html = renderToStaticMarkup(element)
    const image = html.match(/<img[^>]*>/)?.[0]
    assert.ok(image)
    assert.match(image, /alt="known-contributor"/)
    assert.match(image, /src="\/existing-avatar.png"/)
    assert.match(image, /width="45" height="45"/)
    assert.match(image, /class="avatar"/)
    assert.match(html, /@known-contributor/)
  }
  const noAuthor = renderToStaticMarkup(React.createElement(Info, { info: 'Existing info', author: null }))
  assert.match(noAuthor, /alt=""/)
  assert.doesNotMatch(noAuthor, /alt="(?:undefined|avatar)"/)
})

test('the existing Foundation illustrations are explicitly decorative with unchanged image resources', () => {
  const source = ts.createSourceFile(
    'foundation.tsx',
    read('src/pages/foundation/index.page.tsx'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  const illustrations = []
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === 'img') {
      const attributes = new Map(
        node.attributes.properties.filter(ts.isJsxAttribute).map(a => [a.name.getText(source), a.initializer]),
      )
      const alt = attributes.get('alt')
      assert.ok(alt && ts.isStringLiteral(alt))
      assert.equal(alt.text, '')
      assert.equal(attributes.get('className').getText(source), '{styles.illustration}')
      illustrations.push(attributes.get('src').getText(source))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.deepEqual(illustrations, [
    '{ImgInfrastructure.src}',
    '{ImgGuidance.src}',
    '{ImgCommunity.src}',
    '{ImgAnOpenBazaar.src}',
    '{ImgExplorationAndInnovation.src}',
    '{ImgNurtureAndSupport.src}',
  ])
})

test('article Markdown keeps supplied alt text and intentionally empty descriptions without inventing copy', () => {
  const source = ts.createSourceFile(
    'article.tsx',
    read('src/components/KnowledgeHub/ContentArticle.tsx'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  )
  let renderer
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'img' && ts.isArrowFunction(node.initializer))
      renderer = node.initializer.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(renderer, 'Expected the real Markdown image renderer')
  const { outputText } = ts.transpileModule(`export const renderImage = ${renderer}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    fileName: 'image.tsx',
  })
  const exports = {}
  vm.runInNewContext(outputText, { exports, require, resolveImage: src => src })
  for (const alt of ['Diagram of the CKB cell model', '现有图片说明', '', undefined]) {
    const image = exports.renderImage({ src: '/existing.png', alt })
    assert.equal(image.props.alt, alt || '')
    assert.equal(image.props.src, '/existing.png')
    assert.equal(image.props.loading, 'lazy')
  }
})
