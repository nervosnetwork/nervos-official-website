import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'
import { KB_HUBS } from '../../config/kb-hubs.mjs'

const require = createRequire(import.meta.url)
function load(filename, imports = {}) {
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const loadedModule = { exports: {} }
  new Function('require', 'module', 'exports', source)(
    name => (Object.hasOwn(imports, name) ? imports[name] : require(name)),
    loadedModule,
    loadedModule.exports,
  )
  return loadedModule.exports
}

const hubs = load('src/utils/kb-hubs.ts', { '../../config/kb-hubs.mjs': { KB_HUBS } })
const content = load('src/components/KnowledgeHub/content.ts')
const articles = load('src/server/kb-content.ts')
const i18n = require('../../next-i18next.config.js').i18n

const calls = []
const { legacyTopicPageProps, topicPageProps } = load('src/server/kb-topic-page.ts', {
  '../utils/kb-hubs': hubs,
  '../components/KnowledgeHub/content': content,
  './kb-content': {
    getKBCatalog: language => {
      calls.push(['catalog', language])
      return articles.getKBCatalog(language)
    },
  },
  'next-i18next/serverSideTranslations': {
    serverSideTranslations: async (language, namespaces) => {
      calls.push(['translations', language, namespaces])
      return { _nextI18Next: { initialLocale: language } }
    },
  },
})

test('D-21 server fallback migrates every exact id/name selector directly to its English path', async () => {
  for (const hub of hubs.KB_HUBS) {
    for (const value of [hub.id, hub.name]) {
      for (const locale of i18n.locales) {
        calls.length = 0
        const query = { hub: value, subject: 'all', tag: ['one', 'two'], page: '999' }
        const resolvedUrl = `/${locale}/knowledge-base/topic?hub=${encodeURIComponent(value)}&subject=all&tag=one&tag=two&page=999`
        const result = await legacyTopicPageProps({ locale, query, resolvedUrl })
        assert.deepEqual(result, {
          redirect: {
            destination: `${hubs.kbHubPath(hub.id)}?subject=all&tag=one&tag=two&page=999`,
            permanent: true,
          },
        })
        assert.deepEqual(calls, [], 'Redirects must not load article bodies or translations')
        assert.equal(query.hub, value)
      }
    }
  }
})

test('D-21 server fallback sends a missing selector home but rejects empty, repeated and unknown selectors', async () => {
  for (const locale of i18n.locales) {
    assert.deepEqual(
      await legacyTopicPageProps({
        locale,
        query: {},
        resolvedUrl: `/${locale}/knowledge-base/topic?subject=all&x=1&x=2`,
      }),
      { redirect: { destination: '/knowledge-base?subject=all&x=1&x=2', permanent: true } },
    )
    for (const hub of [
      '',
      'BLOCKCHAIN-SCALABILITY',
      'unknown',
      '//evil.example',
      ['nervos-ckb'],
      ['nervos-ckb', 'nervos-ckb'],
    ]) {
      assert.deepEqual(
        await legacyTopicPageProps({ locale, query: { hub }, resolvedUrl: '/knowledge-base/topic?hub=invalid' }),
        { notFound: true },
      )
    }
  }
})

test('D-21 translated Hub paths return permanent English redirects, preserving queries without reading content', async () => {
  for (const hub of hubs.KB_HUBS) {
    for (const locale of i18n.locales.filter(language => language !== 'en')) {
      calls.length = 0
      const path = hubs.kbHubPath(hub.id)
      const suffix = '?subject=all&tag=one&tag=two&term=a%20b&hub=kept&page=999'
      assert.deepEqual(
        await topicPageProps({
          locale,
          params: { hub: hub.id },
          query: { subject: 'all' },
          resolvedUrl: `/${locale}${path}${suffix}`,
        }),
        { redirect: { destination: path + suffix, permanent: true } },
      )
      assert.deepEqual(calls, [])
    }
  }
})

test('D-21 canonical Hub server props contain the complete published English Hub, independent of query page', async () => {
  const catalog = articles.getKBCatalog('en')
  for (const hub of hubs.KB_HUBS) {
    const expected = catalog.articles.filter(article => article.hub === hub.id).sort(content.byDate)
    for (const locale of [undefined, 'en']) {
      calls.length = 0
      const result = await topicPageProps({
        locale,
        params: { hub: hub.id },
        query: { subject: 'all', page: '999', hub: 'unknown-query-cannot-override-path' },
        resolvedUrl: `${hubs.kbHubPath(hub.id)}?subject=all&page=999&hub=unknown-query-cannot-override-path`,
      })
      assert.ok(result.props)
      assert.equal(result.props.hubId, hub.id)
      assert.equal(result.props.subjectId, 'all')
      assert.deepEqual(result.props.catalog.articles, expected)
      assert.ok(
        result.props.catalog.articles.every(article => article.language === 'en' && !Object.hasOwn(article, 'text')),
      )
      assert.deepEqual(calls, [
        ['catalog', 'en'],
        ['translations', 'en', ['common']],
      ])
    }
  }
})

test('D-21 path params require an exact Hub id; invalid routes do not read content or redirect', async () => {
  for (const hub of [
    undefined,
    '',
    'unknown',
    'Blockchain Scalability',
    'BLOCKCHAIN-SCALABILITY',
    ['nervos-ckb'],
    '../nervos-ckb',
  ]) {
    for (const locale of i18n.locales) {
      calls.length = 0
      assert.deepEqual(
        await topicPageProps({ locale, params: { hub }, query: {}, resolvedUrl: '/knowledge-base/topic/invalid' }),
        { notFound: true },
      )
      assert.deepEqual(calls, [])
    }
  }
  for (const subject of [undefined, ['all', 'hash-functions']]) {
    const result = await topicPageProps({
      locale: 'en',
      params: { hub: 'blockchain-cryptography' },
      query: { subject },
      resolvedUrl: '/knowledge-base/topic/blockchain-cryptography',
    })
    assert.equal(result.props.subjectId, '')
  }
})
