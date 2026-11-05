import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { ArticleLanguageLink } from './ArticleLanguageLink'
import { articlePath } from './content'
import type { KBArticle } from './content'
import { trackKBEvent } from './analytics'
import { trackKBSearch } from './search-analytics'
import styles from './article-search.module.scss'

function SearchCloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function ArticleSearch({
  initialQuery = '',
  placement = 'archive',
  resultsCount,
}: {
  initialQuery?: string
  placement?: 'archive' | 'search'
  resultsCount?: number
} = {}) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)
  const [showSearch, setShowSearch] = useState(false)
  const [matches, setMatches] = useState<KBArticle[]>([])
  const [searchStatus, setSearchStatus] = useState('Searching…')

  useEffect(() => {
    const controller = new AbortController()
    setMatches([])
    setSearchStatus('Searching…')
    if (!showSearch || !query.trim()) return
    const timer = setTimeout(() => {
      void fetch(`/api/kb-search?q=${encodeURIComponent(query)}&locale=${encodeURIComponent(router.locale ?? 'en')}`, {
        signal: controller.signal,
      })
        .then(async response => {
          if (!response.ok) throw new Error('Search unavailable')
          return response.json() as Promise<KBArticle[]>
        })
        .then(items => {
          if (controller.signal.aborted) return
          setMatches(items)
          setSearchStatus(items.length ? '' : `No results for '${query.trim()}'. Try adjusting your search terms.`)
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchStatus('Search unavailable. Please try again.')
        })
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, router.locale, showSearch])

  return (
    <div
      className={styles.searchWrap}
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setShowSearch(false)
      }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault()
          setShowSearch(false)
        }
      }}
    >
      <form
        role="search"
        onSubmit={event => {
          event.preventDefault()
          if (!query.trim()) {
            setShowSearch(true)
            return
          }
          trackKBSearch(
            query,
            placement === 'archive' ? 'archive_search' : 'search',
            router.locale,
            query.slice(0, 200) === initialQuery ? resultsCount : undefined,
          )
          void router.push(`/knowledge-base/search?q=${encodeURIComponent(query)}`)
        }}
      >
        <input
          type="search"
          aria-label="Search articles"
          placeholder="Search all articles"
          maxLength={200}
          value={query}
          onFocus={() => setShowSearch(true)}
          onChange={event => {
            setQuery(event.target.value)
            setShowSearch(true)
          }}
        />
        {query && (
          <button
            type="button"
            className={styles.clearSearch}
            aria-label="Clear search"
            onClick={event => {
              setQuery('')
              setShowSearch(true)
              event.currentTarget.form?.querySelector('input')?.focus()
            }}
          >
            <SearchCloseIcon />
          </button>
        )}
        <button aria-label="Search">
          <Icon name="popular-img9026843MagnifyingGlassThinIcon1" />
        </button>
      </form>
      {showSearch && (
        <div className={styles.searchResults}>
          <div className={styles.searchCaption}>
            Search results
            <button type="button" onClick={() => setShowSearch(false)} aria-label="Close search results">
              <SearchCloseIcon />
            </button>
          </div>
          {!query.trim() ? (
            <p role="status">Enter a search term.</p>
          ) : matches.length ? (
            matches.map((article, index) => (
              <ArticleLanguageLink
                article={article}
                key={article.id}
                href={articlePath(article)}
                onClick={() =>
                  trackKBEvent('kb_article_click', {
                    article_id: article.id,
                    placement: placement === 'archive' ? 'archive_search_suggestion' : 'search_suggestion',
                    hub_id: article.hub ?? undefined,
                    position: index + 1,
                  })
                }
              >
                {article.title}
              </ArticleLanguageLink>
            ))
          ) : (
            <p role="status">{searchStatus}</p>
          )}
          {query.trim() && (
            <Link
              href={`/knowledge-base/search?q=${encodeURIComponent(query)}`}
              onClick={() => trackKBSearch(query, `${placement}_all_search_results`, router.locale)}
            >
              View all results →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
