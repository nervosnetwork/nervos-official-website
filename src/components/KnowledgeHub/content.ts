export interface KBArticle {
  id: string
  language: string
  canonicalPath: string
  title: string
  subtitle: string
  date: string | null
  coverImage: string | null
  authors: string[]
  hub: string | null
  subjects: string[]
  internalTags: string[]
  readingMinutes: number
  relatedArticleIds: string[]
  excludedFromRecommendations: boolean
  text?: string
}
export interface KBMostRead {
  startDate: string
  endDate: string
  articles: KBArticle[]
}
export interface KBCatalog {
  articles: KBArticle[]
  hubs: { id: string; name: string; heading: string; order: number }[]
  subjects: { id: string; hub: string; name: string; order: number }[]
  featured: { hub: string; language: string; order: number; articleId: string | null }[]
}
export function articlePath(article: KBArticle) {
  // Catalogs contain only the current locale; Next Link adds that locale prefix.
  const localePrefix = `/${article.language}`
  return article.language !== 'en' && article.canonicalPath.startsWith(`${localePrefix}/knowledge-base/`)
    ? article.canonicalPath.slice(localePrefix.length)
    : article.canonicalPath
}
export function formatArticleDate(date: string | null) {
  if (!date) return 'Date not supplied'
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return 'Date not supplied'
  return value.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}
export const byDate = (a: KBArticle, b: KBArticle) =>
  (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id)
export function featuredArticles(catalog: KBCatalog, hub: string) {
  const pins = catalog.featured
    .filter(f => f.hub === hub)
    .sort((a, b) => a.order - b.order)
    .flatMap(f => catalog.articles.filter(a => a.id === f.articleId))
  return [
    ...new Map([...pins, ...catalog.articles.filter(a => a.hub === hub).sort(byDate)].map(a => [a.id, a])).values(),
  ].slice(0, 3)
}
const genericTags = new Set(['blockchain', 'crypto', 'popular', 'all'])
export function relatedArticles(current: KBArticle, catalog: KBCatalog) {
  const available = catalog.articles.filter(
    a => a.id !== current.id && a.language === current.language && !a.excludedFromRecommendations,
  )
  const pairs = [
    ['blockchain-cryptography', 'quantum-computing-blockchain-security'],
    ['blockchain-architecture', 'blockchain-vms-risc-v'],
    ['blockchain-architecture', 'blockchain-scalability'],
  ]
  const scored = available
    .map(a => {
      const pin = current.relatedArticleIds.indexOf(a.id)
      const subjects = a.subjects.filter(s => current.subjects.includes(s)).length
      const tags = a.internalTags.filter(t => !genericTags.has(t) && current.internalTags.includes(t)).length
      const sameHub = Boolean(a.hub && a.hub === current.hub)
      const crossAllowed =
        a.hub &&
        current.hub &&
        (a.hub === 'nervos-ckb' ||
          current.hub === 'nervos-ckb' ||
          pairs.some(p => p.includes(a.hub ?? '') && p.includes(current.hub ?? '')))
      const tier =
        pin >= 0
          ? 0
          : sameHub && a.subjects[0] === current.subjects[0]
            ? 1
            : sameHub && (subjects || tags)
              ? 2
              : crossAllowed && tags >= 2
                ? 3
                : 9
      return { article: a, tier, pin, subjects, tags }
    })
    .filter(a => a.tier < 9)
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        (a.tier === 0 ? a.pin - b.pin : b.subjects - a.subjects || b.tags - a.tags || byDate(a.article, b.article)),
    )
  const fallback = current.hub
    ? catalog.featured.filter(f => f.hub === current.hub).flatMap(f => available.filter(a => a.id === f.articleId))
    : []
  return [...new Map([...scored.map(s => s.article), ...fallback].map(a => [a.id, a])).values()].slice(0, 3)
}
export function searchArticles(query: string, catalog: KBCatalog) {
  const phrase = query.trim().toLocaleLowerCase()
  if (!phrase) return []
  const terms = phrase.match(/[\p{Script=Han}]|[\p{L}\p{N}]+(?:[-+][\p{L}\p{N}+]*)*/gu) || []
  return catalog.articles
    .map(article => {
      const fields: [string, number][] = [
        [article.title, 5],
        [article.subtitle, 3],
        [
          [
            catalog.hubs.find(h => h.id === article.hub)?.name,
            ...catalog.subjects.filter(s => article.subjects.includes(s.id)).map(s => s.name),
            ...article.internalTags,
          ].join(' '),
          2,
        ],
        [article.text || '', 1],
      ]
      const normalized = fields.map(([text, weight]) => [text.toLocaleLowerCase(), weight] as const)
      if (!terms.every(term => normalized.some(([text]) => text.includes(term)))) return { article, score: 0 }
      const score =
        normalized.reduce((total, [text, weight]) => total + terms.filter(t => text.includes(t)).length * weight, 0) +
        (article.title.toLocaleLowerCase().includes(phrase) ? 20 : 0)
      return { article, score }
    })
    .filter(a => a.score > 0)
    .sort((a, b) => b.score - a.score || byDate(a.article, b.article))
    .map(a => a.article)
}
