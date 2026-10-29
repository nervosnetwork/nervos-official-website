import clsx from 'clsx'
import Link from 'next/link'
import Image from 'next/image'
import type { ReactNode } from 'react'
import { Icon } from './Icon'
import type { guideSteps } from './guide-data'
import styles from './components.module.scss'
import { KBArticle, formatArticleDate, articlePath } from './content'
import { ArticleAnalyticsContext, trackKBEvent } from './analytics'
import { kbHubPath } from '../../utils/kb-hubs'
import { ArticleLanguageLink } from './ArticleLanguageLink'

const numbers = ['One', 'Two', 'Three', 'Four', 'Five', 'Six']
const articleHref = (title: string) => `/knowledge-base/search?q=${encodeURIComponent(title)}`

// Match the existing 1200px grid, 16px gaps and 1px card borders. Tablet/mobile
// columns are fixed by CSS even when the desktop density control changes.
const gridImageSizes = {
  small:
    '(max-width: 540px) calc(100vw - 42px), (max-width: 750px) calc(50vw - 30px), (max-width: 1024px) calc(50vw - 42px), (max-width: 1264px) calc(20vw - 27.6px), 225.2px',
  medium:
    '(max-width: 540px) calc(100vw - 42px), (max-width: 750px) calc(50vw - 30px), (max-width: 1024px) calc(50vw - 42px), (max-width: 1264px) calc(25vw - 30px), 286px',
  large:
    '(max-width: 540px) calc(100vw - 42px), (max-width: 750px) calc(50vw - 30px), (max-width: 1024px) calc(50vw - 42px), (max-width: 1264px) calc(33.333333vw - 34px), 387.333333px',
}

