import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

const directory = path.dirname(fileURLToPath(import.meta.url))

function renderFooter(newsletter = {}) {
  const events = []
  const signup = { onSubmit: () => undefined, isSubmitting: false, status: '', isError: false, ...newsletter }
  const filename = path.join(directory, 'KnowledgeFooter.tsx')
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  const imports = {
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': { default: 'a' },
    'next/image': { default: 'img' },
    '../Footer/logo.svg': { default: 'svg' },
    './footer-v2.module.scss': { default: {} },
    './analytics': {
      trackKBEvent: (name, data) => events.push({ name, data: { ...data } }),
    },
    './useNewsletterSignup': {
      useNewsletterSignup: placement => {
        assert.equal(placement, 'footer')
        return signup
      },
    },
  }
  vm.runInNewContext(outputText, {
    exports,
    require: name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected footer dependency: ${name}`)
      return imports[name]
    },
  })
  return { tree: exports.KnowledgeFooter(), events, signup }
}

function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  return [node, ...nodes(node.props?.children)]
}

test('footer navigation emits existing IDs plus visible text and URL without changing destinations or opening behavior', () => {
  const { tree, events } = renderFooter()
  const navigation = nodes(tree).find(node => node.props?.['aria-label'] === 'Footer navigation')
  const links = nodes(navigation).filter(node => node.props?.href)
  const destinations = [
    ['CKB', '/ckbpage'],
    ['Mining', '/mining'],
    ['Wallets', '/wallets'],
    ['Wiki', 'https://en.wikipedia.org/wiki/Nervos_Network'],
    ['Press Kit', '/media-kit'],
    ['Developers', '/developers'],
    ['Documentation', 'https://docs.nervos.org/'],
    ['Github', 'https://github.com/nervosnetwork/'],
    ['Explorer', 'https://explorer.nervos.org/'],
    ['Ecosystem', 'https://ckbdapps.com/ecosystem'],
    ['Nervos Foundation', '/foundation'],
    ['Cryptape', 'https://cryptape.com/'],
    ['Godwoken', 'https://godwoken.com/'],
    ['Nervina Labs', 'https://nervina.io/'],
    ['Tunnel Vision Labs', 'https://tunnelvisionlabs.xyz/'],
    ['Community', '/community'],
    ['Community Fund DAO', 'https://dao.ckb.community/'],
    ['Nervos Talk Forum', 'https://talk.nervos.org/'],
    ['RFCs', 'https://github.com/nervosnetwork/rfcs/'],
    ['Learn', '/learn'],
    ['Knowledge Base', '/knowledge-base'],
    ['Blog', 'https://archive.nervos.org/blog'],
    ['Medium', 'https://medium.com/nervosnetwork'],
    ['Youtube', 'https://www.youtube.com/c/NervosNetwork'],
  ]
  assert.equal(links.length, 24)
  assert.deepEqual(
    links.map(link => [link.props.children[0], link.props.href]),
    destinations,
  )
  assert.equal(events.length, 0, 'Rendering alone must not count as navigation')
  const resourceIds = { Documentation: 'developer_docs', Github: 'github', Explorer: 'explorer' }
  for (const link of links) {
    assert.equal(link.props.target, '_blank')
    assert.equal(link.props.rel, 'noopener noreferrer')
    const before = events.length
    link.props.onClick()
    const resourceId = resourceIds[link.props.children[0]]
    assert.equal(events.length - before, resourceId ? 2 : 1)
    assert.equal(events[before].name, 'kb_footer_link_click')
    if (resourceId) {
      assert.deepEqual(events[before + 1], {
        name: 'kb_resource_click',
        data: { resource_id: resourceId, placement: 'footer', link_url: link.props.href },
      })
    }
  }
  const footerEvents = events.filter(event => event.name === 'kb_footer_link_click')
  assert.equal(footerEvents.length, links.length)
  assert.equal(events.length, links.length + 3)
  assert.deepEqual(
    footerEvents.map(event => [event.data.link_text, event.data.link_url]),
    destinations,
  )
  assert.deepEqual(
    footerEvents.map(event => event.data.link_id),
    [
      'ckb',
      'mining',
      'wallets',
      'wiki',
      'press_kit',
      'developers_heading',
      'documentation',
      'github',
      'explorer',
      'ecosystem_heading',
      'nervos_foundation',
      'cryptape',
      'godwoken',
      'nervina_labs',
      'tunnel_vision_labs',
      'community_heading',
      'community_fund_dao',
      'nervos_talk_forum',
      'rfcs',
      'learn_heading',
      'knowledge_base',
      'blog',
      'medium',
      'youtube',
    ],
  )
  for (const event of footerEvents) {
    assert.equal(event.name, 'kb_footer_link_click')
    assert.deepEqual(Object.keys(event.data).sort(), ['group', 'link_id', 'link_text', 'link_url'])
    assert.match(event.data.group, /^(discover|developers|ecosystem|community|learn)$/)
  }
})

test('footer social links include the selected network and real URL without changing destinations', () => {
  const { tree, events } = renderFooter()
  const links = nodes(tree).filter(node => node.props?.href && node.props?.['aria-label'])
  const destinations = [
    'https://x.com/NervosNetwork',
    'https://discord.gg/FKh8Zzvwqa',
    'https://t.me/NervosNetwork',
    'https://www.linkedin.com/company/nervos',
    'https://www.reddit.com/r/NervosNetwork/',
    'https://www.youtube.com/c/NervosNetwork',
    'https://talk.nervos.org/',
  ]
  assert.equal(links.length, 7)
  assert.deepEqual(
    links.map(link => link.props.href),
    destinations,
  )
  for (const link of links) {
    assert.equal(link.props.target, '_blank')
    assert.equal(link.props.rel, 'noopener noreferrer')
    link.props.onClick()
  }
  assert.deepEqual(
    events.map(event => event.data.link_url),
    destinations,
  )
  assert.deepEqual(
    events.map(event => event.data.network),
    ['twitter', 'discord', 'telegram', 'linkedin', 'reddit', 'youtube', 'talk'],
  )
  for (const event of events) {
    assert.equal(event.name, 'kb_social_click')
    assert.deepEqual(Object.keys(event.data).sort(), ['link_url', 'network', 'placement'])
    assert.equal(event.data.placement, 'footer')
  }
})

test('footer email form uses the shared real signup handler and disables controls while pending', () => {
  let submitted
  const { tree, events } = renderFooter({
    isSubmitting: true,
    status: 'Submitting…',
    onSubmit: event => (submitted = event),
  })
  const form = nodes(tree).find(node => node.type === 'form')
  const submission = {}
  form.props.onSubmit(submission)
  assert.equal(submitted, submission)
  assert.equal(form.props['aria-busy'], true)
  const input = nodes(form).find(node => node.type === 'input')
  assert.equal(input.props.name, 'email')
  assert.equal(input.props.required, true)
  assert.equal(input.props.disabled, true)
  assert.equal(nodes(form).find(node => node.type === 'button').props.disabled, true)
  assert.deepEqual(events, [], 'Rendering the form does not emit a submission event')
})
