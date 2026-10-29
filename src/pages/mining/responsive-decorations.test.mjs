import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DOMParser } from '@xmldom/xmldom'
import clsx from 'clsx'
import ts from 'typescript'
import * as sass from 'sass'
import postcss from 'postcss'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const require = createRequire(import.meta.url)
const read = filename => fs.readFileSync(path.join(root, filename), 'utf8')
const styles = new Proxy({}, { get: (_, key) => key })
const element = React.createElement
const svg = props => element('svg', props)
const empty = () => null

function evaluate(source, imports = {}, globals = {}) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  })
  const loaded = { exports: {} }
  vm.runInNewContext(outputText, {
    module: loaded,
    exports: loaded.exports,
    ...globals,
    require: name => {
      if (name === 'react/jsx-runtime') return require(name)
      assert.ok(Object.hasOwn(imports, name), `Unexpected runtime import: ${name}`)
      return imports[name]
    },
  })
  return loaded.exports
}

const { BaseSeparatePage } = evaluate(read('src/components/BaseSeparatePage/index.tsx'), {
  react: React,
  clsx,
  './index.module.scss': { __esModule: true, default: styles },
  './Description': { Description: empty },
  './Functions': { Functions: empty },
  './Header': { Header: ({ className, title, floatIcons }) => element('div', { className }, title, floatIcons) },
  './Info': { Info: empty },
  './Resources': { Resources: empty },
  './Positions': { Positions: empty },
  './Sidebar': { Sidebar: empty },
  './ContributorsDialog': { ContributorsDialog: empty },
  './Supports': { Supports: empty },
  '../Page': { Page: ({ openGraph: _openGraph, children, ...props }) => element('div', props, children) },
  '../TableOfContents': { TOCContextProvider: ({ children }) => children },
})

function mining(globals = {}) {
  return evaluate(
    read('src/pages/mining/index.page.tsx'),
    {
      'next/head': empty,
      'next/router': { useRouter: () => ({ pathname: '/mining' }) },
      'next-i18next': {
        useTranslation: () => [key => key, { language: 'en' }],
        Trans: ({ children }) => children,
      },
      'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
      '../../server/page-seo': { withStaticPageSEO: (_route, handler) => handler },
      '../../components/BaseSeparatePage': { BaseSeparatePage },
      '../../components/StyledLink': { StyledLink: ({ children }) => element('a', null, children) },
      '../../utils': { BASE_URL: 'https://www.nervos.org', REPO: 'nervosnetwork/website' },
      './embellished_left.svg': props => svg({ 'data-decoration': 'left', ...props }),
      './embellished_right.svg': props => svg({ 'data-decoration': 'right', ...props }),
      './index.module.scss': { __esModule: true, default: styles },
      './icons': { CkbPowFloatIconGroup: svg, HeartIcon: svg },
    },
    globals,
  ).default
}

function ckb(globals = {}) {
  return evaluate(
    read('src/pages/ckbpage/index.page.tsx'),
    {
      'next/head': empty,
      'next/router': { useRouter: () => ({ pathname: '/ckbpage' }) },
      'next-i18next': {
        useTranslation: () => [key => key, { language: 'en' }],
        Trans: ({ children }) => children,
      },
      'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
      '../../server/page-seo': { withStaticPageSEO: (_route, handler) => handler },
      'src/components/BaseSeparatePage': { BaseSeparatePage },
      'src/components/StyledLink': { StyledLink: ({ children }) => element('a', null, children) },
      'src/utils': { BASE_URL: 'https://www.nervos.org', REPO: 'nervosnetwork/website' },
      './embellished.svg': props => svg({ 'data-decoration': 'ckb', ...props }),
      './index.module.scss': { __esModule: true, default: styles },
      './icons': { CkbPageFloatIconGroup: svg },
    },
    globals,
  ).default
}

