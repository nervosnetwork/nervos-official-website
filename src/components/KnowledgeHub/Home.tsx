import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Page } from '../Page'
import { hubs } from './fixtures'
import { KBCatalog, featuredArticles, articlePath } from './content'
import type { KBMostRead } from './content'
import styles from './home-v2.module.scss'
import { Icon } from './Icon'
import { ArrowButton, HubCard, ArticleCover } from './Components'
import { KnowledgeFooter } from './KnowledgeFooter'
import { GuideLife } from './GuideLife'
import { NeuronIcon } from './NeuronIcon'
import { trackKBEvent } from './analytics'
import { useNewsletterSignup } from './useNewsletterSignup'
import { ArticleLanguageLink } from './ArticleLanguageLink'

export { Icon } from './Icon'

export function Eyebrow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className={styles.eyebrow}>
      <Icon name={icon} />
      {children}
    </div>
  )
}

export function KnowledgeHubHome({
  catalog,
  counts,
  mostRead,
}: {
  catalog: KBCatalog
  counts: Record<string, number>
  mostRead: KBMostRead
}) {
  const router = useRouter()
  const hasReadRanking = mostRead.articles.length > 0
  const recommendations = hasReadRanking
    ? mostRead.articles
    : [
        ...new Map(catalog.hubs.flatMap(h => featuredArticles(catalog, h.id).slice(0, 1)).map(a => [a.id, a])).values(),
      ].slice(0, 4)

  return (
    <>
      <Head>
        <title>Knowledge Base | Nervos Network</title>
        <link
          rel="preload"
          as="image"
          href="/images/knowledge-hub/guide-background.1c63b618.avif"
          type="image/avif"
          {...{ fetchpriority: 'high' }}
        />
      </Head>
      <Page className={styles.page}>
        {({ renderHeader }) => (
          <>
            {renderHeader({ variant: 'knowledgeHub' })}
            <section className={styles.hero} aria-labelledby="kb-title">
              <div className={styles.heading}>
                <span className={styles.brain}>
                  <NeuronIcon />
                </span>
                <h1 id="kb-title">Knowledge Base</h1>
              </div>
              <p className={styles.intro}>
                Your guide to blockchain technology. Clear and comprehensive explanations of everything from the
                fundamentals to advanced concepts.
              </p>
              <div className={styles.guideBanner}>
                <GuideLife className={styles.guideLife} />
                <div className={styles.guideContent}>
                  <Eyebrow icon="hero-imgQlementineIconsGamepadStart16">Start here</Eyebrow>
                  <h2>New to Nervos? Start here.</h2>
                  <p>Everything you need to understand Nervos, how it works, and what makes it different.</p>
                  <button
                    className={styles.guideButton}
                    onClick={() => {
                      trackKBEvent('kb_cta_click', { cta_id: 'start_here', placement: 'home_hero' })
                      void router.push('/knowledge-base/start-here')
                    }}
                  >
                    Explore the guide <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            </section>
            <section className={styles.topics} aria-labelledby="topics-title">
              <div className={styles.container}>
                <Eyebrow icon="topics-imgGroup59">Explore by topic</Eyebrow>
                <h2 id="topics-title">What do you want to learn?</h2>
                <p className={styles.topicIntro}>
                  From blockchain fundamentals to advanced concepts, explore the topics that interest you.
                </p>
                <div className={styles.hubGrid}>
                  {catalog.hubs.map((hub, index) => {
                    const articles = featuredArticles(catalog, hub.id)
                    return (
                      <HubCard
                        key={hub.id}
                        name={hub.name}
                        description={hubs[index]?.description ?? ''}
                        hubId={hub.id}
                        titles={articles.map(a => a.title)}
                        articles={articles}
                        count={counts[hub.id] ?? 0}
                      />
                    )
                  })}
                </div>
              </div>
            </section>
            <section className={styles.popular} aria-labelledby="popular-title">
              <div className={styles.container}>
                <div className={styles.popularHeader}>
                  <div>
                    <Eyebrow icon="popular-imgIconamoonStarThin">Popular Reads</Eyebrow>
                    <h2
                      id="popular-title"
                      title={hasReadRanking ? `GA4 views: ${mostRead.startDate} – ${mostRead.endDate}` : undefined}
                    >
                      {hasReadRanking ? "What everyone's reading" : 'Recommended reading'}
                    </h2>
                  </div>
                </div>
                <div className={styles.popularGrid}>
                  {recommendations.map((article, index) => (
                    <ArticleLanguageLink
                      article={article}
                      className={styles.popularCard}
                      key={article.id}
                      href={articlePath(article)}
                      onClick={() =>
                        trackKBEvent('kb_article_click', {
                          article_id: article.id,
                          placement: 'recommended_reading',
                          hub_id: article.hub ?? undefined,
                          position: index + 1,
                        })
                      }
                    >
                      <ArticleCover
                        src={article.coverImage}
                        className={styles.coverPlaceholder}
                        sizes="(max-width: 767px) calc(100vw - 42px), (max-width: 1023px) calc(50vw - 42px), min(calc(25vw - 30px), 286px)"
                        ariaLabel={article.coverImage ? 'Article cover' : 'Article cover placeholder'}
                      >
                        {!article.coverImage && <span>Cover image</span>}
                      </ArticleCover>
                      <h3>{article.title}</h3>
                      <div className={styles.articleMeta}>
                        <Icon name="popular-imgLayer15" size={14} />
                        <span>{article.readingMinutes} min read</span>
                      </div>
                    </ArticleLanguageLink>
                  ))}
                </div>
                <ArrowButton
                  className={styles.allArticles}
                  href="/knowledge-base/articles"
                  onClick={() =>
                    trackKBEvent('kb_cta_click', { cta_id: 'all_articles', placement: 'home_recommended' })
                  }
                >
                  See all articles
                </ArrowButton>
              </div>
            </section>
            <Newsletter />
            <KnowledgeFooter />
          </>
        )}
      </Page>
    </>
  )
}

