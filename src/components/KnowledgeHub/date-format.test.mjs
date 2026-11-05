import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { test } from 'node:test'
import ts from 'typescript'
import kbHubs from '../../../scripts/fixtures/load-kb-hubs.mjs'

const cases = [
  ['2023-09-04T00:00:00.000Z', 'September 4, 2023'],
  ['2023-09-03T16:00:00.000Z', 'September 3, 2023'],
  ['2023-09-04', 'September 4, 2023'],
  ['2024-02-29T23:30:00.000Z', 'February 29, 2024'],
  ['2024-03-10T09:30:00.000Z', 'March 10, 2024'],
  ['2025-12-31T23:30:00.000Z', 'December 31, 2025'],
  ['2026-01-01T00:30:00+08:00', 'December 31, 2025'],
  ['2026-01-01T23:30:00-08:00', 'January 2, 2026'],
  [null, 'Date not supplied'],
  ['', 'Date not supplied'],
  ['not-a-date', 'Date not supplied'],
]

// Execute the real component expressions with inert UI dependencies. Each
// process keeps its own host TZ; the formatters must not depend on that TZ.
function renderDates() {
  const styles = new Proxy({}, { get: (_, key) => key })
  const jsx = (type, props) => ({ type, props })
  const shared = {
    '../../utils/kb-hubs': kbHubs,
    'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' },
    react: {
      useState: initial => [initial, () => undefined],
      useEffect: () => undefined,
      useRef: () => ({ current: null }),
    },
    clsx: { default: (...values) => values.filter(Boolean).join(' ') },
    'next/link': { default: 'Link' },
    'next/image': { default: 'Image' },
    'next/router': { useRouter: () => ({ locale: 'en' }) },
    './Icon': { Icon: 'Icon' },
    './ArticleLanguageSwitch': { ArticleLanguageSwitch: 'ArticleLanguageSwitch' },
    '../Header/KnowledgeHeader': { LanguageToggle: 'LanguageToggle' },
    './article-discover-experiment': {
      ARTICLE_DISCOVER_DESKTOP_QUERY: '(min-width: 1024px)',
      ARTICLE_DISCOVER_EXPERIMENT_ID: 'article_discover_placement_v1',
      initializeArticleDiscoverExperiment: () => ({ variant: 'A', preview: false }),
    },
    './reading-progress': { readingProgress: () => 0 },
    './ArticleLanguageLink': { ArticleLanguageLink: 'Link', ArticleContentLink: 'a' },
    './analytics': { trackKBEvent: () => undefined },
    './search-analytics': { trackKBSearch: () => undefined },
  }
  function load(file, imports = {}) {
    const { outputText } = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    })
    const exports = {}
    vm.runInNewContext(outputText, {
      exports,
      URL,
      require: name => {
        if (name.endsWith('.module.scss')) return { default: styles }
        const dependencies = { ...shared, ...imports }
        assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
        return dependencies[name]
      },
    })
    return exports
  }
  const content = load('./content.ts')
  const components = load('./Components.tsx', { './content': content })
  const { KnowledgeHubHome } = load('./Home.tsx', {
    '@headlessui/react': {},
    'next/head': { default: 'Head' },
    '../Page': { Page: 'Page' },
    './fixtures': { hubs: [] },
    './content': content,
    './Components': components,
    './KnowledgeFooter': { KnowledgeFooter: 'KnowledgeFooter' },
    './GuideLife': { GuideLife: 'GuideLife' },
    './NeuronIcon': { NeuronIcon: 'NeuronIcon' },
    './useNewsletterSignup': {},
  })
  const { ContentArticle } = load('./ContentArticle.tsx', {
    'next/image': { default: 'Image' },
    'react-markdown': { default: 'ReactMarkdown' },
    'remark-gfm': { default: null },
    'rehype-raw': { default: null },
    'rehype-sanitize': { default: null, defaultSchema: { attributes: {} } },
    './Home': { Icon: 'Icon', PreviewNotice: 'PreviewNotice' },
    './Shared': { PreviewPage: 'PreviewPage', DiscoverBanner: 'DiscoverBanner', useActiveSection: () => '' },
    './Components': components,
    './content': content,
    './markdown-headings': { headingPlugin: null },
    './article-features': { articleSocialActionsEnabled: false },
  })
  function nodes(node) {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(nodes)
    // Render the shared card metadata to check the visible text.
    if (node.type === components.CardMeta) return nodes(components.CardMeta(node.props))
    return [node, ...nodes(node.props?.children)]
  }
  const text = node => {
    if (node === null || node === undefined || typeof node === 'boolean') return ''
    if (Array.isArray(node)) return node.map(text).join('')
    return typeof node === 'object' ? text(node.props?.children) : String(node)
  }
  return cases.map(([date]) => {
    const article = {
      id: 'date-regression',
      title: 'Date regression',
      subtitle: '',
      date,
      language: 'en',
      canonicalPath: '/knowledge-base/date-regression',
      authors: ['Nervos'],
      coverImage: null,
      readingMinutes: 5,
      subjects: [],
    }
    const catalog = { articles: [], hubs: [], subjects: [], featured: [] }
    const home = nodes(KnowledgeHubHome({ catalog, counts: {}, mostRead: { articles: [article] } }))
    const page = home.find(node => node.type === 'Page')
    assert.ok(page, 'The active home Page must render')
    const homeMeta = nodes(page.props.children({ renderHeader: () => null })).find(
      node => node.props?.className === 'articleMeta',
    )
    assert.ok(homeMeta, 'The home recommendation must show its read time')
    const renderedArticle = ContentArticle({
      article,
      markdown: '',
      related: [],
      subjects: [],
      headings: [],
      hub: null,
    })
    const articleMeta = nodes(renderedArticle).find(node => node.props?.className === 'meta largeMeta')
    assert.ok(articleMeta, 'The actual article header date must render')
    const cardMetadata = [false, true].map(horizontal => {
      const card = components.ArticleCard({ title: article.title, article, horizontal })
      const meta = nodes(card).find(node => node.props?.className === 'meta')
      assert.ok(meta, 'Grid and horizontal article cards must show read time')
      return text(meta)
    })
    return {
      helper: content.formatArticleDate(date),
      home: text(homeMeta),
      article: text(nodes(articleMeta).filter(node => node.type === 'span')[2]),
      cards: cardMetadata,
    }
  })
}

