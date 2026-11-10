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
const { DOMParser } = require('@xmldom/xmldom')

const directory = path.dirname(fileURLToPath(import.meta.url))
const contentRoot = path.resolve(directory, '../../../public/education_hub_articles')
const catalog = JSON.parse(fs.readFileSync(path.join(contentRoot, 'metadata/catalog.json'), 'utf8'))
const approvedIds = [
  ['nervos_overview_of_a_layered_blockchain', 'tokenomics_of_nervos_network'],
  ['comparing_blockchain_virtual_machines', 'account_abstraction_where_we_are_going'],
  ['what_is_fiber', 'the_case_for_rgbpp'],
  ['blockchain_crypto_agility', 'ckb_blockchain_developers_dream'],
  [],
]
const approvedTitles = [
  'What is Nervos CKB?',
  'Why it’s built differently?',
  'What it makes possible',
  'Crypto-Agile & Quantum-Ready',
  'Make your next move',
]

function loadModule(filename, imports = {}, globals = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(directory, filename), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    ...globals,
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
  },
  './Components': { ArrowButton: 'ArrowButton', SubjectCard: 'SubjectCard', StepSection: 'StepSection' },
  './useHeroScroll': { useHeroScroll: () => ({ heroFade: 0, breadcrumbHeight: 0, breadcrumbRef: null }) },
  './pages-v2.module.scss': { default: {} },
  './start-here.module.scss': { default: {} },
  './GuideSection': { GuideSection: 'GuideSection' },
  './GuideContents': { GuideContents: 'GuideContents' },
})

function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}

test('Start Here retains five sections with a left table of contents and no numbered rail', () => {
  const tree = nodes(StartHere({ catalog: { ...catalog, articles: [] } }))
  const navigation = tree.filter(node => node.type === 'a' && node.props.href?.startsWith('#step-'))
  const sections = tree.filter(node => node.type === 'GuideSection')
  assert.equal(navigation.length, 0)
  assert.equal(tree.filter(node => node.type === 'aside').length, 1)
  assert.equal(tree.filter(node => node.type === 'GuideContents').length, 1)
  assert.equal(sections.length, 5)
  assert.deepEqual(
    sections.map(node => node.props.step.title),
    approvedTitles,
  )
  const heading = tree.find(node => node.type === 'h1')
  assert.ok(heading)
  assert.equal(heading.props.children[0] + heading.props.children[1].props.children, 'Understand CKB in 5 minutes')
  assert.ok(
    tree.some(
      node => node.type === 'strong' && node.props.children === "Bitcoin's principles. A new world of possibilities.",
    ),
  )
  const description =
    "Discover how CKB builds on Bitcoin's foundations to make blockchains more programmable, flexible, and ready for whatever comes next."
  assert.ok(tree.some(node => node.type === 'p' && node.props.children === description))
  assert.equal(tree.find(node => node.type === 'PreviewPage').props.description, description)
})

