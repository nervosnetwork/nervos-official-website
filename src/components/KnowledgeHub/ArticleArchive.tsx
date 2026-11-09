import clsx from 'clsx'
import { useState } from 'react'
import Pagination from '../Pagination'
import { ArticleCard } from './Components'
import { ArticleGridControls } from './ArticleGridControls'
import { ArticleSearch } from './ArticleSearch'
import { Breadcrumb, PreviewPage } from './Shared'
import type { LibraryProps } from './Library'
import styles from './pages-v2.module.scss'
import { trackKBEvent } from './analytics'

export function ArticleArchive({ catalog, page, total }: Pick<LibraryProps, 'catalog' | 'page' | 'total'>) {
  const [density, setDensity] = useState(4)
  // Catalogs contain only real translations. Empty untranslated locale pages
  // refer to English; pagination keeps its own canonical, without tracking keys.
  const language = catalog.articles[0]?.language ?? 'en'
  const localePrefix = language === 'en' ? '' : `/${language}`
  const canonicalPath = `${localePrefix}/knowledge-base/articles${page > 1 ? `?page=${page}` : ''}`

  return (
    <PreviewPage
      title={page > 1 ? `All articles — Page ${page}` : 'All articles'}
      description="Explore articles from across the Knowledge Base."
      canonicalPath={canonicalPath}
      revision
      headerClassName={styles.scrollingHeader}
    >
      <div className={clsx(styles.container, styles.archivePage)}>
        <div className={styles.breadcrumbDock}>
          <Breadcrumb current="All articles" revision />
        </div>
        <header className={styles.topicHero}>
          <h1 id="all-articles-title">All Articles</h1>
          <p>Explore articles from across the Knowledge Base.</p>
        </header>
        <div className={styles.archiveRail}>
          <div className={styles.topicToolbar}>
            <div className={styles.archiveSearch}>
              <ArticleSearch />
            </div>
            <ArticleGridControls
              density={density}
              onDensityChange={setDensity}
              placement="archive"
              pageType="all_articles"
            />
          </div>
        </div>
        <section className={styles.topicArticles} aria-labelledby="all-articles-title">
          <div className={clsx(styles.topicGrid, styles[`density${density}`])}>
            {catalog.articles.map((article, index) => (
              <ArticleCard
                key={article.id}
                article={article}
                title={article.title}
                analyticsContext={{ placement: 'archive_articles', position: index + 1 }}
                size={density === 5 ? 'small' : density === 3 ? 'large' : 'medium'}
              />
            ))}
          </div>
          {!catalog.articles.length && (
            <p role="status" className={styles.empty}>
              No articles available in this language.
            </p>
          )}
          <p className={styles.srOnly} aria-live="polite">
            Showing {catalog.articles.length} of {total} articles, latest to oldest
          </p>
        </section>
        <Pagination
          pageCount={Math.ceil(total / 24)}
          currentPage={page}
          className={styles.numberedPagination}
          hrefForPage={destination => `/knowledge-base/articles?page=${destination}`}
          onPageChange={destination =>
            trackKBEvent('kb_pagination_click', {
              placement: 'archive',
              page: destination,
              page_type: 'all_articles',
              direction: destination < page ? 'previous' : 'next',
            })
          }
        />
      </div>
    </PreviewPage>
  )
}