function optimizableCover(src?: string | null): src is string {
  if (!src || !/^\/education_hub_articles\/[^/]+\/(?:[^/]+\/)*[^/]+\.(?:jpe?g|png)$/i.test(src)) return false
  try {
    return src
      .slice(1)
      .split('/')
      .every(segment => {
        const decoded = decodeURIComponent(segment)
        return decoded !== '.' && decoded !== '..' && !/[/\\\0?#]/.test(decoded)
      })
  } catch {
    return false
  }
}

// Preserve the original wrapper/crop and raw background fallback. GIF/APNG,
// WebP and external URLs are left untouched; Next also preserves any animated
// PNG detected from its bytes instead of converting it to a still image.
export function ArticleCover({
  src,
  className,
  sizes,
  ariaLabel,
  children,
}: {
  src?: string | null
  className?: string
  sizes: string
  ariaLabel?: string
  children?: ReactNode
}) {
  const optimized = optimizableCover(src)
  return (
    <div
      className={className}
      style={
        optimized
          ? { position: 'relative' }
          : src
            ? { backgroundImage: `url(${JSON.stringify(src)})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
      }
      aria-label={ariaLabel}
    >
      {optimized && (
        <Image
          src={src}
          alt=""
          fill
          loading="lazy"
          sizes={sizes}
          style={{ objectFit: 'cover', objectPosition: 'center' }}
        />
      )}
      {children}
    </div>
  )
}

export function ArrowButton({
  children,
  href,
  className,
  onClick,
  locale,
  direction = 'right',
}: {
  children: ReactNode
  href?: string
  className?: string
  onClick?: () => void
  locale?: string
  direction?: 'left' | 'right'
}) {
  const content = (
    <>
      {direction === 'left' && (
        <span className={styles.arrowButtonIcon} aria-hidden="true">
          ←
        </span>
      )}
      {children}
      {direction === 'right' && (
        <span className={styles.arrowButtonIcon} aria-hidden="true">
          →
        </span>
      )}
    </>
  )
  const classes = clsx(styles.arrowButton, direction === 'left' && styles.arrowButtonBack, className)

  return href ? (
    <Link className={classes} href={href} onClick={onClick} locale={locale}>
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
          <ArticleLanguageLink
            article={articles?.[index]}
            href={articles?.[index] ? articlePath(articles[index]!) : articleHref(title)}
            onClick={() => {
              const article = articles?.[index]
              if (article && analyticsContext)
                trackKBEvent('kb_article_click', {
                  ...analyticsContext,
                  article_id: article.id,
                  hub_id: analyticsContext.hub_id ?? article.hub ?? undefined,
                  position: index + 1,
                })
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
          </ArticleLanguageLink>
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
            href={kbHubPath(hubId ?? name) ?? '/knowledge-base'}
            locale="en"
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
        href={kbHubPath(hubId ?? name) ?? '/knowledge-base'}
        locale="en"
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
        <p className={styles.callout}>{step.summary}</p>
        <p className={styles.stepBody}>{step.body}</p>
        {!!step.points.length && (
          <ul className={styles.points}>
            {step.points.map(point => (
              <li key={point}>
                <Icon name="startBody-imgArrowArrowCircleRight" size={24} />
                <span>
                  <strong>{point.slice(0, point.indexOf(':') + 1)}</strong>
                  {point.slice(point.indexOf(':') + 1)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {step.actions && (
        <ul className={clsx(styles.readingList, styles.stepActions)}>
          {step.actions.map(action => (
            <li key={action.resourceId}>
              <Link
                href={action.href}
                onClick={() =>
                  trackKBEvent('kb_resource_click', {
                    resource_id: action.resourceId,
                    placement: 'start_here_actions',
                  })
                }
              >
                <span className={styles.readingTitle}>
                  {action.title}: {action.description}
                </span>
                <span className={styles.stepActionEnd}>
                  <span className={styles.stepActionLabel}>{action.label}</span>
                  <span className={styles.stepActionArrow} aria-hidden="true">
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
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
          <span>{article ? article.authors.join(', ') || 'Nervos Network' : 'Nervos'}</span>
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
  hidden = false,
  imageSizes,
  article,
  analyticsContext,
}: {
  title: string
  tag?: string
  size?: 'small' | 'medium' | 'large'
  className?: string
  horizontal?: boolean
  hidden?: boolean
  imageSizes?: string
  article?: KBArticle
  analyticsContext?: ArticleAnalyticsContext
}) {
  const trackClick = () => {
    if (article && analyticsContext)
      trackKBEvent('kb_article_click', {
        ...analyticsContext,
        article_id: article.id,
        hub_id: analyticsContext.hub_id ?? article.hub ?? undefined,
      })
  }
  if (horizontal)
    return (
      <ArticleLanguageLink
        article={article}
        href={article ? articlePath(article) : articleHref(title)}
        className={styles.horizontalCard}
        hidden={hidden || undefined}
        style={hidden ? { display: 'none' } : undefined}
        tabIndex={hidden ? -1 : undefined}
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
        <ArticleCover
          src={article?.coverImage}
          className={styles.horizontalCover}
          sizes={imageSizes ?? '(max-width: 750px) 88px, 200px'}
          ariaLabel="Article cover"
        />
      </ArticleLanguageLink>
    )
  return (
    <ArticleLanguageLink
      article={article}
      href={article ? articlePath(article) : articleHref(title)}
      className={clsx(styles.articleCard, styles[size], article && styles.populated, className)}
      hidden={hidden || undefined}
      style={hidden ? { display: 'none' } : undefined}
      tabIndex={hidden ? -1 : undefined}
      onClick={trackClick}
    >
      <ArticleCover src={article?.coverImage} className={styles.cover} sizes={imageSizes ?? gridImageSizes[size]}>
        {!article?.coverImage && <span>{article ? 'No cover image' : 'Cover image'}</span>}
      </ArticleCover>
      {tag && <span className={styles.tag}>{tag}</span>}
      <h3 className={styles.cardTitle} title={article ? title : undefined}>
        {title}
      </h3>
      <CardMeta article={article} />
    </ArticleLanguageLink>
  )
}
