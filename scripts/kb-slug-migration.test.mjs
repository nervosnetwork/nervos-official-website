import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { after, test } from 'node:test'
import ts from 'typescript'
import { readSlugMigrations, rewriteKBUrl, rewriteMarkdownLinks, migrateKBSlugs } from './migrate-kb-slugs.mjs'

const root = path.resolve('public/education_hub_articles')
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'metadata/catalog.json'), 'utf8'))
const baseline = JSON.parse(
  fs.readFileSync(new URL('./fixtures/kb-slug-migration-baseline.json', import.meta.url), 'utf8'),
)
const approvedMigrations = JSON.parse(
  fs.readFileSync(new URL('./fixtures/kb-approved-slug-migrations.json', import.meta.url), 'utf8'),
)
const migrationManifest = JSON.parse(fs.readFileSync(path.join(root, 'metadata/slug-migrations.json'), 'utf8'))
const fromApprovedCommit = filename =>
  JSON.parse(
    execFileSync('git', ['-C', root, 'show', `${approvedMigrations.sourceArticleCommit}:${filename}`], {
      encoding: 'utf8',
    }),
  )
const originalCatalog = fromApprovedCommit('metadata/catalog.json')
const originalReport = fromApprovedCommit('metadata/reconciliation.json')
const historicalSources = new Set(originalCatalog.articles.map(article => article.sourceFile))
// Keep the one-time D-08/D-18/November-sync audit against its immutable release
// tree. Applying its frozen copy/body hashes to today's edited Markdown would
// incorrectly forbid ordinary publishing. Live route/hash invariants are tested
// separately below and by test-kb-content, not skipped when content grows.
const auditedRelease = '96b9571537e8077c3ae4c79721bbfe871c734c75'
const auditedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-approved-release-'))
after(() => fs.rmSync(auditedRoot, { recursive: true, force: true }))
const archive = path.join(auditedRoot, '.approved-release.tar')
execFileSync('git', ['-C', root, 'archive', '--format=tar', '--output', archive, auditedRelease])
execFileSync('tar', ['-xf', archive, '-C', auditedRoot])
fs.unlinkSync(archive)
// The three-way validator needs read-only history as well as the frozen files.
const articleGitDir = execFileSync('git', ['-C', root, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim()
fs.writeFileSync(path.join(auditedRoot, '.git'), `gitdir: ${articleGitDir}\n`)
const auditedCatalog = JSON.parse(fs.readFileSync(path.join(auditedRoot, 'metadata/catalog.json'), 'utf8'))
const handoff = JSON.parse(fs.readFileSync(path.join(root, 'metadata/handoff.json'), 'utf8'))
const renames = readSlugMigrations(root)
const targets = new Set(renames.values())
const d18Targets = new Set(approvedMigrations.approvedD18Renames.map(({ to }) => to))
const originalIds = new Map([...renames].map(([from, to]) => [to, from]))
const descriptionImport = JSON.parse(
  fs.readFileSync(path.join(auditedRoot, 'metadata/description-import.json'), 'utf8'),
)
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
  const metadata = historicalArticles(articles).map(source => {
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

function historicalArticles(articles) {
  const historical = articles.filter(article => historicalSources.has(article.sourceFile))
  assert.equal(historicalSources.size, baseline.renditions)
  assert.equal(historical.length, baseline.renditions, 'Every original rendition must remain, with no duplicates')
  assert.deepEqual(new Set(historical.map(article => article.sourceFile)), historicalSources)
  return historical
}

function newlyMatchedCandidates(articles) {
  const groupingKey = value =>
    value
      .toLowerCase()
      .replace(/_\(explainckbot\)$/, '')
      .replace(/%20/g, '')
      .replace(/\s/g, '')
  const candidateKey = candidate => JSON.stringify([candidate.key, candidate.language, candidate.url])
  const matched = new Set()
  for (const article of articles.filter(article => !historicalSources.has(article.sourceFile))) {
    const originalId = originalIds.get(article.id) ?? article.id
    const originalPath = `${article.language === 'en' ? '' : `/${article.language}`}/knowledge-base/${originalId}`
    let matches = handoff.candidates.filter(candidate => {
      if (candidate.language !== article.language) return false
      try {
        return decodeURIComponent(new URL(candidate.url).pathname).replace(/\/$/, '') === originalPath
      } catch {
        return false
      }
    })
    if (!matches.length)
      matches = handoff.candidates.filter(
        candidate => candidate.language === article.language && groupingKey(candidate.key) === groupingKey(originalId),
      )
    if (!matches.length && article.language !== 'en')
      matches = handoff.candidates.filter(
        candidate => candidate.language === 'en' && groupingKey(candidate.key) === groupingKey(originalId),
      )
    matches.forEach(candidate => matched.add(candidateKey(candidate)))
  }
  return originalReport.unmatchedCandidates.filter(candidate => !matched.has(candidateKey(candidate)))
}

function reconciliationBeforeApprovedD08(report) {
  // The generator refreshes the source HEAD, not an editorial decision. Check
  // the two generated sidecars agree before restoring the old comparison value.
  assert.equal(report.sourceCommit, auditedCatalog.sourceCommit)
  assert.match(report.sourceCommit, /^[a-f0-9]{40}$/)
  const historical = historicalArticles(auditedCatalog.articles)
  const languages = articles =>
    articles.reduce((counts, article) => {
      counts[article.language] = (counts[article.language] ?? 0) + 1
      return counts
    }, {})
  assert.equal(report.articles, new Set(auditedCatalog.articles.map(article => article.id)).size)
  assert.equal(report.renditions, auditedCatalog.articles.length)
  assert.deepEqual(report.languages, languages(auditedCatalog.articles))
  assert.equal(report.classified, auditedCatalog.articles.filter(article => article.hub).length)
  assert.deepEqual(
    report.issues,
    auditedCatalog.articles
      .filter(article => article.warnings.length)
      .map(({ sourceFile, warnings }) => ({ sourceFile, warnings })),
  )
  assert.deepEqual(
    report.unmatchedCandidates,
    newlyMatchedCandidates(auditedCatalog.articles),
    'Only candidates matched by newly added renditions may leave the historical unresolved inventory',
  )
  return {
    ...report,
    sourceCommit: baseline.approvedD08Import.reconciliationSourceCommitBeforeRegeneration,
    articles: new Set(historical.map(article => article.id)).size,
    renditions: historical.length,
    languages: languages(historical),
    classified: historical.filter(article => article.hub).length,
    unmatchedCandidates: originalReport.unmatchedCandidates,
    issues: report.issues.filter(issue => historicalSources.has(issue.sourceFile)).sort(originalSourceOrder),
  }
}

test('the exact 50 approved D-18 migrations remain unchanged, with only the separately approved CKBuilders2 addition', () => {
  assert.equal(approvedMigrations.approvedD18Renames.length, 50)
  assert.deepEqual(fromApprovedCommit('metadata/slug-migrations.json').renames, approvedMigrations.approvedD18Renames)
  assert.deepEqual(migrationManifest.renames, [
    ...approvedMigrations.approvedD18Renames,
    ...approvedMigrations.additionalRenames,
  ])
  assert.deepEqual(
    approvedMigrations.additionalRenames.map(({ from, to }) => ({ from, to })),
    [{ from: 'CKBuilders2', to: 'ckbuilders2' }],
  )
  assert.equal(renames.size, 51)
  assert.equal(targets.size, 51)
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

test('the immutable approved D-18 release preserved all 320 renditions, D-08 copy and editorial choices', () => {
  const catalog = auditedCatalog
  const historical = historicalArticles(catalog.articles)
  assert.deepEqual(handoff, fromApprovedCommit('metadata/handoff.json'), 'Historical matching evidence must not change')
  assert.deepEqual(
    new Set([
      ...descriptionImport.entries.map(entry => entry.sourceFile),
      ...Object.keys(descriptionImport.untouchedMarkdown),
    ]),
    historicalSources,
  )
  assert.deepEqual(
    historical.reduce((counts, article) => {
      counts[article.language] = (counts[article.language] ?? 0) + 1
      return counts
    }, {}),
    baseline.languages,
  )
  assert.equal(historical.filter(article => d18Targets.has(article.id)).length, baseline.migratedRenditions)
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
  const report = JSON.parse(fs.readFileSync(path.join(auditedRoot, 'metadata/reconciliation.json'), 'utf8'))
  assert.equal(
    hash(reconciliationBeforeApprovedD08(report)),
    baseline.reconciliationSHA256,
    'Unresolved/review metadata changed beyond source-path migration',
  )
  assert.equal(JSON.stringify(catalog), before, 'Comparison normalization must never mutate actual catalog data')
})

test('the immutable November release passes the independent three-way body/link/image sync audit', () => {
  const catalog = auditedCatalog
  const added = catalog.articles.filter(article => !historicalSources.has(article.sourceFile))
  assert.deepEqual(
    added.reduce((counts, article) => {
      counts[article.language] = (counts[article.language] ?? 0) + 1
      return counts
    }, {}),
    approvedMigrations.upstreamSync.addedRenditions,
  )
  assert.equal(new Set(catalog.articles.map(article => article.sourceFile)).size, catalog.articles.length)
  assert.equal(
    catalog.articles.length,
    baseline.renditions +
      Object.values(approvedMigrations.upstreamSync.addedRenditions).reduce((sum, count) => sum + count, 0),
  )
  // This is not a source-hash refresh exception: the separate validator checks
  // each current file against the fixed old fork and upstream Git trees.
  execFileSync(
    process.execPath,
    [
      'scripts/check-kb-upstream-sync.mjs',
      '--root',
      auditedRoot,
      '--old',
      approvedMigrations.sourceArticleCommit,
      '--upstream',
      approvedMigrations.upstreamSync.commit,
    ],
    { encoding: 'utf8', stdio: 'pipe' },
  )
})

test('D-08 comparison allowance cannot hide unapproved copy, article fields, taxonomy or editorial reordering', () => {
  const catalog = auditedCatalog
  const firstHistorical = historicalArticles(catalog.articles)[0]
  assert.throws(
    () => metadataBeforeApprovedD08(catalog.articles.filter(article => article !== firstHistorical)),
    /Every original rendition must remain/,
  )
  const secondHistorical = historicalArticles(catalog.articles)[1]
  assert.throws(() =>
    metadataBeforeApprovedD08(
      catalog.articles.map(article => (article === firstHistorical ? { ...secondHistorical } : article)),
    ),
  )
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
  const translated = historicalArticles(catalog.articles).find(article => article.language !== 'en')
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
  const report = JSON.parse(fs.readFileSync(path.join(auditedRoot, 'metadata/reconciliation.json'), 'utf8'))
  const missingUnmatched = structuredClone(report)
  missingUnmatched.unmatchedCandidates.pop()
  assert.throws(() => reconciliationBeforeApprovedD08(missingUnmatched), /Only candidates matched by newly added/)
  const missingIssue = structuredClone(report)
  missingIssue.issues.pop()
  assert.throws(() => reconciliationBeforeApprovedD08(missingIssue))
  assert.throws(() => reconciliationBeforeApprovedD08({ ...report, renditions: report.renditions - 1 }))
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

test('the immutable completed migration has an empty read-only plan with no directory/link rewrite', () => {
  const plan = migrateKBSlugs(auditedRoot, { check: true })
  assert.equal(plan.check, true)
  assert.equal(plan.renamedDirectories, 0)
  assert.equal(plan.changedMarkdown, 0)
  assert.equal(plan.linkReplacements, 0)
  assert.equal(plan.changedMetadata, 0)
  assert.equal(plan.renditions, auditedCatalog.articles.length)
})

test('daily content validates every current source identity and hash instead of freezing historical copy', () => {
  assert.equal(new Set(catalog.articles.map(article => article.sourceFile)).size, catalog.articles.length)
  assert.equal(new Set(catalog.articles.map(article => article.canonicalPath)).size, catalog.articles.length)
  for (const article of catalog.articles) {
    assert.equal(renames.has(article.id), false, 'A migrated legacy directory must not be republished')
    assert.equal(article.sourceFile.split('/')[0], article.id)
    assert.equal(
      article.canonicalPath,
      `${article.language === 'en' ? '' : `/${article.language}`}/knowledge-base/${article.id}`,
    )
    assert.equal(resolveKBArticleId(article.id), article.id, 'Current canonical IDs must not redirect')
    assert.ok(article.relatedArticleIds.every(id => !renames.has(id)))
    const bytes = fs.readFileSync(path.join(root, article.sourceFile))
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), article.sourceSHA256)
  }
})
