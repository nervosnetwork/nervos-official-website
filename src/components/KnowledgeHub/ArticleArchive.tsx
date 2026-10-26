import clsx from 'clsx'
import Link from 'next/link'
import { useState, type CSSProperties } from 'react'
import { ArticleCard } from './Components'
import { ArticleGridControls } from './ArticleGridControls'
import { Breadcrumb, PreviewPage } from './Shared'
import { useHeroScroll } from './useHeroScroll'
import type { LibraryProps } from './Library'
import styles from './pages-v2.module.scss'
import { trackKBEvent } from './analytics'

export function ArticleArchive({ catalog, page, total }: Pick<LibraryProps, 'catalog' | 'page' | 'total'>) {
  const [density, setDensity] = useState(4)
  const { heroFade, breadcrumbHeight, breadcrumbRef } = useHeroScroll()

  return (
    <PreviewPage title="All articles" revision headerClassName={styles.scrollingHeader}>
      <div
        className={styles.container}
        style={{ '--heroFade': heroFade, '--breadcrumbHeight': `${breadcrumbHeight}px` } as CSSProperties}
      >
        <div className={styles.breadcrumbDock} ref={breadcrumbRef}>
          <Breadcrumb current="All articles" revision />
        </div>
        <header className={styles.topicHero}>
          <h1 id="all-articles-title">All articles</h1>
          <p>Explore articles from across the Knowledge Base.</p>
        </header>
        <div className={clsx(styles.topicRail, styles.archiveRail)} style={{ paddingTop: `${48 * (1 - heroFade)}px` }}>
          <div className={styles.topicToolbar}>
            <span className={styles.archiveCount}>{total} articles</span>
            <ArticleGridControls density={density} onDensityChange={setDensity} placement="archive" />
          </div>
        </div>
        <section className={styles.topicArticles} aria-labelledby="all-articles-title">
          <div className={clsx(styles.topicGrid, styles[`density${density}`])}>
            {catalog.articles.map(article => (
              <ArticleCard
                key={article.id}
                article={article}
                title={article.title}
                analyticsContext={{ placement: 'archive_articles' }}
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
        <nav aria-label="Pagination" className={styles.pager}>
          {page > 1 && (
            <Link
              href={`/knowledge-base/articles?page=${page - 1}`}
              onClick={() => trackKBEvent('kb_pagination_click', { placement: 'archive', page: page - 1 })}
            >
              ← Previous
            </Link>
          )}
          <span>
            Page {page} of {Math.max(1, Math.ceil(total / 24))}
          </span>
          {page * 24 < total && (
            <Link
              href={`/knowledge-base/articles?page=${page + 1}`}
              onClick={() => trackKBEvent('kb_pagination_click', { placement: 'archive', page: page + 1 })}
            >
              Keep reading →
            </Link>
          )}
        </nav>
      </div>
    </PreviewPage>
  )
}
