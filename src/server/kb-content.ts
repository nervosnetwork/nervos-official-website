import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import matter from 'gray-matter'
import type { KBArticle, KBCatalog } from '../components/KnowledgeHub/content'

const root = path.join(process.cwd(), 'public/education_hub_articles')
type SourceArticle = KBArticle & { sourceFile: string; sourceSHA256: string; draft: boolean }
function isPublished(article: SourceArticle) {
  return !article.draft && (!article.date || Date.parse(article.date) <= Date.now())
}
function source() {
  const data = JSON.parse(fs.readFileSync(path.join(root, 'metadata/catalog.json'), 'utf8')) as Omit<
    KBCatalog,
    'articles'
  > & { articles: SourceArticle[] }
  return data
}
function markdown(article: SourceArticle) {
  const file = path.resolve(root, article.sourceFile)
  if (!file.startsWith(root + path.sep)) throw new Error('Invalid content path')
  const raw = fs.readFileSync(file, 'utf8')
  if (crypto.createHash('sha256').update(raw).digest('hex') !== article.sourceSHA256)
    throw new Error(`KB metadata is stale: ${article.sourceFile}. Regenerate and review the catalog.`)
  return matter(raw).content
}
function publishedLanguages(articles: SourceArticle[]): Record<string, string[]> {
  const languages: Record<string, string[]> = {}
  for (const article of articles) {
    if (!isPublished(article)) continue
    const available = languages[article.id] ?? (languages[article.id] = [])
    if (!available.includes(article.language)) available.push(article.language)
  }
  return languages
}

export function getKBArticleLanguages(): Record<string, string[]> {
  const languages = publishedLanguages(source().articles)
  const migrations = JSON.parse(fs.readFileSync(path.join(root, 'metadata/slug-migrations.json'), 'utf8')) as {
    renames: { from: string; to: string }[]
  }
  for (const { from, to } of migrations.renames) {
    const available = languages[to]
    if (available) languages[from] = available
  }
  return languages
}

export function getKBCatalog(language = 'en', includeText = false): KBCatalog {
  const data = source()
  const languages = publishedLanguages(data.articles)
  const articles = data.articles
    .filter(a => a.language === language && isPublished(a))
    .map(a => {
      const body = markdown(a)
      const {
        id,
        title,
        subtitle,
        description,
        date,
        coverImage,
        authors,
        hub,
        subjects,
        internalTags,
        readingMinutes,
        relatedArticleIds,
        excludedFromRecommendations,
        canonicalPath,
      } = a
      return {
        id,
        title,
        subtitle,
        ...(typeof description === 'string' && description.trim() ? { description } : {}),
        date,
        coverImage,
        authors,
        hub,
        subjects,
        internalTags,
        readingMinutes,
        relatedArticleIds,
        excludedFromRecommendations,
        canonicalPath,
        language,
        availableLanguages: languages[id] ?? [],
        ...(includeText
          ? {
              text: body
                .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
                .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
                .replace(/<[^>]*>|[#*_`>~]/g, ' ')
                .replace(/\s+/g, ' '),
            }
          : {}),
      }
    })
  return {
    articles,
    hubs: data.hubs,
    subjects: data.subjects,
    featured: data.featured.filter(f => f.language === language),
  }
}
export function getKBArticleStatus(id: string, language = 'en'): 'missing' | 'unpublished' | 'published' {
  const article = source().articles.find(a => a.id === id && a.language === language)
  return !article ? 'missing' : isPublished(article) ? 'published' : 'unpublished'
}
// D-18 is an explicit, case-sensitive migration, not a general slug normalizer.
// Next config redirects are case-insensitive and would loop for case-only moves.
export function resolveKBArticleId(id: string): string {
  const migrations = JSON.parse(fs.readFileSync(path.join(root, 'metadata/slug-migrations.json'), 'utf8')) as {
    renames: { from: string; to: string }[]
  }
  return migrations.renames.find(rename => rename.from === id)?.to ?? id
}
export function getKBArticle(id: string, language = 'en') {
  const article = source().articles.find(a => a.id === id && a.language === language)
  return article && isPublished(article) ? markdown(article) : null
}
