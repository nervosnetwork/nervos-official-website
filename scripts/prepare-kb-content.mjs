import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import matter from 'gray-matter'

// Sidecar migration: never rename folders or rewrite article bodies/frontmatter.
const root = path.resolve(process.argv[2] || 'public/education_hub_articles')
const handoff = JSON.parse(fs.readFileSync(path.join(root, 'metadata/handoff.json'), 'utf8'))
const sha = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
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
for (const folder of fs.readdirSync(root).sort()) {
  const directory = path.join(root, folder)
  if (!fs.statSync(directory).isDirectory() || !fs.existsSync(path.join(directory, 'index.md'))) continue
  for (const file of fs.readdirSync(directory).sort()) {
    const match = /^index(?:[_-]([a-z]{2}))?\.md$/.exec(file)
    if (!match) continue
    const language = match[1] || 'en'
    const sourceFile = `${folder}/${file}`
    const raw = fs.readFileSync(path.join(root, sourceFile), 'utf8')
    let parsed
    try {
      parsed = matter(raw)
    } catch (error) {
      throw new Error(`${sourceFile}: ${error.message}`)
    }
    const { data, content } = parsed
    // Existing website route: /knowledge-base/[slug], with Next locale prefix.
    const canonicalPath = `${language === 'en' ? '' : `/${language}`}/knowledge-base/${folder}`
    let matches = candidates.filter(c => c.language === language && c.path === canonicalPath)
    let matchMethod = 'exact-path'
    if (!matches.length) {
      matches = candidates.filter(c => c.language === language && groupingKey(c.key) === groupingKey(folder))
      matchMethod = 'historical-grouping-proposal'
    }
    if (!matches.length && language !== 'en') {
      matches = candidates.filter(c => c.language === 'en' && groupingKey(c.key) === groupingKey(folder))
      matchMethod = 'same-source-translation-proposal'
    }
    const distinct = new Set(matches.map(c => JSON.stringify([c.hub, c.subjects, c.internalTags])))
    const proposal = distinct.size === 1 ? matches[0] : null
    matches.forEach(c => used.add(candidates.indexOf(c)))
    const warnings = []
    if (!proposal) warnings.push(matches.length ? 'conflicting-candidates' : 'no-exact-candidate')
    const hub = proposal?.hub || null
    const subjects = proposal?.subjects || []
    if (
      hub &&
      (!handoff.hubs.some(h => h.id === hub) ||
        !subjects.length ||
        subjects.length > 3 ||
        new Set(subjects).size !== subjects.length ||
        subjects.some(id => !handoff.subjects.some(s => s.id === id && s.hub === hub)))
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
      date,
      coverImage,
      authors,
      hub,
      subjects,
      internalTags: [...new Set(proposal?.internalTags || [])],
      legacyTags: data.category ?? null,
      librarySection: hub ? 'hub' : 'general',
      reviewStatus: 'pending-editorial',
      matchMethod: proposal ? matchMethod : 'unmatched',
      candidateKeys: matches.map(c => c.key),
      relatedArticleIds: [],
      excludedFromRecommendations: false,
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
const featured = handoff.featured.map(f => ({
  ...f,
  articleId: articles.find(a => a.canonicalPath === candidatePath(f.url) && a.language === f.language)?.id || null,
}))
const manifest = {
  schemaVersion: 1,
  sourceCommit: sha,
  hubs: handoff.hubs,
  subjects: handoff.subjects,
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