function developers(globals = {}, themeCalls = []) {
  return evaluate(
    read('src/pages/developers/index.page.tsx'),
    {
      'next/head': empty,
      'next/router': { useRouter: () => ({ pathname: '/developers' }) },
      'next-i18next': { useTranslation: () => [key => key, { language: 'en' }] },
      'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
      '../../server/page-seo': { withStaticPageSEO: (_route, handler) => handler },
      'src/components/BaseSeparatePage': { BaseSeparatePage },
      'src/utils': { BASE_URL: 'https://www.nervos.org', REPO: 'nervosnetwork/website' },
      'src/styles/presets.module.scss': { __esModule: true, default: styles },
      '../../hooks': { useBodyClass: classes => themeCalls.push([...classes]) },
      './embellished_left.svg': props => svg({ 'data-decoration': 'left', ...props }),
      './embellished_right.svg': props => svg({ 'data-decoration': 'right', ...props }),
      './index.module.scss': { __esModule: true, default: styles },
      './icons': { ArticlesIcon: svg, BallsIcon: svg, QuoteIcon: svg, SunIcon: svg },
    },
    globals,
  ).default
}

function community(globals = {}, themeCalls = []) {
  return evaluate(
    read('src/pages/community/index.page.tsx'),
    {
      'next/head': empty,
      'next/router': { useRouter: () => ({ pathname: '/community' }) },
      'next-i18next': {
        useTranslation: () => [key => key, { language: 'en' }],
        Trans: ({ children }) => children,
      },
      'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
      '../../server/page-seo': { withStaticPageSEO: (_route, handler) => handler },
      'src/components/BaseSeparatePage': { BaseSeparatePage },
      'src/components/StyledLink': { StyledLink: ({ children }) => element('a', null, children) },
      'src/utils': { BASE_URL: 'https://www.nervos.org', REPO: 'nervosnetwork/website' },
      '../../styles/presets.module.scss': { __esModule: true, default: styles },
      '../../hooks': { useBodyClass: classes => themeCalls.push([...classes]) },
      './embellished_left.svg': props => svg({ 'data-decoration': 'left', ...props }),
      './embellished_right.svg': props => svg({ 'data-decoration': 'right', ...props }),
      './index.module.scss': { __esModule: true, default: styles },
      './icons': { CommunityHubFloatIconGroup: svg },
    },
    globals,
  ).default
}

function learn(globals = {}) {
  return evaluate(
    read('src/pages/learn/index.page.tsx'),
    {
      'next/head': empty,
      'next/router': { useRouter: () => ({ pathname: '/learn' }) },
      'next-i18next': {
        useTranslation: () => [key => key, { language: 'en' }],
        Trans: ({ children }) => children,
      },
      'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
      '../../server/page-seo': { withStaticPageSEO: (_route, handler) => handler },
      'src/components/BaseSeparatePage': { BaseSeparatePage },
      'src/components/StyledLink': { StyledLink: ({ children }) => element('a', null, children) },
      'src/utils': { BASE_URL: 'https://www.nervos.org', REPO: 'nervosnetwork/website' },
      './embellished_left.svg': props => svg({ 'data-decoration': 'left', ...props }),
      './embellished_right.svg': props => svg({ 'data-decoration': 'right', ...props }),
      './index.module.scss': { __esModule: true, default: styles },
      './icons': { LearnFloatIconGroup: svg, KnowledgeBaseIcon: svg },
    },
    globals,
  ).default
}

const { ExternalSvg } = evaluate(read('src/components/ExternalSvg/index.tsx'))

function wallets(globals = {}) {
  return evaluate(
    read('src/pages/wallets/index.page.tsx'),
    {
      'next/head': empty,
      'next/router': { useRouter: () => ({ pathname: '/wallets' }) },
      'next-i18next': { useTranslation: () => [key => key, { language: 'en' }] },
      'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
      '../../server/page-seo': { withStaticPageSEO: (_route, handler) => handler },
      'src/components/BaseSeparatePage': { BaseSeparatePage },
      'src/components/ExternalSvg': { ExternalSvg },
      'src/components/StyledLink': { StyledLink: ({ children }) => element('a', null, children) },
      'src/utils': { BASE_URL: 'https://www.nervos.org', REPO: 'nervosnetwork/website' },
      './embellished_left.svg?url': { src: '/_next/static/media/left.12345678.svg', width: 744, height: 459 },
      './embellished_right.svg?url': { src: '/_next/static/media/right.12345678.svg', width: 595, height: 310 },
      './index.module.scss': { __esModule: true, default: styles },
      './icons': {
        WalletIcon: svg,
        NeuronWalletIcon: svg,
        CkbBullIcon: svg,
        JoyIdIcon: svg,
        SafePalIcon: svg,
        LedgerIcon: svg,
        OperaWalletIcon: svg,
        ImTokenIcon: svg,
        OneKey: svg,
        ReiWallet: svg,
        GateWeb3Wallet: svg,
        UTXOGlobalWallet: svg,
        ImKey: svg,
        CoinEx: svg,
      },
    },
    globals,
  ).default
}