export function PreviewNotice({ notice, onClose }: { notice: string; onClose: () => void }) {
  return (
    <Dialog open={Boolean(notice)} onClose={() => onClose()} className={styles.dialog}>
      <div className={styles.backdrop} aria-hidden="true" />
      <div className={styles.dialogPosition}>
        <DialogPanel className={styles.dialogPanel}>
          <DialogTitle>Static design preview</DialogTitle>
          <p>{notice}</p>
          <button onClick={() => onClose()}>Got it</button>
        </DialogPanel>
      </div>
    </Dialog>
  )
}

export function Newsletter() {
  const { onSubmit, isSubmitting, status, isError, isInvalid } = useNewsletterSignup('signal')
  return (
    <>
      <section className={styles.newsletter} aria-labelledby="newsletter-title">
        <div className={styles.newsletterInner}>
          <div className={styles.newsletterCopy}>
            <Eyebrow icon="newsletter-imgArcticonsNewsreader">Stay ahead of the curve</Eyebrow>
            <h2 id="newsletter-title">The Blockchain Signal</h2>
            <p>
              A monthly briefing on the most significant developments shaping blockchain technology. Tech-focused and
              grounded in evidence. No hype. No price talk.
            </p>
            <form onSubmit={event => void onSubmit(event)} aria-busy={isSubmitting}>
              <input
                aria-label="Email address"
                aria-describedby="signal-newsletter-note signal-newsletter-status"
                aria-invalid={isInvalid || undefined}
                name="email"
                type="email"
                required
                maxLength={254}
                disabled={isSubmitting}
                placeholder="Your email address"
                autoComplete="email"
              />
              <button
                type="submit"
                disabled={isSubmitting}
                aria-label={isSubmitting ? 'Submitting newsletter signup' : 'Get the briefing'}
                title="Get the briefing"
              >
                Get the briefing
                <span aria-hidden="true">→</span>
              </button>
            </form>
            <small id="signal-newsletter-note">Monthly. Unsubscribe anytime.</small>
            <small id="signal-newsletter-status" role={isError ? 'alert' : 'status'} aria-live="polite">
              {status}
            </small>
          </div>
          <div className={styles.resourceGrid}>
            <a
              className={styles.resourceCard}
              href="https://docs.nervos.org/"
              onClick={() =>
                trackKBEvent('kb_resource_click', {
                  resource_id: 'developer_docs',
                  placement: 'signal_resources',
                  link_url: 'https://docs.nervos.org/',
                })
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="newsletter-imgLayer1" size={60} />
              <div>
                <h3>Build on CKB</h3>
                <p>Developer Docs &amp; Quick Start →</p>
              </div>
            </a>
            <a
              className={styles.resourceCard}
              href="https://talk.nervos.org/"
              onClick={() =>
                trackKBEvent('kb_resource_click', {
                  resource_id: 'community',
                  placement: 'signal_resources',
                  link_url: 'https://talk.nervos.org/',
                })
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="newsletter-imgLayer1" size={60} />
              <div>
                <h3>Join the CKB Community</h3>
                <p>Join the Discussion on NervosTalk →</p>
              </div>
            </a>
            <a
              className={styles.resourceCard}
              href="https://ckba.build/"
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                trackKBEvent('kb_resource_click', {
                  resource_id: 'ckba_membership',
                  placement: 'signal_resources',
                  link_url: 'https://ckba.build/',
                })
              }
            >
              <Icon name="newsletter-imgLayer1" size={60} />
              <div>
                <h3>Become a CKBA Member</h3>
                <p>Explore Membership →</p>
              </div>
            </a>
          </div>
        </div>
      </section>
    </>
  )
}
