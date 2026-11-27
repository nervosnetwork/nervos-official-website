import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import ts from 'typescript'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { informationPages } from '../../config/information-pages.mjs'
import * as siteIndexing from '../../config/site-indexing.mjs'
import i18nConfig from '../../next-i18next.config.js'

const repository = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)
function load(filename, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(repository, filename), 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    name => (Object.hasOwn(dependencies, name) ? dependencies[name] : require(name)),
    module,
    module.exports,
  )
  return module.exports
}
const sharing = load('src/utils/sharing-urls.ts')
const seo = load('src/server/page-seo.ts', {
  '../utils/sharing-urls': sharing,
  './kb-content': {},
  '../../next-i18next.config': i18nConfig,
  '../utils/kb-hubs': {},
  '../../config/site-indexing.mjs': siteIndexing,
  './structured-data': { kbCollectionStructuredData: () => [] },
})
const translationCalls = []
const gitCalls = []
const touchHash = 'a'.repeat(40)
const touchRevision = `${touchHash} 2026-11-26T09:30:00+08:00\n`
const missingShallowFile = () => {
  throw Object.assign(new Error('There is no shallow boundary file'), { code: 'ENOENT' })
}
const props = load('src/server/information-page.ts', {
  'node:child_process': {
    execFileSync: (...args) => {
      gitCalls.push(args)
      return args[1][0] === 'log' ? touchRevision : '.git/shallow\n'
    },
  },
  'node:fs': { readFileSync: missingShallowFile },
  'next-i18next/serverSideTranslations': {
    serverSideTranslations: async (...args) => {
      translationCalls.push(args)
      return { _nextI18Next: { initialLocale: args[0] } }
    },
  },
  '../../config/information-pages.mjs': { informationPages },
  './page-seo': seo,
})

test('approved information pages render English with one canonical and no fabricated translations', async () => {
  for (const [kind, page] of Object.entries(informationPages)) {
    const loadProps = props.informationPageProps(kind)
    const result = await loadProps({ locale: 'en' })
    assert.deepEqual(translationCalls.at(-1), ['en', ['common']])
    assert.equal(result.props._nextI18Next.initialLocale, 'en')
    assert.equal(result.props.updatedAt, '2026-11-26T01:30:00.000Z')
    assert.deepEqual(result.props.pageSEO, {
      canonical: `https://www.nervos.org${page.path}`,
      language: 'en',
      alternates: [
        { language: 'en', url: `https://www.nervos.org${page.path}` },
        { language: 'x-default', url: `https://www.nervos.org${page.path}` },
      ],
    })
    for (const locale of i18nConfig.i18n.locales.filter(locale => locale !== 'en'))
      assert.deepEqual((await loadProps({ locale })).props, result.props)
  }
})

test('information revision dates come from the relevant content commit and never the build clock', () => {
  assert.equal(props.informationPageUpdatedAt('privacy'), '2026-11-26T01:30:00.000Z')
  assert.deepEqual(gitCalls.findLast(call => call[1][0] === 'log').slice(0, 2), [
    'git',
    ['log', '-1', '--format=%H %cI', '--', 'src/components/InformationPages/PrivacyContent.tsx'],
  ])
  const make = execFileSync =>
    load('src/server/information-page.ts', {
      'node:child_process': { execFileSync },
      'node:fs': { readFileSync: missingShallowFile },
      'next-i18next/serverSideTranslations': {},
      '../../config/information-pages.mjs': { informationPages },
      './page-seo': {},
    })
  for (const value of ['', 'not-a-date', `${touchHash} 2026-99-99T25:00:00+00:00`])
    assert.equal(make(() => value).informationPageUpdatedAt('contact'), null)
  assert.equal(
    make(() => {
      throw new Error('No Git history is available')
    }).informationPageUpdatedAt('about'),
    null,
  )
})

test('a shallow boundary is not mistaken for the content revision, while a verified in-range touch keeps its date', () => {
  const make = (boundaries, readError) => {
    const calls = []
    const api = load('src/server/information-page.ts', {
      'node:child_process': {
        execFileSync: (command, args) => {
          calls.push([command, args])
          return args[0] === 'log' ? touchRevision : '.git/shallow\n'
        },
      },
      'node:fs': {
        readFileSync: filename => {
          assert.equal(filename, path.resolve('.git/shallow'))
          if (readError) throw readError
          return boundaries
        },
      },
      'next-i18next/serverSideTranslations': {},
      '../../config/information-pages.mjs': { informationPages },
      './page-seo': {},
    })
    return { api, calls }
  }
  const boundary = make(`${'b'.repeat(40)}\n${touchHash}\n`)
  assert.equal(boundary.api.informationPageUpdatedAt('privacy'), null)
  assert.deepEqual(boundary.calls.at(-1), ['git', ['rev-parse', '--git-path', 'shallow']])
  const completeTouch = make(`${'b'.repeat(40)}\n`)
  assert.equal(completeTouch.api.informationPageUpdatedAt('privacy'), '2026-11-26T01:30:00.000Z')
  const unreadable = make('', Object.assign(new Error('Boundary file cannot be read'), { code: 'EACCES' }))
  assert.equal(unreadable.api.informationPageUpdatedAt('privacy'), null)
})

test('page routes pass their actual document identity and unique title and description to SSR', () => {
  for (const [kind, page] of Object.entries(informationPages)) {
    const route = load(`src/pages/${kind}/index.page.tsx`, {
      'next/head': { __esModule: true, default: React.Fragment },
      '../../components/InformationPages': {
        InformationPage: ({ kind }) => React.createElement('main', { 'data-document': kind }),
      },
      '../../server/information-page': { informationPageProps: value => value },
      '../../../config/information-pages.mjs': { informationPages },
    })
    assert.equal(route.getStaticProps, kind)
    const html = renderToStaticMarkup(React.createElement(route.default, { updatedAt: null }))
    assert.equal((html.match(/<title>/g) ?? []).length, 1)
    assert.ok(html.includes(`<title>${page.title}</title>`))
    assert.ok(html.includes(`content="${page.description}"`))
    assert.ok(html.includes(`data-document="${kind}"`))
  }
})

test('footer information links always target approved English routes and preserve click callbacks', () => {
  const { InformationLinks } = load('src/components/InformationLinks/index.tsx', {
    'next/link': { __esModule: true, default: 'a' },
    '../../../config/information-pages.mjs': { informationPages },
    './index.module.scss': { __esModule: true, default: {} },
  })
  const events = []
  const tree = InformationLinks({ onNavigate: link => events.push(link) })
  assert.equal(tree.type, 'nav')
  assert.equal(tree.props['aria-label'], 'Site information')
  const links = tree.props.children
  assert.deepEqual(
    links.map(link => [link.props.children, link.props.href, link.props.locale]),
    [
      ['About us', '/about', 'en'],
      ['Privacy Policy', '/privacy', 'en'],
      ['Contact us', '/contact', 'en'],
    ],
  )
  for (const link of links) {
    assert.equal(link.props.target, undefined)
    link.props.onClick()
  }
  assert.deepEqual(
    events.map(link => link.href),
    ['/about', '/privacy', '/contact'],
  )
})
