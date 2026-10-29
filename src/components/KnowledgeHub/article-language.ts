export type ArticleLanguage = 'en' | 'zh'
export type ArticleLanguagesById = Record<string, string[]>

export const ARTICLE_LANGUAGE_STORAGE_KEY = 'kb-article-language'

export function asArticleLanguage(value: unknown): ArticleLanguage | null {
  return value === 'en' || value === 'zh' ? value : null
}

// A failed storage write still applies to links in the current tab.
let memoryPreference: ArticleLanguage | null = null
let storageWriteFailed = false
const listeners = new Set<() => void>()

export function getArticleLanguagePreference(): ArticleLanguage | null {
  if (typeof window === 'undefined') return null
  if (storageWriteFailed) return memoryPreference
  try {
    return asArticleLanguage(window.localStorage.getItem(ARTICLE_LANGUAGE_STORAGE_KEY))
  } catch {
    return memoryPreference
  }
}

export function setArticleLanguagePreference(language: ArticleLanguage): void {
  if (!asArticleLanguage(language) || typeof window === 'undefined') return
  memoryPreference = language
  try {
    window.localStorage.setItem(ARTICLE_LANGUAGE_STORAGE_KEY, language)
    storageWriteFailed = false
  } catch {
    storageWriteFailed = true
  }
  listeners.forEach(listener => listener())
}

export function subscribeArticleLanguagePreference(listener: () => void): () => void {
  listeners.add(listener)
  const onStorage = (event: StorageEvent) => {
    if (event.key !== ARTICLE_LANGUAGE_STORAGE_KEY && event.key !== null) return
    memoryPreference = asArticleLanguage(event.newValue)
    storageWriteFailed = false
    listener()
  }
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage)
  }
}

export function articleLinkLanguage(
  preference: ArticleLanguage | null,
  currentLanguage: string,
  availableLanguages: readonly string[] = [currentLanguage],
): ArticleLanguage {
  const preferred = preference ?? asArticleLanguage(currentLanguage) ?? 'en'
  return availableLanguages.includes(preferred) ? preferred : 'en'
}

const languagePrefix = /^\/(?:en|zh|es|fr|tr|ko|pt)(?=\/knowledge-base\/)/

function trustedArticleURL(href: string): URL | null {
  if (!href.startsWith('/') && !/^https?:\/\//i.test(href)) return null
  try {
    const url = new URL(href, 'https://www.nervos.org')
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !['www.nervos.org', 'nervos.org'].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password
    )
      return null
    return url
  } catch {
    return null
  }
}

// Next Link receives the unprefixed route and an explicit locale, avoiding
// duplicated prefixes while giving modified clicks a complete localized href.
export function articleLinkHref(href: string): string {
  const url = trustedArticleURL(href)
  if (!url) return href
  return url.pathname.replace(languagePrefix, '') + url.search + url.hash
}

export function resolveArticleContentLink(
  href: string,
  preference: ArticleLanguage | null,
  currentLanguage: string,
  languagesByArticle: ArticleLanguagesById,
): { href: string; locale: ArticleLanguage } | null {
  const url = trustedArticleURL(href)
  if (!url) return null
  const pathname = url.pathname.replace(languagePrefix, '')
  const encodedId = /^\/knowledge-base\/([^/]+)\/?$/.exec(pathname)?.[1]
  if (!encodedId) return null
  let id: string
  try {
    id = decodeURIComponent(encodedId)
  } catch {
    return null
  }
  if (!Object.prototype.hasOwnProperty.call(languagesByArticle, id)) return null
  return {
    href: pathname + url.search + url.hash,
    locale: articleLinkLanguage(preference, currentLanguage, languagesByArticle[id]),
  }
}