function document(html) {
  return new DOMParser().parseFromString(html, 'text/html')
}
function decorations(html) {
  return Array.from(document(html).getElementsByTagName('div')).filter(node =>
    node.getAttribute('class').split(/\s+/).includes('embellishedElement'),
  )
}
function renderBase(embellishedElements) {
  return renderToStaticMarkup(
    element(BaseSeparatePage, {
      embellishedElements,
      title: 'Existing title',
      functions: [],
      contributors: [],
      author: null,
    }),
  )
}

test('Mining renders the same two decorations on the server and in mobile/desktop client environments', () => {
  const source = read('src/pages/mining/index.page.tsx')
  assert.doesNotMatch(source, /\b(?:useIsMobile|useMediaQuery|matchMedia|innerWidth)\b/)
  const server = renderToStaticMarkup(element(mining(), { contributors: [], author: null }))
  for (const width of [390, 750, 751, 1440]) {
    const window = {
      innerWidth: width,
      matchMedia() {
        assert.fail('Mining decorative geometry must not read a client media query')
      },
    }
    const client = renderToStaticMarkup(element(mining({ window }), { contributors: [], author: null }))
    assert.equal(client, server, `Identical render inputs produce identical markup at ${width}px`)
  }
  const nodes = decorations(server)
  assert.equal(nodes.length, 2)
  for (const [index, name, height] of [
    [0, 'Left', '420'],
    [1, 'Right', '459'],
  ]) {
    const wrapper = nodes[index]
    assert.equal(wrapper.getAttribute('class'), `embellishedElement embellished${name}`)
    assert.equal(wrapper.hasAttribute('style'), false, 'Inline offsets must not override the responsive CSS')
    const images = Array.from(wrapper.getElementsByTagName('svg'))
    assert.equal(images.length, 1)
    assert.equal(images[0].getAttribute('width'), '744')
    assert.equal(images[0].getAttribute('height'), height)
    assert.equal(images[0].getAttribute('data-decoration'), name.toLowerCase())
    assert.equal(images[0].getAttribute('style'), index ? 'transform:rotate(180deg)' : '')
  }
})

test('CKB renders identical decoration markup in server and mobile/desktop client environments', () => {
  const source = read('src/pages/ckbpage/index.page.tsx')
  assert.doesNotMatch(source, /\b(?:useIsMobile|useMediaQuery|matchMedia|innerWidth)\b/)
  const server = renderToStaticMarkup(element(ckb(), { contributors: [], author: null }))
  for (const width of [320, 390, 750, 751, 1280]) {
    const window = {
      innerWidth: width,
      matchMedia() {
        assert.fail('CKB decorative geometry must not read a client media query')
      },
    }
    assert.equal(renderToStaticMarkup(element(ckb({ window }), { contributors: [], author: null })), server)
  }
  const nodes = decorations(server)
  assert.equal(nodes.length, 2)
  for (const [index, name] of [
    [0, 'Left'],
    [1, 'Right'],
  ]) {
    const wrapper = nodes[index]
    assert.equal(wrapper.getAttribute('class'), `embellishedElement embellished${name}`)
    assert.equal(wrapper.hasAttribute('style'), false, 'No inline positions override mobile CSS')
    const images = Array.from(wrapper.getElementsByTagName('svg'))
    assert.equal(images.length, 1)
    assert.equal(images[0].getAttribute('data-decoration'), 'ckb')
    assert.equal(images[0].getAttribute('width'), '940')
    assert.equal(images[0].getAttribute('height'), '503')
    assert.equal(images[0].getAttribute('style'), index ? '' : 'transform:rotateX(180deg)')
  }
})

