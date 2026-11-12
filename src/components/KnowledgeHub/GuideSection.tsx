import clsx from 'clsx'
import { ArticleLanguageLink } from './ArticleLanguageLink'
import { Icon } from './Icon'
import { trackKBEvent } from './analytics'
import { articlePath, type KBArticle } from './content'
import type { guideSteps } from './guide-data'
import componentStyles from './components.module.scss'
import styles from './start-here.module.scss'

const pointIcons = [
  ['guide-blockchain', 'guide-token', 'guide-network'],
  ['guide-cell-model', 'guide-risc-v', 'subject-digital-signatures'],
  ['guide-shield', 'subject-layered-scaling', 'subject-ecosystem-development'],
  ['guide-crypto-agility', 'guide-protected-wallet', 'guide-future'],
]

export function GuideSection({
  step,
  index,
  articles,
}: {
  step: (typeof guideSteps)[number]
  index: number
  articles: KBArticle[]
}) {
  return (
    <section id={step.id} className={styles.chapter} aria-labelledby={`${step.id}-title`} tabIndex={-1}>
      <h2 id={`${step.id}-title`} tabIndex={-1}>
        {step.title}
      </h2>
      <p className={styles.summary}>{step.summary}</p>
      <p className={styles.body}>{step.body}</p>
      <ul className={step.actions?.length ? styles.actions : styles.concepts}>
        {step.points.map((point, pointIndex) => {
          const separator = point.indexOf(':')
          const title = point.slice(0, separator)
          const description = point.slice(separator + 1).trim()
          const icon = pointIcons[index]?.[pointIndex] ?? 'subject-nervos-introduction'
          return (
            <li key={title}>
              <span className={styles.conceptIcon} aria-hidden="true">
                <Icon name={icon} size={28} />
              </span>
              <h3 id={`${step.id}-point-${pointIndex + 1}`} tabIndex={-1}>
                {title}
              </h3>
              <p>{description}</p>
            </li>
          )
        })}
        {step.actions?.map((action, actionIndex) => {
          return (
            <li key={action.resourceId}>
              <a
                className={clsx(componentStyles.stepActionLink, styles.actionLink)}
                href={action.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={action.label}
                aria-describedby={`${step.id}-${action.resourceId}-description`}
                onClick={() =>
                  trackKBEvent('kb_resource_click', {
                    resource_id: action.resourceId,
                    placement: 'start_here_actions',
                    link_url: action.href,
                  })
                }
              >
                <span className={clsx(componentStyles.stepActionIcon, styles.actionIcon)} aria-hidden="true">
                  <span
                    className={componentStyles.stepActionGlyph}
                    style={{ maskImage: `url("/images/knowledge-hub/${action.icon}.svg")` }}
                  />
                </span>
                <h3
                  id={`${step.id}-point-${actionIndex + 1}`}
                  className={componentStyles.stepActionLabel}
                  tabIndex={-1}
                >
                  {action.label}
                </h3>
                <div className={clsx(componentStyles.stepActionDetails, styles.actionDetails)}>
                  <div className={componentStyles.stepActionClip} id={`${step.id}-${action.resourceId}-description`}>
                    <p>{action.title}</p>
                    <p>{action.description}</p>
                  </div>
                </div>
              </a>
            </li>
          )
        })}
      </ul>
      {articles.length > 0 && (
        <div className={styles.reading}>
          <h3>READ NEXT</h3>
          <ul>
            {articles.map((article, articleIndex) => (
              <li key={article.id}>
                <ArticleLanguageLink
                  article={article}
                  href={articlePath(article)}
                  onClick={() =>
                    trackKBEvent('kb_article_click', {
                      placement: 'start_here_reading',
                      step: index + 1,
                      article_id: article.id,
                      hub_id: article.hub ?? undefined,
                      position: articleIndex + 1,
                    })
                  }
                >
                  <span className={styles.readingTitle}>{article.title}</span>
                  <span className={styles.readingAction}>
                    <span className={styles.readingTime}>
                      <Icon name="topics-imgLayer15" size={14} />
                      {article.readingMinutes ?? 5} min read
                    </span>
                    <span className={styles.readingArrow} aria-hidden="true">
                      →
                    </span>
                  </span>
                </ArticleLanguageLink>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
