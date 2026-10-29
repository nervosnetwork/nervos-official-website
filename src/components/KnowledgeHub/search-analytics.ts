import { KB_ANALYTICS_ENABLED, searchLengthBucket, trackKBEvent } from './analytics'

// The suggestion API returns five cards but exposes the full matching count.
// Capture each submitted query independently; this never delays navigation.
export function trackKBSearch(query: string, placement: string, locale = 'en', knownResultsCount?: number): void {
  if (!KB_ANALYTICS_ENABLED) return
  const searchTerm = query.slice(0, 200)
  const report = (count?: number) =>
    trackKBEvent('kb_search_submit', {
      placement,
      search_term: searchTerm,
      query_length_bucket: searchLengthBucket(searchTerm),
      ...(count !== undefined && Number.isSafeInteger(count) && count >= 0 ? { results_count: count } : {}),
    })
  if (knownResultsCount !== undefined && Number.isSafeInteger(knownResultsCount) && knownResultsCount >= 0) {
    report(knownResultsCount)
    return
  }
  try {
    void fetch(`/api/kb-search?q=${encodeURIComponent(searchTerm)}&locale=${encodeURIComponent(locale)}`, {
      keepalive: true,
    })
      .then(response => {
        const value = response.ok ? response.headers.get('X-Total-Count') : null
        report(value !== null && /^\d+$/.test(value) ? Number(value) : undefined)
      })
      .catch(() => report())
  } catch {
    report()
  }
}