test('Developers keeps its dark theme and identical decoration markup in server and mobile/desktop environments', () => {
  assert.doesNotMatch(
    read('src/pages/developers/index.page.tsx'),
    /\b(?:useIsMobile|useMediaQuery|matchMedia|innerWidth)\b/,
  )
  const themeCalls = []
  const server = renderToStaticMarkup(element(developers({}, themeCalls), { contributors: [], author: null }))
  for (const width of [320, 390, 750, 751, 1280]) {
    const window = {
      innerWidth: width,
      matchMedia() {
        assert.fail('Developers decorative geometry must not read a client media query')
      },
    }
    assert.equal(
      renderToStaticMarkup(element(developers({ window }, themeCalls), { contributors: [], author: null })),
      server,
    )
  }
  assert.deepEqual(
    themeCalls,
    Array.from({ length: 6 }, () => ['themeDark']),
  )
  const nodes = decorations(server)
  assert.equal(nodes.length, 2)
  for (const [index, name, height] of [
    [0, 'Left', '459'],
    [1, 'Right', '420'],
  ]) {
    const wrapper = nodes[index]
    assert.equal(wrapper.getAttribute('class'), `embellishedElement embellished${name}`)
    assert.equal(wrapper.hasAttribute('style'), false, 'No inline offsets override responsive CSS')
    const images = Array.from(wrapper.getElementsByTagName('svg'))
    assert.equal(images.length, 1)
    assert.equal(images[0].getAttribute('data-decoration'), name.toLowerCase())
    assert.equal(images[0].getAttribute('width'), '744')
    assert.equal(images[0].getAttribute('height'), height)
    assert.equal(images[0].getAttribute('style'), 'transform:rotate(180deg)')
  }
})

test('Community retains its dark theme and stable decoration markup without client media queries', () => {
  assert.doesNotMatch(
    read('src/pages/community/index.page.tsx'),
    /\b(?:useIsMobile|useMediaQuery|matchMedia|innerWidth)\b/,
  )
  const themeCalls = []
  const server = renderToStaticMarkup(element(community({}, themeCalls), { contributors: [], author: null }))
  for (const width of [320, 390, 750, 751, 1280]) {
    const window = {
      innerWidth: width,
      matchMedia() {
        assert.fail('Community decorative geometry must not read a client media query')
      },
    }
    assert.equal(
      renderToStaticMarkup(element(community({ window }, themeCalls), { contributors: [], author: null })),
      server,
    )
  }
  assert.deepEqual(
    themeCalls,
    Array.from({ length: 6 }, () => ['themeDark']),
  )
  const nodes = decorations(server)
  assert.equal(nodes.length, 2)
  for (const [index, name, width, height] of [
    [0, 'Left', '940', '503'],
    [1, 'Right', '744', '459'],
  ]) {
    const wrapper = nodes[index]
    assert.equal(wrapper.getAttribute('class'), `embellishedElement embellished${name}`)
    assert.equal(wrapper.hasAttribute('style'), false, 'No inline offsets override responsive CSS')
    const images = Array.from(wrapper.getElementsByTagName('svg'))
    assert.equal(images.length, 1)
    assert.equal(images[0].getAttribute('data-decoration'), name.toLowerCase())
    assert.equal(images[0].getAttribute('width'), width)
    assert.equal(images[0].getAttribute('height'), height)
    assert.equal(images[0].getAttribute('style'), index ? 'transform:rotate(180deg)' : '')
  }
})

