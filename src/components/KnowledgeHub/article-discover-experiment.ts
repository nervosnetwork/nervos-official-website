import { DESKTOP_QUERY } from '../../utils/breakpoints'

export type ArticleDiscoverVariant = 'A' | 'B'
export const ARTICLE_DISCOVER_EXPERIMENT_ID = 'article_discover_placement_v1'
export const ARTICLE_DISCOVER_DESKTOP_QUERY = DESKTOP_QUERY

// Keep the serialized browser work separate from the SSR guard. Next replaces
// `typeof window` in server bundles, so serializing the guarded function would
// ship only its server fallback in the document head.
function assignArticleDiscoverExperiment(
  browser: Window,
  root: HTMLElement,
): { variant: ArticleDiscoverVariant; preview: boolean } {
  const key = 'kb-article-discover-placement-v1'
  const forced = new URLSearchParams(browser.location.search).get('article_variant')
  let variant: ArticleDiscoverVariant
  const preview = forced === 'A' || forced === 'B'
  if (preview) variant = forced
  else {
    let saved: string | null = root.dataset.articleDiscoverAssignment ?? null
    if (saved !== 'A' && saved !== 'B') {
      try {
        saved = browser.localStorage.getItem(key)
      } catch {
        // Keep the assignment for this tab when browser storage is unavailable.
      }
    }
    variant = saved === 'A' || saved === 'B' ? saved : Math.random() < 0.5 ? 'A' : 'B'
    root.dataset.articleDiscoverAssignment = variant
    try {
      browser.localStorage.setItem(key, variant)
    } catch {
      // The in-memory assignment remains usable without persistent storage.
    }
  }
  root.dataset.articleDiscoverVariant = variant
  return { variant, preview }
}

export function initializeArticleDiscoverExperiment(): { variant: ArticleDiscoverVariant; preview: boolean } {
  if (typeof window === 'undefined' || typeof document === 'undefined') return { variant: 'A', preview: false }
  return assignArticleDiscoverExperiment(window, document.documentElement)
}

export const ARTICLE_DISCOVER_BOOTSTRAP = `if (typeof window !== 'undefined') (${assignArticleDiscoverExperiment.toString()})(window, document.documentElement);`