test('Start Here keeps the eight approved articles in order and reserves step five for actions', () => {
  const articles = catalog.articles.filter(article => article.language === 'en').reverse()
  const sections = nodes(StartHere({ catalog: { ...catalog, articles } })).filter(node => node.type === 'GuideSection')
  const selections = sections.map(node => Array.from(node.props.articles, article => article.id))
  assert.deepEqual(selections, approvedIds)
  assert.equal(selections.flat().length, 8)
  assert.equal(sections.at(-1).props.step.id, 'step-5')
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

const resourceEvents = []
const { StepSection } = loadModule('Components.tsx', {
  clsx: { default: (...values) => values.filter(Boolean).join(' ') },
  'next/link': { default: 'Link' },
  'next/image': { default: 'Image' },
  'react/jsx-runtime': require('react/jsx-runtime'),
  './Icon': { Icon: 'Icon' },
  './ArticleLanguageLink': { ArticleLanguageLink: 'ArticleLanguageLink' },
  './components.module.scss': { default: {} },
  './content': {},
  './analytics': { trackKBEvent: (name, data) => resourceEvents.push({ name, data: { ...data } }) },
  '../../utils/kb-hubs': kbHubs,
})

test('the first four steps retain their copy and step five restores the resource links', () => {
  guideSteps.slice(0, 4).forEach((step, index) => {
    const tree = nodes(StepSection({ step, index, articles: [] }))
    assert.equal(tree.find(node => node.type === 'section').props.id, `step-${index + 1}`)
    assert.equal(tree.find(node => node.type === 'h2').props.children, approvedTitles[index])
    assert.ok(tree.some(node => node.type === 'p' && node.props.children === step.summary))
    assert.ok(tree.some(node => node.type === 'p' && node.props.children === step.body))
    assert.equal(tree.filter(node => node.type === 'Link').length, 0)
    assert.equal(tree.filter(node => node.type === 'h3').length, 0)
    assert.ok(!tree.some(node => node.type === 'Icon' && node.props.name === 'topics-imgNumberFiveCircle'))
    assert.equal(step.actions, undefined)
  })
  const tree = nodes(StepSection({ step: guideSteps[4], index: 4, articles: [] }))
  assert.equal(tree.find(node => node.type === 'section').props.id, 'step-5')
  assert.ok(tree.some(node => node.type === 'Icon' && node.props.name === 'topics-imgNumberFiveCircle'))
  const actions = tree.filter(node => node.type === 'Link')
  assert.deepEqual(
    actions.map(node => node.props.href),
    ['https://ckbdapps.com/ecosystem', 'https://talk.nervos.org/', 'https://docs.nervos.org/'],
  )
  assert.deepEqual(
    actions.map(node => node.props['aria-label']),
    ['Explore CKB', 'Visit NervosTalk', 'Developer Docs & Quick Start'],
  )
  actions.forEach((action, index) => {
    const description = action.props.children[2].props.children
    const expected = guideSteps[4].actions[index]
    assert.equal(description.props.id, action.props['aria-describedby'])
    assert.equal(description.props.children.join(''), `${expected.title}: ${expected.description}`)
  })
  actions.forEach(action => action.props.onClick())
  assert.deepEqual(
    resourceEvents,
    ['ecosystem', 'community', 'developer_docs'].map((resource_id, index) => ({
      name: 'kb_resource_click',
      data: { resource_id, placement: 'start_here_actions', link_url: actions[index].props.href },
    })),
  )
})

function renderedText(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(renderedText).join('')
  return node ? renderedText(node.props?.children) : ''
}

const guideEvents = []
const { GuideSection } = loadModule('GuideSection.tsx', {
  clsx: { default: require('clsx') },
  'react/jsx-runtime': require('react/jsx-runtime'),
  './ArticleLanguageLink': { ArticleLanguageLink: 'ArticleLanguageLink' },
  './Icon': { Icon: 'Icon' },
  './analytics': { trackKBEvent: (name, data) => guideEvents.push({ name, data: { ...data } }) },
  './content': { articlePath: article => article.canonicalPath },
  './components.module.scss': { default: {} },
  './start-here.module.scss': { default: {} },
})

test('guide preserves all copy, article destinations and analytics with three icons per section', () => {
  guideEvents.length = 0
  guideSteps.forEach((step, index) => {
    const articles = approvedIds[index].map(id =>
      catalog.articles.find(article => article.id === id && article.language === 'en'),
    )
    const tree = nodes(GuideSection({ step, index, articles }))
    const section = tree.find(node => node.type === 'section')
    assert.equal(section.props.id, step.id)
    assert.equal(section.props.tabIndex, -1)
    assert.equal(section.props.children[0].type, 'h2')
    assert.equal(section.props['aria-labelledby'], `${step.id}-title`)
    assert.ok(tree.some(node => node.type === 'p' && node.props.children === step.summary))
    assert.ok(tree.some(node => node.type === 'p' && node.props.children === step.body))
    assert.ok(!tree.some(node => node.type === 'figure' || node.type === 'svg'))
    const icons = tree.filter(node => node.type === 'Icon' && node.props.size === 28).map(node => node.props)
    icons.push(
      ...tree
        .filter(node => node.props?.style?.maskImage)
        .map(node => ({
          name: node.props.style.maskImage.match(/\/([^/]+)\.svg/)[1],
          size: 28,
        })),
    )
    assert.equal(icons.length, 3)
    for (const icon of icons) {
      const filename = path.join(directory, '../../../public/images/knowledge-hub', `${icon.name}.svg`)
      const svg = new DOMParser().parseFromString(fs.readFileSync(filename, 'utf8'), 'image/svg+xml').documentElement
      const viewBoxWidth = Number(svg.getAttribute('viewBox').split(/\s+/)[2])
      // Compare rendered weight: a 24-unit icon needs a thinner stroke than a 40-unit icon.
      const renderedStroke = (Number(svg.getAttribute('stroke-width')) * icon.size) / viewBoxWidth
      assert.ok(Math.abs(renderedStroke - 1.05) < 0.001, `${icon.name} has a different rendered stroke`)
      assert.equal(svg.getAttribute('stroke'), '#111')
      assert.equal(svg.getAttribute('fill'), 'none')
      assert.equal(svg.getAttribute('stroke-linecap'), 'round')
      assert.equal(svg.getAttribute('stroke-linejoin'), 'round')
      for (const child of Array.from(svg.getElementsByTagName('*'))) {
        assert.ok(!child.hasAttribute('stroke-width'), `${icon.name} overrides the shared stroke`)
      }
    }
    for (const point of step.points) {
      const [title, ...parts] = point.split(':')
      assert.ok(tree.some(node => node.type === 'h3' && renderedText(node) === title))
      assert.ok(tree.some(node => node.type === 'p' && node.props.children === parts.join(':').trim()))
    }
    const links = tree.filter(node => node.type === 'ArticleLanguageLink')
    assert.equal(links.length, index < 4 ? 2 : 0)
    assert.equal(
      tree.filter(node => node.type === 'h3' && node.props.children === 'READ NEXT').length,
      index < 4 ? 1 : 0,
    )
    links.forEach((link, position) => {
      assert.equal(link.props.href, articles[position].canonicalPath)
      assert.ok(nodes(link).some(node => node.props?.children === articles[position].title))
      link.props.onClick()
      assert.deepEqual(guideEvents.at(-1), {
        name: 'kb_article_click',
        data: {
          placement: 'start_here_reading',
          step: index + 1,
          article_id: articles[position].id,
          hub_id: articles[position].hub ?? undefined,
          position: position + 1,
        },
      })
    })
    for (const action of step.actions ?? []) {
      assert.ok(tree.some(node => node.type === 'p' && node.props.children === action.description))
      const link = tree.find(node => node.type === 'a' && node.props.href === action.href)
      assert.equal(link.props['aria-label'], action.label)
      assert.ok(nodes(link).some(node => node.type === 'h3' && node.props.children === action.label))
      assert.ok(nodes(link).some(node => node.props?.id === link.props['aria-describedby']))
      assert.equal(link.props.target, '_blank')
      assert.equal(link.props.rel, 'noopener noreferrer')
      link.props.onClick()
      assert.deepEqual(guideEvents.at(-1), {
        name: 'kb_resource_click',
        data: {
          resource_id: action.resourceId,
          placement: 'start_here_actions',
          link_url: action.href,
        },
      })
    }
  })
})

const tocEvents = []
const contentsImports = {
  clsx: { default: require('clsx') },
  react: { useRef: () => ({ current: null }), useEffect: () => undefined },
  'react/jsx-runtime': require('react/jsx-runtime'),
  './guide-data': { guideSteps },
  './Shared': { useActiveSection: () => 'step-1-point-2' },
  './analytics': { trackKBEvent: (name, data) => tocEvents.push({ name, data: { ...data } }) },
  './article-v2.module.scss': { default: {} },
  './start-here.module.scss': { default: {} },
}
const { GuideContents, guideContents } = loadModule('GuideContents.tsx', contentsImports)

test('guide TOC targets real headings and discloses only the active section children', () => {
  const headings = new Set(
    guideSteps.flatMap((step, index) =>
      nodes(GuideSection({ step, index, articles: [] }))
        .filter(node => node.type === 'h2' || node.type === 'h3')
        .map(node => node.props.id),
    ),
  )
  const tree = nodes(GuideContents())
  const links = tree.filter(node => node.type === 'a')
  assert.equal(guideContents.length, 5)
  assert.equal(links.length, 25)
  for (const link of links) assert.ok(headings.has(link.props.href.slice(1)), link.props.href)
  const childLinks = links.filter(link => link.props.href.includes('-point-'))
  assert.equal(childLinks.length, 15)
  assert.equal(childLinks.filter(link => link.props.tabIndex !== -1).length, 3)
  assert.deepEqual(
    links.filter(link => link.props['aria-current'] === 'location').map(link => link.props.href),
    ['#step-1-point-2', '#step-1-title'],
  )
  tocEvents.length = 0
  links.find(link => link.props.href === '#step-4-title').props.onClick({ button: 0, ctrlKey: true })
  assert.deepEqual(tocEvents, [{ name: 'kb_step_select', data: { step: 4, step_name: guideSteps[3].title } }])
})

test('mobile contents closes, focuses the destination and respects reduced motion', () => {
  const disclosure = { open: true }
  const calls = []
  const heading = {
    scrollIntoView: options => calls.push(['scroll', { ...options }]),
    focus: options => calls.push(['focus', { ...options }]),
  }
  const { GuideContents: Contents } = loadModule('GuideContents.tsx', contentsImports, {
    document: { getElementById: id => (id === 'step-2-title' ? heading : null) },
    window: {
      matchMedia: () => ({ matches: true }),
      history: { state: null, replaceState: (...args) => calls.push(['history', ...args]) },
    },
  })
  const link = nodes(Contents())
    .filter(node => node.type === 'a' && node.props.href === '#step-2-title')
    .at(-1)
  link.props.onClick({
    button: 0,
    preventDefault: () => calls.push(['preventDefault']),
    currentTarget: { closest: () => disclosure },
  })
  assert.equal(disclosure.open, false)
  assert.deepEqual(calls, [
    ['preventDefault'],
    ['history', null, '', '#step-2-title'],
    ['scroll', { block: 'start', behavior: 'instant' }],
    ['focus', { preventScroll: true }],
  ])
})
