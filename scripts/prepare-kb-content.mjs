import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import matter from 'gray-matter'
import { readSlugMigrations, rewriteKBUrl } from './migrate-kb-slugs.mjs'
import { readHubTag, renditionHubTag, withoutSourceHubOverride } from './kb-hub-tag.mjs'

// Sidecar migration: never rename folders or rewrite article bodies/frontmatter.
const root = path.resolve(process.argv[2] || 'public/education_hub_articles')
const handoff = JSON.parse(fs.readFileSync(path.join(root, 'metadata/handoff.json'), 'utf8'))
const renames = fs.existsSync(path.join(root, 'metadata/slug-migrations.json')) ? readSlugMigrations(root) : new Map()
const originalIds = new Map([...renames].map(([from, to]) => [to, from]))
const catalogPath = path.join(root, 'metadata/catalog.json')
const previous = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, 'utf8')) : null
// The committed sidecar remains a curated seed, not source metadata authority.
// Refresh hashes/frontmatter from the resolved checkout while preserving only
// the existing editorial choices below. Build-generated files are not committed.
const hubs = previous?.hubs ?? handoff.hubs
const subjectsByHub = previous?.subjects ?? handoff.subjects
const previousArticles = new Map(
  (previous?.articles ?? []).map(article => [
    `${renames.get(article.id) ?? article.id}:${article.language}`,
    withoutSourceHubOverride(article),
  ]),
)
const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Content provenance must be an exact Git commit')
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const candidatePath = value => {
  try {
    return decodeURIComponent(new URL(value).pathname).replace(/\/$/, '')
  } catch {
    return null
  }
}
const candidates = handoff.candidates.map(c => ({ ...c, path: candidatePath(c.url) }))
const articles = []
const issues = []
const used = new Set()
const groupingKey = value =>
  value
    .toLowerCase()
    .replace(/_\(explainckbot\)$/, '')
    .replace(/%20/g, '')
    .replace(/\s/g, '')
const fixes = {
  '2024-22-12T15:00:00.000Z': '2024-12-22T15:00:00.000Z',
  '2025-27-01T15:00:00.000Z': '2025-01-27T15:00:00.000Z',
  '2024-09-2616:00:00.000Z': '2024-09-26T16:00:00.000Z',
}

function parseSource(raw, sourceFile) {
  // Check before gray-matter's first parse: custom engines must never execute.
  if (!/^\uFEFF?---[^\S\r\n]*\r?\n/.test(raw))
    throw new Error(`${sourceFile}: only standard YAML frontmatter is allowed; executable/custom engines are forbidden`)
  try {
    return matter(raw)
  } catch (error) {
    throw new Error(`${sourceFile}: ${error.message}`)
  }
}

