import clsx from 'clsx'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { guideSteps } from './guide-data'
import styles from './components.module.scss'
import { KBArticle, formatArticleDate, articlePath } from './content'
import { ArticleAnalyticsContext, trackKBEvent } from './analytics'

const numbers = ['One', 'Two', 'Three', 'Four', 'Five', 'Six']
const articleHref = (title: string) => `/knowledge-base/search?q=${encodeURIComponent(title)}`

export function ArrowButton({
  children,
  href,
  className,
  onClick,
}: {
  children: ReactNode
  href?: string
  className?: string
  onClick?: () => void
}) {
  const content = (
    <>
      {children}
      <span className={styles.arrowButtonIcon} aria-hidden="true">
        →
      </span>
    </>
  )
  const classes = clsx(styles.arrowButton, className)

  return href ? (
    <Link className={classes} href={href} onClick={onClick}>
      {content}
    </Link>
  ) : (
    <button type="button" className={classes} onClick={onClick}>
      {content}
    </button>
  )
}

export function SubjectCard({
  title,
  icon,
  step,
  selected,
  href,
  onClick,
}: {
  title: string
  icon?: string
  step?: number
  selected: boolean
  href?: string
  onClick?: () => void
}) {
  const content = (
    <>
      {step ? (
        <span className={styles.stepIndex}>{String(step).padStart(2, '0')}</span>
      ) : (
        icon && <Icon name={icon} size={40} />
      )}
      <span>{title}</span>
    </>
  )
  const className = clsx(styles.subject, selected && styles.selected)
  return href ? (
    <a href={href} className={className} aria-current={selected ? 'step' : undefined} onClick={onClick}>
      {content}
    </a>
  ) : (
    <button type="button" className={className} aria-pressed={selected} onClick={onClick}>
      {content}
    </button>
  )
}

