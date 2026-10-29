import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import ts from 'typescript'
import { readSlugMigrations, rewriteKBUrl, rewriteMarkdownLinks, migrateKBSlugs } from './migrate-kb-slugs.mjs'

const root = path.resolve('public/education_hub_articles')
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'metadata/catalog.json'), 'utf8'))
const baseline = JSON.parse(
  fs.readFileSync(new URL('./fixtures/kb-slug-migration-baseline.json', import.meta.url), 'utf8'),
)
const renames = readSlugMigrations(root)
const targets = new Set(renames.values())
const originalIds = new Map([...renames].map(([from, to]) => [to, from]))
const descriptionImport = JSON.parse(fs.readFileSync(path.join(root, 'metadata/description-import.json'), 'utf8'))
const require = createRequire(import.meta.url)
const loaded = { exports: {} }
const compiled = ts.transpileModule(fs.readFileSync('src/server/kb-content.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText
new Function('require', 'module', 'exports', compiled)(require, loaded, loaded.exports)
const { resolveKBArticleId } = loaded.exports

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, stable(value[key])]),
    )
  }
  return value
}
const hash = value =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(stable(value)))
    .digest('hex')

// prepare-kb-content sorts generated inventories by their current source path.
// D-18 only renamed those paths. Restore their former codepoint order solely
// for comparison; never sort featured, subjects, tags or other editorial lists.
function originalSourceOrder(a, b) {
  const originalPath = sourceFile => {
    const [id, ...rest] = sourceFile.split('/')
    return [originalIds.get(id) ?? id, ...rest].join('/')
  }
  const left = originalPath(a.sourceFile)
  const right = originalPath(b.sourceFile)
  return left < right ? -1 : left > right ? 1 : 0
}

function metadataBeforeApprovedD08(articles, imported = descriptionImport) {
  const approved = baseline.approvedD08Import
  assert.equal(imported.source.workbookSHA256, approved.sourceWorkbookSHA256)
  assert.equal(imported.source.sheet, approved.sourceSheet)
  assert.equal(imported.source.descriptionRange, approved.descriptionRange)
  assert.equal(imported.entries.length, approved.entryCount)
  const copy = imported.entries.map(({ row, sourceURL, id, description }) => ({ row, sourceURL, id, description }))
  assert.equal(hash(copy), approved.entriesSHA256, 'Only the exact workbook-approved D-08 copy may be excluded')
  const bySource = new Map()
  for (const entry of imported.entries) {
    const source = new URL(entry.sourceURL)
    assert.equal(source.origin, 'https://www.nervos.org')
    const originalId = decodeURIComponent(source.pathname.slice('/knowledge-base/'.length))
    assert.equal(entry.id, renames.get(originalId) ?? originalId)
    assert.equal(entry.sourceFile, `${entry.id}/index.md`)
    assert.equal(bySource.has(entry.sourceFile), false)
    bySource.set(entry.sourceFile, entry.description)
  }
  let matched = 0
  const metadata = articles.map(source => {
    const article = { ...source }
    delete article.sourceSHA256
    delete article.bodySHA256
    if (bySource.has(article.sourceFile)) {
      assert.equal(article.language, 'en')
      assert.equal(
        article.description,
        bySource.get(article.sourceFile),
        `Unapproved description: ${article.sourceFile}`,
      )
      delete article.description
      matched++
    }
    return article
  })
  assert.equal(matched, approved.entryCount, 'Every approved D-08 entry must exist exactly once')
  return metadata.sort(originalSourceOrder)
}

function reconciliationBeforeApprovedD08(report) {
  // The generator refreshes the source HEAD, not an editorial decision. Check
  // the two generated sidecars agree before restoring the old comparison value.
  assert.equal(report.sourceCommit, catalog.sourceCommit)
  assert.match(report.sourceCommit, /^[a-f0-9]{40}$/)
  return {
    ...report,
    sourceCommit: baseline.approvedD08Import.reconciliationSourceCommitBeforeRegeneration,
    issues: [...report.issues].sort(originalSourceOrder),
  }
}

test('D-18 is exactly 50 unique, non-chained, case-sensitive migrations, not a slug normalizer', () => {
  assert.equal(renames.size, 50)
  assert.equal(targets.size, 50)
  const folders = new Set(fs.readdirSync(root))
  for (const [from, to] of renames) {
    assert.notEqual(from, to)
    assert.match(to, /^[a-z0-9]+(?:_[a-z0-9]+)*$/)
    assert.equal(renames.has(to), false, `Chained migration: ${to}`)
    assert.equal(folders.has(from), false, `Old directory remains: ${from}`)
    assert.equal(folders.has(to), true, `New directory is missing: ${to}`)
    assert.equal(resolveKBArticleId(from), to)
    assert.equal(resolveKBArticleId(to), to, `Canonical ID loops: ${to}`)
    const wrongCase = from.toUpperCase()
    if (!renames.has(wrongCase)) assert.equal(resolveKBArticleId(wrongCase), wrongCase)
    for (const unrelated of [`${from}_extra`, `${from}_(explainCKBot)`, `prefix_${from}`]) {
      assert.equal(resolveKBArticleId(unrelated), unrelated, 'Partial/suffix matches are not bare D-18 migrations')
    }
  }
  for (const id of ['not-an-existing-article', '../metadata/catalog.json', '%2e%2e%2findex', '//example.com']) {
    assert.equal(resolveKBArticleId(id), id)
  }
})

