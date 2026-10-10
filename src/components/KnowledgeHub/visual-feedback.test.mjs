import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { test } from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import ts from 'typescript'
import * as sass from 'sass'
import postcss from 'postcss'

const directory = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const css = name => postcss.parse(sass.compile(path.join(directory, name), { logger: sass.Logger.silent }).css)
const componentCss = css('components.module.scss')
const homeCss = css('home-v2.module.scss')
const pageCss = css('pages-v2.module.scss')

function declaration(styles, selector, property, media) {
  let result
  styles.walkRules(rule => {
    if (rule.selector.replace(/\s+/g, ' ') !== selector.replace(/\s+/g, ' ')) return
    const enclosingMedia = rule.parent.type === 'atrule' ? rule.parent.params : undefined
    if (enclosingMedia !== media) return
    rule.walkDecls(property, decl => (result = decl.value))
  })
  return result
}

function loadComponents() {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(directory, 'Components.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  const imports = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    clsx: { default: (...values) => values.filter(Boolean).join(' ') },
    'next/link': { default: 'a' },
    './Icon': { Icon: ({ name }) => createElement('img', { 'data-icon': name, alt: '' }) },
    './components.module.scss': { default: new Proxy({}, { get: (_, key) => key }) },
    './content': { articlePath: article => article.canonicalPath },
    './analytics': { trackKBEvent: () => undefined },
  }
  vm.runInNewContext(outputText, {
    exports,
    require: name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected component dependency: ${name}`)
      return imports[name]
    },
  })
  return exports
}

test('home labels are uppercase and both reading lists keep the purple hover plus subtle movement', () => {
  assert.equal(declaration(homeCss, '.eyebrow', 'text-transform'), 'uppercase')
  assert.equal(declaration(homeCss, '.guideButton', 'text-transform'), 'uppercase')
  assert.equal(declaration(componentCss, '.readingList a:is(:hover, :focus-visible)', 'background'), 'var(--kbAccent)')
  assert.equal(declaration(componentCss, '.readingList a:is(:hover, :focus-visible)', 'color'), 'var(--kbInverseText)')
  assert.equal(
    declaration(componentCss, '.readingList a:is(:hover, :focus-visible) .readingTitle', 'transform'),
    'translateX(4px)',
  )
})

test('hub and guide headings match the desktop home display size and copy retains design spacing', () => {
  const displaySize = declaration(homeCss, '.heading h1', 'font-size')
  assert.equal(declaration(pageCss, '.startHero h1,\n.topicHero h1', 'font-size'), displaySize)
  assert.equal(declaration(pageCss, '.startHeroCopy > strong', 'margin-top'), '24px')
  assert.equal(declaration(pageCss, '.startHeroCopy > p', 'margin-top'), '24px')
  assert.equal(declaration(pageCss, '.startHeroCopy > p', 'max-width'), '848px')
  assert.equal(declaration(pageCss, '.page .topicHero > p', 'max-width'), '848px')
})

test('desktop subject and step rails size to all cards while tablets keep scrollable card widths', () => {
  const selector = '.stepNav,\n.subjectNav'
  assert.equal(declaration(pageCss, selector, 'grid-auto-flow'), 'column')
  assert.equal(declaration(pageCss, selector, 'grid-auto-columns'), 'minmax(0, 1fr)')
  assert.equal(declaration(pageCss, selector, 'grid-template-columns'), 'none')
  assert.equal(declaration(pageCss, selector, 'grid-auto-columns', '(width <= 1024px)'), 'minmax(190px, 1fr)')
  assert.equal(declaration(componentCss, '.subject', 'border'), '1px solid var(--kbNeutral400)')
  assert.equal(declaration(componentCss, '.subject > span:last-child', 'max-width'), '100%')
  assert.equal(declaration(pageCss, '.stepNav a', 'font-size'), '16px')
  const topic = fs.readFileSync(path.join(directory, 'Topic.tsx'), 'utf8')
  assert.match(topic, /name: 'View all',\s*icon: 'topics-imgGroup59'/)
  assert.ok(fs.statSync(path.join(directory, '../../../public/images/knowledge-hub/topics-imgGroup59.svg')).size > 0)
})

test('hub cards omit numbering and do not alter article destinations', () => {
  const { HubCard } = loadComponents()
  const html = renderToStaticMarkup(
    createElement(HubCard, {
      name: 'Nervos CKB',
      description: 'Explore Nervos.',
      hubId: 'nervos-ckb',
      titles: ['Existing article'],
      articles: [{ title: 'Existing article', canonicalPath: '/knowledge-base/existing_article', readingMinutes: 5 }],
    }),
  )
  assert.doesNotMatch(html, /topics-imgNumber/)
  assert.match(html, /href="\/knowledge-base\/existing_article"/)
})

test('a deliberately empty editorial reading list hides Go deeper instead of displaying a translation error', () => {
  const { StepSection } = loadComponents()
  const step = {
    id: 'empty-reading-test',
    title: 'Example step',
    summary: 'Next step: try the network.',
    body: 'Explore the network.',
    points: [],
    reading: ['Legacy fixture'],
  }
  const html = renderToStaticMarkup(createElement(StepSection, { step, index: 0, articles: [] }))
  assert.match(html, /Explore the network/)
  assert.doesNotMatch(html, /Go deeper|Legacy fixture|No further reading available/)
})

test('STEP number icons keep their original assets with a scoped optical alignment adjustment', () => {
  assert.equal(declaration(componentCss, '.stepLabel', 'align-items'), 'center')
  assert.equal(declaration(componentCss, '.stepLabel', 'font-size'), '20px')
  assert.equal(declaration(componentCss, '.stepLabel', 'gap'), '8px')
  assert.equal(declaration(componentCss, '.stepSection .stepLabel > img', 'transform'), 'translateY(-2px)')
  const source = fs.readFileSync(path.join(directory, 'Components.tsx'), 'utf8')
  assert.match(source, /Step <Icon name=\{`topics-imgNumber\$\{numbers\[index\] \?\? 'One'\}Circle`\} size=\{25\} \/>/)
})