for (const folder of fs.readdirSync(root).sort()) {
  const directory = path.join(root, folder)
  if (!fs.statSync(directory).isDirectory() || !fs.existsSync(path.join(directory, 'index.md'))) continue
  // Read English first even when a legacy index-es.md sorts before index.md.
  const englishData = parseSource(fs.readFileSync(path.join(directory, 'index.md'), 'utf8'), `${folder}/index.md`).data
  let englishHub
  try {
    englishHub = readHubTag(englishData)
  } catch (error) {
    throw new Error(`${folder}/index.md: ${error.message}`)
  }
  for (const file of fs.readdirSync(directory).sort()) {
    const match = /^index(?:[_-]([a-z]{2}))?\.md$/.exec(file)
    if (!match) continue
    const language = match[1] || 'en'
    const existing = previousArticles.get(`${folder}:${language}`)
    // A new rendition shares the article's current classification, not a stale
    // historical proposal. This does not approve its translated copy: even an
    // English record marked approved cannot confer review status on a new file.
    const inheritedEnglish = !existing && language !== 'en' ? previousArticles.get(`${folder}:en`) : undefined
    const classification = existing ?? inheritedEnglish
    const sourceFile = `${folder}/${file}`
    const raw = fs.readFileSync(path.join(root, sourceFile), 'utf8')
    const { data, content } = parseSource(raw, sourceFile)
    let sourceHub
    try {
      sourceHub = renditionHubTag(data, englishHub, language)
    } catch (error) {
      throw new Error(`${sourceFile}: ${error.message}`)
    }
    // Existing website route: /knowledge-base/[slug], with Next locale prefix.
    const canonicalPath = `${language === 'en' ? '' : `/${language}`}/knowledge-base/${folder}`
    // D-18 changes only the approved filesystem identities. Match the original
    // handoff evidence using its original identity, not fuzzy slug normalization.
    const originalId = originalIds.get(folder) ?? folder
    const originalPath = `${language === 'en' ? '' : `/${language}`}/knowledge-base/${originalId}`
    let matches = candidates.filter(c => c.language === language && c.path === originalPath)
    let matchMethod = 'exact-path'
    if (!matches.length) {
      matches = candidates.filter(c => c.language === language && groupingKey(c.key) === groupingKey(originalId))
      matchMethod = 'historical-grouping-proposal'
    }
    if (!matches.length && language !== 'en') {
      matches = candidates.filter(c => c.language === 'en' && groupingKey(c.key) === groupingKey(originalId))
      matchMethod = 'same-source-translation-proposal'
    }
    const distinct = new Set(matches.map(c => JSON.stringify([c.hub, c.subjects, c.internalTags])))
    const proposal = distinct.size === 1 ? matches[0] : null
    matches.forEach(c => used.add(candidates.indexOf(c)))
    const warnings = []
    if (!proposal && !inheritedEnglish && sourceHub === undefined)
      warnings.push(matches.length ? 'conflicting-candidates' : 'no-exact-candidate')
    // Regeneration refreshes source metadata, not already reviewed editorial
    // choices. In particular, an explicit null classification is intentional.
    const originalHub = classification ? classification.hub : proposal?.hub || null
    const originalSubjects = classification ? classification.subjects : proposal?.subjects || []
    const originalSection = classification?.librarySection ?? (originalHub ? 'hub' : 'general')
    const originalMatch =
      existing?.matchMethod ?? (inheritedEnglish ? 'current-english-translation' : proposal ? matchMethod : 'unmatched')
    const hub = sourceHub ?? originalHub
    // A Hub tag need not guess a narrower Subject. Preserve existing Subjects
    // when they still belong to the selected Hub; clear them when moving Hubs.
    const subjects = sourceHub !== undefined && sourceHub !== originalHub ? [] : originalSubjects
    if (
      hub &&
      (!hubs.some(h => h.id === hub) ||
        (!subjects.length && sourceHub === undefined) ||
        subjects.length > 3 ||
        new Set(subjects).size !== subjects.length ||
        subjects.some(id => !subjectsByHub.some(s => s.id === id && s.hub === hub)))
    )
      throw new Error(`Invalid taxonomy: ${sourceFile}`)
    const originalDate = data.date instanceof Date ? data.date.toISOString() : data.date
    const spacedDate = typeof originalDate === 'string' ? originalDate.replace(' T', 'T') : null
    const correctedDate = spacedDate ? fixes[spacedDate] || spacedDate : null
    const date =
      correctedDate && Number.isFinite(Date.parse(correctedDate)) ? new Date(correctedDate).toISOString() : null
    if (!date) warnings.push('missing-or-invalid-date')
    if (date && correctedDate !== originalDate) warnings.push('date-normalized-existing-site-rule')
    let coverImage = null
    if (typeof data.coverImage === 'string') {
      const resolved = path.resolve(directory, data.coverImage)
      if (resolved.startsWith(directory + path.sep) && fs.existsSync(resolved))
        coverImage = `/education_hub_articles/${folder}/${data.coverImage}`
      else warnings.push('unverified-or-missing-cover')
    } else warnings.push('missing-cover')
    const authors = (Array.isArray(data.author) ? data.author : [data.author])
      .filter(Boolean)
      .map(a => (typeof a === 'string' ? a.replace(/^github:/, '') : a.name || a.github || ''))
      .filter(Boolean)
    if (!authors.length) warnings.push('missing-author')
    if (typeof data.title !== 'string' || !data.title.trim()) warnings.push('missing-title')
    const title = typeof data.title === 'string' ? data.title.trim() : folder
    const subtitle = typeof data.subtitle === 'string' ? data.subtitle.trim() : ''
    const description = typeof data.description === 'string' ? data.description.trim() : ''
    const text = content
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[#*_`>~]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    articles.push({
      id: folder,
      language,
      canonicalPath,
      sourceFile,
      sourceSHA256: hash(raw),
      title,
      subtitle,
      ...(description ? { description } : {}),
      date,
      coverImage,
      authors,
      hub,
      subjects,
      internalTags: classification?.internalTags ?? [...new Set(proposal?.internalTags || [])],
      legacyTags: data.category ?? null,
      librarySection: sourceHub === undefined ? originalSection : 'hub',
      reviewStatus: existing?.reviewStatus ?? 'pending-editorial',
      matchMethod: sourceHub === undefined ? originalMatch : 'source-hub-tag',
      ...(sourceHub === undefined
        ? {}
        : {
            sourceHubOverride: {
              hub: sourceHub,
              fallback: {
                hub: originalHub,
                subjects: originalSubjects,
                librarySection: originalSection,
                matchMethod: originalMatch,
              },
            },
          }),
      candidateKeys: existing?.candidateKeys ?? (inheritedEnglish ? [] : matches.map(c => c.key)),
      relatedArticleIds: (classification?.relatedArticleIds ?? []).map(id => renames.get(id) ?? id),
      excludedFromRecommendations: classification?.excludedFromRecommendations ?? false,
      draft: data.draft === true || data.published === false,
      readingMinutes: Math.max(1, Math.ceil(text.length / (language === 'zh' ? 500 : 1300))),
      bodySHA256: hash(content),
      warnings,
    })
    if (warnings.length) issues.push({ sourceFile, warnings })
  }
}
const paths = articles.map(a => a.canonicalPath)
if (new Set(paths).size !== paths.length) throw new Error('Duplicate locale routes')
// Preserve editorial order and explicit unresolved pins; D-18 must not turn a
// historical explainCKBot URL into a newly selected featured article.
const featured = previous
  ? previous.featured.map(f => ({
      ...f,
      url: rewriteKBUrl(f.url, renames),
      articleId: renames.get(f.articleId) ?? f.articleId,
    }))
  : handoff.featured.map(f => ({
      ...f,
      url: rewriteKBUrl(f.url, renames),
      articleId:
        articles.find(a => a.canonicalPath === rewriteKBUrl(candidatePath(f.url), renames) && a.language === f.language)
          ?.id || null,
    }))
const manifest = {
  schemaVersion: 1,
  sourceCommit: sha,
  hubs,
  subjects: subjectsByHub,
  featured,
  articles,
}
const report = {
  sourceCommit: sha,
  articles: new Set(articles.map(a => a.id)).size,
  renditions: articles.length,
  languages: Object.fromEntries(
    [...new Set(articles.map(a => a.language))].map(l => [l, articles.filter(a => a.language === l).length]),
  ),
  classified: articles.filter(a => a.hub).length,
  unresolvedFeatured: featured.filter(f => !f.articleId),
  unmatchedCandidates: candidates
    .filter((_, i) => !used.has(i))
    .map(({ key, language, url }) => ({ key, language, url })),
  issues,
}
fs.writeFileSync(path.join(root, 'metadata/catalog.json'), JSON.stringify(manifest, null, 2) + '\n')
fs.writeFileSync(path.join(root, 'metadata/reconciliation.json'), JSON.stringify(report, null, 2) + '\n')
console.log(
  JSON.stringify({ ...report, issues: issues.length, unmatchedCandidates: report.unmatchedCandidates.length }, null, 2),
)