test('D-18 preserves all 320 renditions and approved article metadata, hub taxonomy and editorial choices', () => {
  assert.equal(catalog.articles.length, baseline.renditions)
  assert.deepEqual(
    catalog.articles.reduce((counts, article) => {
      counts[article.language] = (counts[article.language] ?? 0) + 1
      return counts
    }, {}),
    baseline.languages,
  )
  assert.equal(catalog.articles.filter(article => targets.has(article.id)).length, baseline.migratedRenditions)
  for (const article of catalog.articles) {
    assert.equal(renames.has(article.id), false)
    assert.equal(article.sourceFile.split('/')[0], article.id)
    assert.equal(
      article.canonicalPath,
      `${article.language === 'en' ? '' : `/${article.language}`}/knowledge-base/${article.id}`,
    )
    assert.ok(article.relatedArticleIds.every(id => !renames.has(id)))
  }
  const before = JSON.stringify(catalog)
  const metadata = metadataBeforeApprovedD08(catalog.articles)
  assert.equal(
    hash(metadata),
    baseline.articleMetadataSHA256,
    'Article content metadata or classification changed beyond the approved identity/link migration and exact D-08 copy',
  )
  assert.equal(hash({ hubs: catalog.hubs, subjects: catalog.subjects }), baseline.hubsAndSubjectsSHA256)
  assert.equal(hash(catalog.featured), baseline.featuredSHA256, 'Featured card identity/order/fallback changed')
  const report = JSON.parse(fs.readFileSync(path.join(root, 'metadata/reconciliation.json'), 'utf8'))
  assert.equal(
    hash(reconciliationBeforeApprovedD08(report)),
    baseline.reconciliationSHA256,
    'Unresolved/review metadata changed beyond source-path migration',
  )
  assert.equal(JSON.stringify(catalog), before, 'Comparison normalization must never mutate actual catalog data')
})

test('D-08 comparison allowance cannot hide unapproved copy, article fields, taxonomy or editorial reordering', () => {
  const changedImport = structuredClone(descriptionImport)
  changedImport.entries[0].description = 'Unapproved replacement copy.'
  assert.throws(() => metadataBeforeApprovedD08(catalog.articles, changedImport), /exact workbook-approved/)
  const target = descriptionImport.entries[0].sourceFile
  const mutate = changes =>
    catalog.articles.map(article => (article.sourceFile === target ? { ...article, ...changes } : article))
  assert.throws(
    () => metadataBeforeApprovedD08(mutate({ description: 'Unapproved replacement copy.' })),
    /Unapproved description/,
  )
  assert.throws(() => metadataBeforeApprovedD08(mutate({ description: undefined })), /Unapproved description/)
  for (const changes of [
    { title: 'Unapproved visible title' },
    { subtitle: 'Unapproved visible subtitle' },
    { date: '2000-01-01T00:00:00.000Z' },
    { hub: 'unapproved-hub' },
    { subjects: ['unapproved-subject'] },
    { internalTags: ['unapproved-tag'] },
    { relatedArticleIds: ['unapproved-article'] },
    { excludedFromRecommendations: 'unapproved-value' },
    { unapprovedField: true },
  ])
    assert.notEqual(hash(metadataBeforeApprovedD08(mutate(changes))), baseline.articleMetadataSHA256)
  const translated = catalog.articles.find(article => article.language !== 'en')
  const translatedCopy = catalog.articles.map(article =>
    article === translated ? { ...article, description: 'Unapproved translated copy.' } : article,
  )
  assert.notEqual(hash(metadataBeforeApprovedD08(translatedCopy)), baseline.articleMetadataSHA256)
  const featured = structuredClone(catalog.featured)
  ;[featured[0], featured[1]] = [featured[1], featured[0]]
  assert.notEqual(hash(featured), baseline.featuredSHA256, 'Editorial order is never normalized away')
  const subjects = structuredClone(catalog.subjects)
  subjects[0].name = 'Unapproved subject name'
  assert.notEqual(hash({ hubs: catalog.hubs, subjects }), baseline.hubsAndSubjectsSHA256)
  const report = JSON.parse(fs.readFileSync(path.join(root, 'metadata/reconciliation.json'), 'utf8'))
  report.unresolvedFeatured = []
  assert.notEqual(hash(reconciliationBeforeApprovedD08(report)), baseline.reconciliationSHA256)
})