test('Learn renders identical decorations without reading client media queries', () => {
  assert.doesNotMatch(read('src/pages/learn/index.page.tsx'), /\b(?:useIsMobile|useMediaQuery|matchMedia|innerWidth)\b/)
  const server = renderToStaticMarkup(element(learn(), { contributors: [], author: null }))
  for (const width of [320, 390, 750, 751, 1280]) {
    const window = {
      innerWidth: width,
      matchMedia() {
        assert.fail('Learn decorative geometry must not read a client media query')
      },
    }
    assert.equal(renderToStaticMarkup(element(learn({ window }), { contributors: [], author: null })), server)
  }
  const nodes = decorations(server)
  assert.equal(nodes.length, 2)
  for (const [index, name, width, height] of [
    [0, 'Left', '595', '310'],
    [1, 'Right', '940', '503'],
  ]) {
    const wrapper = nodes[index]
    assert.equal(wrapper.getAttribute('class'), `embellishedElement embellished${name}`)
    assert.equal(wrapper.hasAttribute('style'), false, 'No inline offsets override responsive CSS')
    const images = Array.from(wrapper.getElementsByTagName('svg'))
    assert.equal(images.length, 1)
    assert.equal(images[0].getAttribute('data-decoration'), name.toLowerCase())
    assert.equal(images[0].getAttribute('width'), width)
    assert.equal(images[0].getAttribute('height'), height)
    assert.equal(images[0].hasAttribute('style'), false, 'Neither original Learn SVG has a transform')
  }
})

test('BaseSeparatePage merges an optional decoration class without overriding legacy inline positions', () => {
  const [wrapper] = decorations(
    renderBase([
      { content: svg({ 'data-original': 'retained' }), className: 'custom-decoration', top: 0, right: -49, left: 210 },
    ]),
  )
  assert.equal(wrapper.getAttribute('class'), 'embellishedElement custom-decoration')
  assert.equal(wrapper.getAttribute('style'), 'top:0;right:-49px;left:210px')
  assert.equal(wrapper.getElementsByTagName('svg')[0].getAttribute('data-original'), 'retained')
  assert.equal(decorations(renderBase(undefined)).length, 0, 'The decoration array remains optional')
})

test('Wallets renders stable external decorations without inline offsets or a conflicting right-image transform', () => {
  assert.doesNotMatch(
    read('src/pages/wallets/index.page.tsx'),
    /\b(?:useIsMobile|useMediaQuery|matchMedia|innerWidth)\b/,
  )
  const server = renderToStaticMarkup(element(wallets(), { contributors: [], author: null }))
  for (const width of [320, 390, 750, 751, 1280]) {
    const window = {
      innerWidth: width,
      matchMedia() {
        assert.fail('Wallets decorative geometry must not read a client media query')
      },
    }
    assert.equal(renderToStaticMarkup(element(wallets({ window }), { contributors: [], author: null })), server)
  }
  const nodes = decorations(server)
  assert.equal(nodes.length, 2)
  for (const [index, name, width, height] of [
    [0, 'Left', '744', '459'],
    [1, 'Right', '595', '310'],
  ]) {
    const wrapper = nodes[index]
    assert.equal(wrapper.getAttribute('class'), `embellishedElement embellished${name}`)
    assert.equal(wrapper.hasAttribute('style'), false, 'No inline offsets override responsive CSS')
    const images = Array.from(wrapper.getElementsByTagName('img'))
    assert.equal(images.length, 1)
    assert.equal(wrapper.getElementsByTagName('svg').length, 0, 'Keep the existing external SVG delivery')
    assert.equal(images[0].getAttribute('src'), `/_next/static/media/${name.toLowerCase()}.12345678.svg`)
    assert.equal(images[0].getAttribute('width'), width)
    assert.equal(images[0].getAttribute('height'), height)
    assert.ok(images[0].hasAttribute('alt'))
    assert.equal(images[0].getAttribute('alt'), '')
    assert.equal(images[0].hasAttribute('loading'), false, 'Do not change image loading priority')
    assert.equal(images[0].getAttribute('style'), index ? '' : 'transform:rotate(-90deg);transform-origin:right top')
  }
})

function stylesheet(filename) {
  return postcss.parse(sass.compile(path.join(root, filename), { loadPaths: [root], logger: sass.Logger.silent }).css)
}
const miningCSS = stylesheet('src/pages/mining/index.module.scss')
const ckbCSS = stylesheet('src/pages/ckbpage/index.module.scss')
const developersCSS = stylesheet('src/pages/developers/index.module.scss')
const communityCSS = stylesheet('src/pages/community/index.module.scss')
const learnCSS = stylesheet('src/pages/learn/index.module.scss')
const walletsCSS = stylesheet('src/pages/wallets/index.module.scss')