if (process.argv.includes('--date-format-probe')) {
  process.stdout.write(
    JSON.stringify({
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      offset: new Date('2023-09-04T00:00:00.000Z').getTimezoneOffset(),
      dates: renderDates(),
    }),
  )
} else {
  const zones = ['UTC', 'America/Los_Angeles', 'Asia/Shanghai', 'Pacific/Kiritimati']
  const results = zones.map(TZ =>
    JSON.parse(
      execFileSync(process.execPath, [fileURLToPath(import.meta.url), '--date-format-probe'], {
        env: { ...process.env, TZ },
        encoding: 'utf8',
        timeout: 15000,
      }),
    ),
  )

  test('Article detail dates remain consistent across time zones', () => {
    assert.equal(new Set(results.map(result => result.offset)).size, zones.length, 'Child processes use distinct TZs')
    for (const result of results) {
      assert.deepEqual(result.dates, results[0].dates, `${result.timezone}: server/client date mismatch`)
      cases.forEach(([date, expected], index) => {
        assert.deepEqual(
          { helper: result.dates[index].helper, article: result.dates[index].article },
          { helper: expected, article: expected },
          `${result.timezone}: ${date}`,
        )
      })
    }
  })

  test('Popular, grid and horizontal cards show only read time regardless of publication date', () => {
    for (const result of results) {
      for (const { home, cards } of result.dates) {
        assert.equal(home, '5 min read')
        assert.deepEqual(cards, ['5 min read', '5 min read'])
      }
    }
  })
}
