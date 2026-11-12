import { KB_HUBS } from '../config/kb-hubs.mjs'

export function readHubTag(data) {
  if (!Object.hasOwn(data, 'hub')) return undefined
  const hub = typeof data.hub === 'string' ? data.hub.trim() : undefined
  if (!KB_HUBS.some(item => item.id === hub))
    throw new Error(
      `hub must be one of: ${KB_HUBS.map(item => item.id).join(', ')}; omit it to keep the existing classification`,
    )
  return hub
}

export function renditionHubTag(data, englishHub, language) {
  const ownHub = readHubTag(data)
  if (language !== 'en' && ownHub !== undefined && ownHub !== englishHub)
    throw new Error('Set hub in the English index.md; translations must omit it or repeat the same value')
  return language === 'en' ? ownHub : englishHub
}

// Generated catalogs are also read on a second preparation run. Retain the
// original curated classification so changing/removing a source tag behaves
// the same in incremental builds and fresh production checkouts.
export function withoutSourceHubOverride(article) {
  if (!article?.sourceHubOverride) return article
  const { sourceHubOverride, ...original } = article
  const fallback = sourceHubOverride.fallback
  if (
    !fallback ||
    (fallback.hub !== null && typeof fallback.hub !== 'string') ||
    !Array.isArray(fallback.subjects) ||
    !['hub', 'general'].includes(fallback.librarySection) ||
    typeof fallback.matchMethod !== 'string'
  )
    throw new Error(`Invalid generated hub provenance: ${article.id}:${article.language}`)
  return {
    ...original,
    hub: fallback.hub,
    subjects: fallback.subjects,
    librarySection: fallback.librarySection,
    matchMethod: fallback.matchMethod,
  }
}