function declarations(css, selector, width) {
  const result = {}
  css.walkRules(rule => {
    if (!rule.selectors.includes(selector)) return
    let applies = true
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type !== 'atrule') continue
      assert.equal(parent.name, 'media', `Unexpected conditional rule for ${selector}`)
      const match = /^\(max-width: (\d+)px\)$/.exec(parent.params)
      assert.ok(match, `Unrecognized media condition: ${parent.params}`)
      assert.equal(match[1], '750', 'Use the existing shared mobile breakpoint')
      applies &&= width <= Number(match[1])
    }
    if (applies)
      rule.walkDecls(declaration => {
        assert.equal(declaration.important, undefined, 'No specificity override is needed')
        result[declaration.prop] = declaration.value
      })
  })
  return result
}

test('compiled Sass preserves the original decoration sizes and coordinates on both sides of 750px', () => {
  for (const width of [320, 390, 750, 751, 1440]) {
    const mobile = width <= 750
    assert.deepEqual(declarations(miningCSS, '.embellishedLeft', width), {
      top: mobile ? '151px' : '146px',
      right: mobile ? '-49px' : '484px',
    })
    assert.deepEqual(declarations(miningCSS, '.embellishedRight', width), {
      top: mobile ? '443px' : '397px',
      left: mobile ? '-81px' : '210px',
    })
    assert.deepEqual(declarations(miningCSS, '.embellishedLeft > svg', width), {
      width: mobile ? '430px' : '744px',
      height: mobile ? '242px' : '420px',
    })
    assert.deepEqual(declarations(miningCSS, '.embellishedRight > svg', width), {
      width: mobile ? '430px' : '744px',
      height: mobile ? '265px' : '459px',
    })
  }
})

test('CKB compiled Sass preserves every original size and position at and around the existing 750px breakpoint', () => {
  for (const width of [320, 390, 750, 751, 1280]) {
    const mobile = width <= 750
    assert.deepEqual(declarations(ckbCSS, '.embellishedLeft', width), {
      top: mobile ? '453px' : '450px',
      right: mobile ? '-8px' : '518px',
    })
    assert.deepEqual(declarations(ckbCSS, '.embellishedRight', width), {
      top: mobile ? '79px' : '382px',
      left: mobile ? '-55px' : '142px',
    })
    for (const name of ['Left', 'Right']) {
      assert.deepEqual(declarations(ckbCSS, `.embellished${name} > svg`, width), {
        width: mobile ? '548px' : '940px',
        height: mobile ? '292px' : '503px',
      })
    }
  }
})

test('Developers compiled Sass preserves both original decoration geometries across the 750px breakpoint', () => {
  for (const width of [320, 390, 750, 751, 1280]) {
    const mobile = width <= 750
    assert.deepEqual(declarations(developersCSS, '.embellishedLeft', width), {
      top: mobile ? '462px' : '474px',
      right: mobile ? '51px' : '488px',
    })
    assert.deepEqual(declarations(developersCSS, '.embellishedRight', width), {
      top: mobile ? '64px' : '102px',
      left: mobile ? '-166px' : '596px',
    })
    assert.deepEqual(declarations(developersCSS, '.embellishedLeft > svg', width), {
      width: mobile ? '430px' : '744px',
      height: mobile ? '267px' : '459px',
    })
    assert.deepEqual(declarations(developersCSS, '.embellishedRight > svg', width), {
      width: mobile ? '430px' : '744px',
      height: mobile ? '245px' : '420px',
    })
  }
})

