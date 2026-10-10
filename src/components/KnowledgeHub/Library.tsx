import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import clsx from 'clsx'
import { hubs } from './fixtures'
import { Icon } from './Icon'
import { PreviewPage, Breadcrumb } from './Shared'
import { ArticleCard, SubjectCard } from './Components'
import { KBCatalog } from './content'
import styles from './pages-v2.module.scss'
import homeStyles from './home-v2.module.scss'
import { searchLengthBucket, trackKBEvent } from './analytics'

export interface LibraryProps {
  catalog: KBCatalog
  mode: 'topic' | 'archive' | 'search'
  hubId: string
  query: string
  page: number
  total: number
}
export function Library({ catalog, mode, hubId, query, page, total }: LibraryProps) {
  const router = useRouter()
  const hub = catalog.hubs.find(h => h.id === hubId)
  const title = mode === 'search' ? 'Search articles' : mode === 'archive' ? 'All articles' : (hub?.heading ?? 'Topic')
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
        <Breadcrumb current={title} revision />
        <header className={styles.topicHero}>
          <h1>{title}</h1>
          {mode === 'topic' && <p>{hubs.find(h => h.name === hub?.name)?.description}</p>}
        </header>
        {mode === 'search' && (
          <div className={homeStyles.searchWrap}>
            <form
              role="search"
              onSubmit={event => {
                event.preventDefault()
                const value = new FormData(event.currentTarget).get('q')
                trackKBEvent('kb_search_submit', {
                  placement: 'search',
                  query_length_bucket: searchLengthBucket(String(value || '')),
                })
                void router.push(`/knowledge-base/search?q=${encodeURIComponent(String(value || ''))}`)
              }}
            >
              <input
                aria-label="Search articles"
                placeholder="Search all articles"
                key={query}
                name="q"
                defaultValue={query}
                type="search"
                maxLength={200}
              />
              <button aria-label="Search">
                <Icon name="popular-img9026843MagnifyingGlassThinIcon1" />
              </button>
            </form>
          </div>
        )}
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
        <div className={styles.topicToolbar}>
          <Link
            href="/knowledge-base/articles"
            onClick={() => trackKBEvent('kb_cta_click', { cta_id: 'all_articles', placement: mode })}
          >
            Browse all articles →
          </Link>
          <div className={styles.controls} aria-label="Article layout">
            {(['grid', 'list'] as const).map(value => (
              <button
                className={styles.filterButton}
                key={value}
                aria-pressed={view === value}
                onClick={() => {
                  if (value !== view) trackKBEvent('kb_layout_change', { placement: mode, layout: value })
                  setView(value)
                  try {
                    localStorage.setItem('kb-layout', value)
                  } catch {
                    /* Optional preference. */
                  }
                }}
              >
                {value === 'grid' && <span className={styles.gridIcon} aria-hidden="true" />}
                {value === 'list' && <Icon name="topicHero-imgInterfaceBookOpen" size={20} />}
                {value === 'grid' ? 'Grid' : 'List'}
              </button>
            ))}
          </div>
        </div>
        {groups.map(subject => (
          <section key={subject.id} id={subject.id} className={styles.topicArticles} style={{ scrollMarginTop: 120 }}>
            <h2>{subject.name}</h2>
            <div className={view === 'grid' ? clsx(styles.topicGrid, styles.density4) : undefined}>
              {catalog.articles
                .filter(a => mode !== 'topic' || a.subjects[0] === subject.id)
                .map(article => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    title={article.title}
                    horizontal={view === 'list'}
                    analyticsContext={
                      mode === 'topic'
                        ? { placement: 'topic_articles', hub_id: hubId, subject_id: subject.id }
                        : { placement: mode === 'search' ? 'search_results' : 'archive_articles' }
                    }
                  />
                ))}
            </div>
          </section>
        ))}
        {!catalog.articles.length && (
          <p role="status">
            {mode === 'search' && !query ? 'Enter a search term.' : 'No articles available in this language.'}
          </p>
        )}
        {mode !== 'topic' && (
          <nav aria-label="Pagination" className={styles.topicToolbar}>
            {page > 1 && (
              <Link
                href={`/knowledge-base/${mode === 'search' ? 'search' : 'articles'}?page=${page - 1}${mode === 'search' ? `&q=${encodeURIComponent(query)}` : ''}`}
                onClick={() => trackKBEvent('kb_pagination_click', { placement: mode, page: page - 1 })}
              >
                ← Previous
              </Link>
            )}
            <span>
              Page {page} of {Math.max(1, Math.ceil(total / 24))}
            </span>
            {page * 24 < total && (
              <Link
                href={`/knowledge-base/${mode === 'search' ? 'search' : 'articles'}?page=${page + 1}${mode === 'search' ? `&q=${encodeURIComponent(query)}` : ''}`}
                onClick={() => trackKBEvent('kb_pagination_click', { placement: mode, page: page + 1 })}
              >
                Keep reading →
              </Link>
            )}
          </nav>
        )}
      </div>
    </PreviewPage>
  )
}
