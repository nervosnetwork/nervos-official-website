import { useEffect, useState } from 'react'
import Link from 'next/link'
import clsx from 'clsx'
import Pagination from '../Pagination'
import { hubs } from './fixtures'
import { ArticleSearch } from './ArticleSearch'
import { PreviewPage, Breadcrumb } from './Shared'
import { ArticleCard, SubjectCard } from './Components'
import { KBCatalog } from './content'
import styles from './pages-v2.module.scss'
import { trackKBEvent } from './analytics'

export interface LibraryProps {
  catalog: KBCatalog
  mode: 'topic' | 'archive' | 'search'
  hubId: string
  query: string
  page: number
  total: number
}
export function Library({ catalog, mode, hubId, query, page, total }: LibraryProps) {
  const hub = catalog.hubs.find(h => h.id === hubId)
  const title = mode === 'search' ? 'Search results' : mode === 'archive' ? 'All articles' : (hub?.heading ?? 'Topic')
  const [view, setView] = useState('grid')
  useEffect(() => {
    try {
      setView(localStorage.getItem('kb-layout') === 'list' ? 'list' : 'grid')
    } catch {
      /* Optional preference. */
    }
  }, [])
  const groups =
    mode === 'topic'
      ? catalog.subjects.filter(s => s.hub === hubId && catalog.articles.some(a => a.subjects[0] === s.id))
      : [{ id: 'articles', name: mode === 'search' ? `${total} results` : `${total} articles` }]
  return (
    <PreviewPage title={title} revision noindex={mode === 'search'}>
      <div className={clsx(styles.container, mode === 'search' && styles.searchPage)}>
        <Breadcrumb
          current={title}
          revision
          parents={
            mode === 'search'
              ? [{ label: 'All articles', href: '/knowledge-base/articles', ctaId: 'all_articles' }]
              : undefined
          }
        />
        <header className={styles.topicHero}>
          <h1 id="library-title">{mode === 'search' ? `${total} ${total === 1 ? 'result' : 'results'}` : title}</h1>
          {mode === 'topic' && <p>{hubs.find(h => h.name === hub?.name)?.description}</p>}
        </header>
        <div className={clsx(styles.topicToolbar, mode === 'search' && styles.searchToolbar)}>
          {mode === 'search' && (
            <ArticleSearch key={query} initialQuery={query} placement="search" resultsCount={total} />
          )}
          {mode !== 'search' && (
            <Link
              href="/knowledge-base/articles"
              onClick={() => trackKBEvent('kb_cta_click', { cta_id: 'all_articles', placement: mode })}
            >
              Browse all articles →
            </Link>
          )}
          <div className={styles.layoutToggle} role="group" aria-label="Article layout">
            {(['grid', 'list'] as const).map(value => (
              <button
                type="button"
                className={styles.layoutButton}
                key={value}
                aria-label={`${value === 'grid' ? 'Grid' : 'List'} view`}
                aria-pressed={view === value}
                onClick={() => {
                  if (value !== view)
                    trackKBEvent('kb_layout_change', {
                      placement: mode,
                      layout: value,
                      columns: value === 'grid' ? 4 : 1,
                    })
                  setView(value)
                  try {
                    localStorage.setItem('kb-layout', value)
                  } catch {
                    /* Optional preference. */
                  }
                }}
              >
                {value === 'grid' ? (
                  <span className={styles.gridIcon} aria-hidden="true" />
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M9 6h11M9 12h11M9 18h11" />
                    <path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth="3" />
                  </svg>
                )}
                <span className={styles.layoutLabel}>{value === 'grid' ? 'Grid' : 'List'}</span>
              </button>
            ))}
          </div>
        </div>
        {mode === 'topic' && (
          <nav className={styles.subjectNav} aria-label="Subjects">
            {groups.map(s => (
              <SubjectCard
                key={s.id}
                title={s.name}
                icon="topicHero-imgInterfaceBookOpen"
                selected={false}
                href={`#${s.id}`}
                onClick={() =>
                  trackKBEvent('kb_subject_select', { hub_id: hubId, subject_id: s.id, placement: 'topic' })
                }
              />
            ))}
          </nav>
        )}
        {groups.map(subject => (
          <section
            key={subject.id}
            id={subject.id}
            className={styles.topicArticles}
            aria-labelledby={mode === 'search' ? 'library-title' : undefined}
            style={{ scrollMarginTop: 120 }}
          >
            {mode !== 'search' && <h2>{subject.name}</h2>}
            <div className={view === 'grid' ? clsx(styles.topicGrid, styles.density4) : styles.searchList}>
              {catalog.articles
                .filter(a => mode !== 'topic' || a.subjects[0] === subject.id)
                .map((article, index) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    title={article.title}
                    horizontal={view === 'list'}
                    analyticsContext={
                      mode === 'topic'
                        ? { placement: 'topic_articles', hub_id: hubId, subject_id: subject.id, position: index + 1 }
                        : { placement: mode === 'search' ? 'search_results' : 'archive_articles', position: index + 1 }
                    }
                  />
                ))}
            </div>
          </section>
        ))}
        {!catalog.articles.length && (mode !== 'search' || query.trim()) && (
          <p role="status" className={mode === 'search' ? styles.searchEmpty : undefined}>
            {mode === 'search' ? (
              <>
                No results for &apos;<strong>{query.trim()}</strong>&apos;. Try adjusting your search terms.
              </>
            ) : (
              'No articles available in this language.'
            )}
          </p>
        )}
        {mode !== 'topic' && (
          <Pagination
            pageCount={Math.ceil(total / 24)}
            currentPage={page}
            className={styles.numberedPagination}
            hrefForPage={destination =>
              `/knowledge-base/${mode === 'search' ? 'search' : 'articles'}?page=${destination}${mode === 'search' ? `&q=${encodeURIComponent(query)}` : ''}`
            }
            onPageChange={destination =>
              trackKBEvent('kb_pagination_click', {
                placement: mode,
                page: destination,
                page_type: mode === 'search' ? 'search' : 'all_articles',
                direction: destination < page ? 'previous' : 'next',
              })
            }
          />
        )}
      </div>
    </PreviewPage>
  )
}