test('Community compiled Sass preserves all original decoration sizes and offsets across 750px', () => {
  for (const width of [320, 390, 750, 751, 1280]) {
    const mobile = width <= 750
    assert.deepEqual(declarations(communityCSS, '.embellishedLeft', width), {
      top: mobile ? '52px' : '154px',
      right: mobile ? '-146px' : '296px',
    })
    assert.deepEqual(declarations(communityCSS, '.embellishedRight', width), {
      top: mobile ? '443px' : '568px',
      left: mobile ? '-47px' : '404px',
    })
    assert.deepEqual(declarations(communityCSS, '.embellishedLeft > svg', width), {
      width: mobile ? '548px' : '940px',
      height: mobile ? '292px' : '503px',
    })
    assert.deepEqual(declarations(communityCSS, '.embellishedRight > svg', width), {
      width: mobile ? '430px' : '744px',
      height: mobile ? '267px' : '459px',
    })
  }
})

test('Learn compiled Sass preserves all original decoration geometry across the 750px breakpoint', () => {
  for (const width of [320, 390, 750, 751, 1280]) {
    const mobile = width <= 750
    assert.deepEqual(declarations(learnCSS, '.embellishedLeft', width), {
      top: mobile ? '467px' : '525px',
      right: mobile ? '-17px' : '420px',
    })
    assert.deepEqual(declarations(learnCSS, '.embellishedRight', width), {
      top: mobile ? '65px' : '-40px',
      left: mobile ? '-74px' : '100px',
    })
    assert.deepEqual(declarations(learnCSS, '.embellishedLeft > svg', width), {
      width: mobile ? '374px' : '595px',
      height: mobile ? '196px' : '310px',
    })
    assert.deepEqual(declarations(learnCSS, '.embellishedRight > svg', width), {
      width: mobile ? '581px' : '940px',
      height: mobile ? '311px' : '503px',
    })
  }
})

test('Wallets compiled CSS retains original offsets, sizes, mobile rotation and desktop transform origin', () => {
  // The repeated desktop widths also guard the CSS state after resizing back from mobile.
  for (const width of [1280, 320, 390, 750, 751, 390, 1280]) {
    const mobile = width <= 750
    assert.deepEqual(declarations(walletsCSS, '.embellishedLeft', width), {
      top: mobile ? '264px' : '117px',
      right: mobile ? '273px' : '855px',
    })
    assert.deepEqual(declarations(walletsCSS, '.embellishedRight', width), {
      top: mobile ? '70px' : '425px',
      left: mobile ? '38px' : '114px',
    })
    assert.deepEqual(declarations(walletsCSS, '.embellishedLeft > img', width), {
      width: mobile ? '430px' : '744px',
      height: mobile ? '265px' : '459px',
    })
    assert.deepEqual(declarations(walletsCSS, '.embellishedRight > img', width), {
      width: mobile ? '374px' : '595px',
      height: mobile ? '196px' : '310px',
      transform: mobile ? 'scaleX(-1) rotate(90deg)' : 'scaleX(-1)',
      'transform-origin': mobile ? 'left top' : '50% 50%',
    })
  }
})

test('decoration CSS stays out of document flow and preserves the existing hero height', () => {
  const baseCSS = stylesheet('src/components/BaseSeparatePage/index.module.scss')
  const headerCSS = stylesheet('src/components/BaseSeparatePage/Header/index.module.scss')
  for (const width of [390, 1440]) {
    const container = declarations(baseCSS, '.baseSeparatePage .embellishedElementsContainer', width)
    assert.equal(container.position, 'absolute')
    assert.equal(container.overflow, 'hidden')
    const anchor = declarations(baseCSS, '.baseSeparatePage .embellishedElements', width)
    assert.equal(anchor.width, '0')
    assert.equal(anchor.height, '0')
    assert.equal(anchor.margin, '0 auto')
    assert.equal(
      declarations(baseCSS, '.baseSeparatePage .embellishedElements .embellishedElement', width).position,
      'absolute',
    )
    assert.equal(declarations(headerCSS, '.headerContent', width).height, width <= 750 ? '549px' : '610px')
  }
  for (const css of [miningCSS, ckbCSS, developersCSS, communityCSS, learnCSS, walletsCSS]) {
    css.walkDecls(/^(?:min-)?height$/, declaration => {
      if (declaration.parent.selector.includes('embellished')) assert.equal(declaration.prop, 'height')
    })
  }
})