export function ReadingList({
  titles,
  compact = false,
  articles,
  analyticsContext,
}: {
  titles: string[]
  compact?: boolean
  articles?: KBArticle[]
  analyticsContext?: ArticleAnalyticsContext
}) {
  return (
    <ul className={clsx(styles.readingList, compact && styles.compactReading)}>
      {titles.map((title, index) => (
        <li key={`${title}-${index}`}>
          <Link
            href={articles?.[index] ? articlePath(articles[index]!) : articleHref(title)}
            onClick={() => {
              const article = articles?.[index]
              if (article && analyticsContext)
                trackKBEvent('kb_article_click', { ...analyticsContext, article_id: article.id })
            }}
          >
            <span className={styles.readingTitle}>{title}</span>
            <span className={styles.readingAction}>
              <small>
                <Icon name="topics-imgLayer15" size={12} />
                {articles?.[index]?.readingMinutes ?? 5}
                {compact ? 'm' : ' min read'}
              </small>
              <span className={styles.readingArrow} aria-hidden="true">
                →
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

export function HubCard({
  name,
  description,
  titles,
  articles,
  hubId,
  count,
}: {
  name: string
  description: string
  index?: number
  titles: string[]
  articles?: KBArticle[]
  hubId?: string
  count?: number
}) {
  return (
    <article className={styles.hubCard}>
      <div className={styles.hubContent}>
        <h3>
          <Link
            href={`/knowledge-base/topic?hub=${encodeURIComponent(hubId ?? name)}`}
            onClick={() => hubId && trackKBEvent('kb_hub_click', { hub_id: hubId, placement: 'home_hub_heading' })}
          >
            {name}
          </Link>
        </h3>
        <p>{description}</p>
        <ReadingList
          titles={titles}
          articles={articles}
          compact
          analyticsContext={{ placement: 'hub_featured', hub_id: hubId }}
        />
      </div>
      <Link
        className={styles.count}
        href={`/knowledge-base/topic?hub=${encodeURIComponent(hubId ?? name)}`}
        onClick={() => hubId && trackKBEvent('kb_hub_click', { hub_id: hubId, placement: 'home_hub_count' })}
      >
        {count ?? 14} Articles <span aria-hidden="true">→</span>
      </Link>
    </article>
  )
}

export function StepSection({
  step,
  index,
  articles,
}: {
  step: (typeof guideSteps)[number]
  index: number
  articles?: KBArticle[]
}) {
  return (
    <section id={step.id} className={styles.stepSection}>
      <div className={styles.stepTop}>
        <div className={styles.stepLabel}>
          Step <Icon name={`topics-imgNumber${numbers[index] ?? 'One'}Circle`} size={25} />
        </div>
        <h2>{step.title}</h2>
        <p className={styles.callout}>
          <strong>{step.summary.slice(0, step.summary.indexOf(':') + 1)}</strong>
          {step.summary.slice(step.summary.indexOf(':') + 1)}
        </p>
        <p className={styles.stepBody}>{step.body}</p>
        {!!step.points.length && (
          <ul className={styles.points}>
            {step.points.map(point => (
              <li key={point}>
                <Icon name="startBody-imgArrowArrowCircleRight" size={24} />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {(articles ? articles.length > 0 : step.reading.length > 0) && (
        <div className={styles.deeper}>
          <h3>
            Go deeper <Icon name="startBody-imgArrowArrowSubRightDown" size={24} />
          </h3>
          <ReadingList
            titles={articles ? articles.map(a => a.title) : step.reading}
            articles={articles}
            analyticsContext={{ placement: 'start_here_reading', step: index + 1 }}
          />
        </div>
      )}
    </section>
  )
}

export function CardMeta({ author = false, article }: { author?: boolean; article?: KBArticle }) {
  return (
    <div className={styles.meta}>
      <Icon name="articleBody-imgGroup58" size={18} />
      {author && (
        <>
          <span>{article ? article.authors.join(', ') || 'Author not supplied' : 'Nervos'}</span>
          <span>·</span>
        </>
      )}
      <span>{article ? formatArticleDate(article.date) : 'February 28, 2023'}</span>
      <span>·</span>
      <Icon name="topics-imgLayer15" size={12} />
      <span>{article?.readingMinutes ?? 5} min read</span>
    </div>
  )
}

export function ArticleCard({
  title,
  tag,
  size = 'medium',
  className,
  horizontal = false,
  article,
  analyticsContext,
}: {
  title: string
  tag?: string
  size?: 'small' | 'medium' | 'large'
  className?: string
  horizontal?: boolean
  article?: KBArticle
  analyticsContext?: ArticleAnalyticsContext
}) {
  const trackClick = () => {
    if (article && analyticsContext) trackKBEvent('kb_article_click', { ...analyticsContext, article_id: article.id })
  }
  if (horizontal)
    return (
      <Link
        href={article ? articlePath(article) : articleHref(title)}
        className={styles.horizontalCard}
        onClick={trackClick}
      >
        <div>
          <h3>{title}</h3>
          <p>{article ? article.subtitle : 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'}</p>
          <div className={styles.tags}>
            {(article ? [] : ['Nervos', 'Blockchain', 'Crypto', 'PoW']).map(t => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <CardMeta author article={article} />
        </div>
        <div
          className={styles.horizontalCover}
          style={
            article?.coverImage
              ? {
                  backgroundImage: `url(${JSON.stringify(article.coverImage)})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : undefined
          }
          aria-label="Article cover"
        />
      </Link>
    )
  return (
    <Link
      href={article ? articlePath(article) : articleHref(title)}
      className={clsx(styles.articleCard, styles[size], article && styles.populated, className)}
      onClick={trackClick}
    >
      <div
        className={styles.cover}
        style={
          article?.coverImage
            ? {
                backgroundImage: `url(${JSON.stringify(article.coverImage)})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : undefined
        }
      >
        {!article?.coverImage && <span>{article ? 'No cover image' : 'Cover image'}</span>}
        {tag && <span className={styles.tag}>{tag}</span>}
      </div>
      <h3 className={styles.cardTitle} title={article ? title : undefined}>
        {title}
      </h3>
      <CardMeta article={article} />
    </Link>
  )
}