test('URL rewriting changes only approved complete segments on Nervos or relative paths and retains query/hash', () => {
  const from = 'What_is_a_digital_signature_ in_Blockchain'
  const to = renames.get(from)
  assert.ok(to)
  const encoded = encodeURIComponent(from)
  const tail = '?utm_source=old&tag=one&tag=two#unchanged'
  for (const prefix of [
    '/knowledge-base/',
    '/en/knowledge-base/',
    '/zh/knowledge-base/',
    'https://www.nervos.org/knowledge-base/',
    'https://nervos.org/es/knowledge-base/',
    '//www.nervos.org/knowledge-base/',
    '../',
    '../../',
    '/education_hub_articles/',
    '../education_hub_articles/',
  ]) {
    for (const slug of [from, encoded]) {
      assert.equal(rewriteKBUrl(`${prefix}${slug}${tail}`, renames), `${prefix}${to}${tail}`)
      assert.equal(rewriteKBUrl(`${prefix}${slug}/cover.png${tail}`, renames), `${prefix}${to}/cover.png${tail}`)
    }
  }
  for (const value of [
    `/knowledge-base/${to}${tail}`,
    `/knowledge-base/${encoded}_(explainCKBot)`,
    `/knowledge-base/prefix_${encoded}`,
    `/knowledge-base/${encoded}_extra`,
    `https://example.com/knowledge-base/${encoded}`,
    `https://www.nervos.org.example.com/knowledge-base/${encoded}`,
    `https://user@www.nervos.org/knowledge-base/${encoded}`,
    `https://www.nervos.org:8443/knowledge-base/${encoded}`,
    `/unrelated/${encoded}`,
    `/knowledge-base/${encoded.toUpperCase()}`,
    '/knowledge-base/%broken',
    'mailto:hello@example.com',
    null,
  ])
    assert.equal(rewriteKBUrl(value, renames), value)
})

test('Markdown rewriting preserves visible titles, alt text, prose, code and unrelated destinations', () => {
  const from = 'BFT_consensus_mechanisms'
  const to = renames.get(from)
  const markdown =
    [
      '# BFT_consensus_mechanisms is the unchanged heading',
      '',
      'The prose BFT_consensus_mechanisms remains unchanged.',
      `[Visible BFT title](/knowledge-base/${from}?a=1#section "Link title")`,
      `![Keep the alt](/education_hub_articles/${from}/cover.png "Image title")`,
      `[Named reference][bft]`,
      '',
      `[bft]: /knowledge-base/${from} "Reference title"`,
      '',
      `<a href="/zh/knowledge-base/${from}">Keep visible text</a>`,
      '',
      `<img src='/education_hub_articles/${from}/cover.png' alt='Keep HTML alt'>`,
      '',
      `<https://www.nervos.org/knowledge-base/${from}>`,
      `[Other site](https://example.com/knowledge-base/${from})`,
      `[Suffix handled by D-01](/knowledge-base/${from}_(explainCKBot))`,
      `\`[Code](/knowledge-base/${from})\``,
      '```md',
      `[Fenced code](/knowledge-base/${from})`,
      '```',
    ].join('\n') + '\n'
  const result = rewriteMarkdownLinks(markdown, renames)
  assert.equal(result.replacements, 6)
  assert.ok(result.markdown.includes(`[Visible BFT title](/knowledge-base/${to}?a=1#section "Link title")`))
  assert.ok(result.markdown.includes(`![Keep the alt](/education_hub_articles/${to}/cover.png "Image title")`))
  assert.ok(result.markdown.includes(`[bft]: /knowledge-base/${to} "Reference title"`))
  assert.ok(result.markdown.includes(`<a href="/zh/knowledge-base/${to}">Keep visible text</a>`))
  assert.ok(result.markdown.includes(`<img src='/education_hub_articles/${to}/cover.png' alt='Keep HTML alt'>`))
  assert.ok(
    result.markdown.includes(
      `[https://www.nervos.org/knowledge-base/${from}](https://www.nervos.org/knowledge-base/${to})`,
    ),
  )
  for (const unchanged of [
    '# BFT_consensus_mechanisms is the unchanged heading',
    'The prose BFT_consensus_mechanisms remains unchanged.',
    `[Other site](https://example.com/knowledge-base/${from})`,
    `[Suffix handled by D-01](/knowledge-base/${from}_(explainCKBot))`,
    `\`[Code](/knowledge-base/${from})\``,
    `[Fenced code](/knowledge-base/${from})`,
  ])
    assert.ok(result.markdown.includes(unchanged), unchanged)
  assert.deepEqual(rewriteMarkdownLinks(result.markdown, renames), { markdown: result.markdown, replacements: 0 })
})

test('the completed migration has an empty read-only plan and does not need another directory/link rewrite', () => {
  const plan = migrateKBSlugs(root, { check: true })
  assert.equal(plan.check, true)
  assert.equal(plan.renamedDirectories, 0)
  assert.equal(plan.changedMarkdown, 0)
  assert.equal(plan.linkReplacements, 0)
  assert.equal(plan.changedMetadata, 0)
  assert.equal(plan.renditions, baseline.renditions)
})
