import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import vm from 'node:vm'
import kbHubs from '../../../scripts/fixtures/load-kb-hubs.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const directory = path.dirname(fileURLToPath(import.meta.url))
const contentRoot = path.resolve(directory, '../../../public/education_hub_articles')
const catalog = JSON.parse(fs.readFileSync(path.join(contentRoot, 'metadata/catalog.json'), 'utf8'))
const approvedIds = [
  ['nervos_overview_of_a_layered_blockchain', 'tokenomics_of_nervos_network'],
  ['comparing_blockchain_virtual_machines', 'account_abstraction_where_we_are_going'],
  ['what_is_fiber', 'the_case_for_rgbpp'],
  ['blockchain_crypto_agility', 'ckb_blockchain_developers_dream'],
]
const approvedTitles = [
  'What is Nervos CKB?',
  'Why it’s built differently?',
  'What it makes possible',
  'Crypto-Agile & Quantum-Ready',
  'Make your next move',
]

function loadModule(filename, imports = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(directory, filename), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    require: name => {
      if (name.endsWith('/utils/breakpoints'))
        return { DESKTOP_QUERY: '(min-width: 1024px)', BELOW_DESKTOP_QUERY: '(max-width: 1023px)' }
      assert.ok(Object.hasOwn(imports, name), `Unexpected Start Here dependency: ${name}`)
      return imports[name]
    },
  })
  return exports
}

const { guideSteps } = loadModule('guide-data.ts')
const { StartHere } = loadModule('StartHere.tsx', {
  clsx: { default: require('clsx') },
  react: { useState: value => [value, () => undefined], useRef: () => ({ current: null }), useEffect: () => undefined },
  'react/jsx-runtime': require('react/jsx-runtime'),
  './Icon': { Icon: 'Icon' },
  './guide-data': { guideSteps },
  './Shared': {
    Breadcrumb: 'Breadcrumb',
    PreviewPage: 'PreviewPage',
    RelatedHubs: 'RelatedHubs',
    useActiveSection: () => 'step-1',
  },
  './Components': { ArrowButton: 'ArrowButton', SubjectCard: 'SubjectCard', StepSection: 'StepSection' },
  './useHeroScroll': { useHeroScroll: () => ({ heroFade: 0, breadcrumbHeight: 0, breadcrumbRef: null }) },
  './pages-v2.module.scss': { default: {} },
  './analytics': { trackKBEvent: () => undefined },
})

function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}

test('Start Here renders all five steps with navigation targets for every section', () => {
  const tree = nodes(StartHere({ catalog: { ...catalog, articles: [] } }))
  const navigation = tree.filter(node => node.type === 'SubjectCard')
  const sections = tree.filter(node => node.type === 'StepSection')
  assert.equal(navigation.length, 5)
  assert.equal(sections.length, 5)
  assert.deepEqual(
    navigation.map(node => node.props.title),
    [
      'What is Nervos CKB?',
      'Why it’s built differently',
      'CKB & Bitcoin',
      'Quantum & crypto agility',
      'Try it & build',
    ],
  )
  assert.deepEqual(
    sections.map(node => node.props.step.title),
    approvedTitles,
  )
  assert.deepEqual(
    navigation.map(node => node.props.href),
    ['#step-1', '#step-2', '#step-3', '#step-4', '#step-5'],
  )
  const heading = tree.find(node => node.type === 'h1')
  assert.ok(heading)
  const headingText = heading.props.children.filter(child => typeof child === 'string').join('')
  assert.match(headingText, /CKB in five steps/)
  assert.doesNotMatch(headingText, /four steps/)
})

test('Start Here passes the exact eight approved articles in editorial order across four steps', () => {
  const articles = catalog.articles.filter(article => article.language === 'en').reverse()
  const sections = nodes(StartHere({ catalog: { ...catalog, articles } })).filter(node => node.type === 'StepSection')
  const selections = sections.slice(0, 4).map(node => Array.from(node.props.articles, article => article.id))
  assert.deepEqual(selections, approvedIds)
  assert.equal(selections.flat().length, 8)
  assert.equal(sections.length, 5)
  assert.equal(sections.at(-1).props.step.id, 'step-5')
  assert.equal(sections.at(-1).props.articles.length, 0)
})

test('every approved selection resolves to its existing English source and unchanged canonical URL', () => {
  for (const id of approvedIds.flat()) {
    const article = catalog.articles.find(item => item.language === 'en' && item.id === id)
    assert.ok(article, `Missing approved English article: ${id}`)
    assert.equal(article.canonicalPath, `/knowledge-base/${id}`)
    assert.equal(article.sourceFile, `${id}/index.md`)
    assert.ok(fs.existsSync(path.join(contentRoot, article.sourceFile)), `Missing source: ${article.sourceFile}`)
  }
  assert.ok(!approvedIds.flat().includes('account_abstraction_where_were_going'), 'Do not use the feedback URL typo')
})

const { StepSection } = loadModule('Components.tsx', {
  clsx: { default: (...values) => values.filter(Boolean).join(' ') },
  'next/link': { default: 'Link' },
  'next/image': { default: 'Image' },
  'react/jsx-runtime': require('react/jsx-runtime'),
  './Icon': { Icon: 'Icon' },
  './ArticleLanguageLink': { ArticleLanguageLink: 'ArticleLanguageLink' },
  './components.module.scss': { default: {} },
  './content': {},
  './analytics': { trackKBEvent: () => undefined },
  '../../utils/kb-hubs': kbHubs,
})

test('the first four steps retain their copy and the fifth restores all original actions', () => {
  assert.equal(guideSteps.length, 5)
  guideSteps.slice(0, 4).forEach((step, index) => {
    const tree = nodes(StepSection({ step, index, articles: [] }))
    assert.equal(tree.find(node => node.type === 'section').props.id, `step-${index + 1}`)
    assert.equal(tree.find(node => node.type === 'h2').props.children, approvedTitles[index])
    assert.ok(tree.some(node => node.type === 'p' && node.props.children === step.summary))
    assert.ok(tree.some(node => node.type === 'p' && node.props.children === step.body))
    assert.equal(tree.filter(node => node.type === 'Link').length, 0)
    assert.equal(tree.filter(node => node.type === 'h3').length, 0)
    assert.ok(!tree.some(node => node.type === 'Icon' && node.props.name === 'topics-imgNumberFiveCircle'))
  })
  const step = guideSteps[4]
  const tree = nodes(StepSection({ step, index: 4, articles: [] }))
  assert.equal(tree.find(node => node.type === 'section').props.id, 'step-5')
  assert.equal(tree.find(node => node.type === 'h2').props.children, 'Make your next move')
  assert.ok(tree.some(node => node.type === 'p' && node.props.children === step.summary))
  assert.ok(tree.some(node => node.type === 'p' && node.props.children === step.body))
  assert.ok(tree.some(node => node.type === 'Icon' && node.props.name === 'topics-imgNumberFiveCircle'))
  assert.deepEqual(
    tree.filter(node => node.type === 'Link').map(node => node.props.href),
    ['https://ckbdapps.com/ecosystem', 'https://talk.nervos.org/', 'https://docs.nervos.org/'],
  )
  assert.deepEqual(
    Array.from(step.actions, action => action.title),
    ['Explore the ecosystem', 'Join the conversation', 'Build on CKB'],
  )
})
