import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Page } from '../Page'
import { hubs } from './fixtures'
import { KBArticle, KBCatalog, featuredArticles, articlePath } from './content'
import type { KBMostRead } from './content'
import styles from './home-v2.module.scss'
import { Icon } from './Icon'
import { ArrowButton, HubCard, ArticleCover } from './Components'
import { KnowledgeFooter } from './KnowledgeFooter'
import { GuideLife } from './GuideLife'
import { NeuronIcon } from './NeuronIcon'
import { trackKBEvent } from './analytics'
import { trackKBSearch } from './search-analytics'
import { useNewsletterSignup } from './useNewsletterSignup'
import { ArticleLanguageLink } from './ArticleLanguageLink'

export { Icon } from './Icon'

function SearchCloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

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
  const [query, setQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [matches, setMatches] = useState<KBArticle[]>([])
  const [searchStatus, setSearchStatus] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    setMatches([])
    if (!query.trim()) {
      setSearchStatus('Type to search articles.')
      return
    }
    setSearchStatus('Searching…')
    const timer = setTimeout(() => {
      void fetch(`/api/kb-search?q=${encodeURIComponent(query)}&locale=${router.locale ?? 'en'}`, {
        signal: controller.signal,
      })
        .then(async response => {
          if (!response.ok) throw new Error('Search unavailable')
          return response.json() as Promise<KBArticle[]>
        })
        .then(items => {
          setMatches(items)
          setSearchStatus(items.length ? '' : 'No matching articles.')
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchStatus('Search unavailable. Please try again.')
        })
    }, 200)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query, router.locale])
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
                Build your understanding of blockchain technology. Find answers to specific questions, explore a new
                topic, or work your way from the fundamentals to advanced concepts.
              </p>
              <div className={styles.guideBanner}>
                <GuideLife className={styles.guideLife} />
                <div className={styles.guideContent}>
                  <Eyebrow icon="hero-imgQlementineIconsGamepadStart16">Start here</Eyebrow>
                  <h2>
                    What is Nervos?
                    <br />A complete guide for beginners.
                  </h2>
                  <p>
                    This guide is the be-all and end-all resource for the underlying architecture and value proposition
                    of the Nervos Network. Start here, then go as deep as you like.
                  </p>
                  <button
                    className={styles.guideButton}
                    onClick={() => {
                      trackKBEvent('kb_cta_click', { cta_id: 'start_here', placement: 'home_hero' })
                      void router.push('/knowledge-base/start-here')
                    }}
                  >
                    Take the guide <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>
            </section>
            <section className={styles.topics} aria-labelledby="topics-title">
              <div className={styles.container}>
                <Eyebrow icon="topics-imgGroup59">Explore by topic</Eyebrow>
                <h2 id="topics-title">Find your starting point</h2>
                <p className={styles.topicIntro}>
                  New to blockchain or exploring a specific question?
                  <br className={styles.topicIntroBreak} /> Browse articles by topic and build your understanding at
                  your own pace.
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
                    <Eyebrow icon="popular-imgIconamoonStarThin">Reader favourites</Eyebrow>
                    <h2
                      id="popular-title"
                      title={hasReadRanking ? `GA4 views: ${mostRead.startDate} – ${mostRead.endDate}` : undefined}
                    >
                      {hasReadRanking ? 'Most read this year' : 'Recommended reading'}
                    </h2>
                  </div>
                  <div className={styles.searchActions}>
                    <div className={styles.searchWrap}>
                      <form
                        role="search"
                        onSubmit={event => {
                          event.preventDefault()
                          trackKBSearch(query, 'home_search', router.locale)
                          void router.push(`/knowledge-base/search?q=${encodeURIComponent(query)}`)
                        }}
                      >
                        <input
                          type="search"
                          aria-label="Search articles"
                          placeholder="Search all articles"
                          value={query}
                          onChange={event => {
                            setQuery(event.target.value)
                            setShowSearch(true)
                          }}
                          onKeyDown={event => {
                            if (event.key === 'Escape') setShowSearch(false)
                          }}
                        />
                        {query && (
                          <button
                            type="button"
                            className={styles.clearSearch}
                            aria-label="Clear search"
                            onClick={() => {
                              setQuery('')
                              setShowSearch(false)
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
                            Search results{' '}
                            <button onClick={() => setShowSearch(false)} aria-label="Close search results">
                              <SearchCloseIcon />
                            </button>
                          </div>
                          {matches.length ? (
                            matches.map((article, index) => (
                              <ArticleLanguageLink
                                article={article}
                                key={article.id}
                                href={articlePath(article)}
                                onClick={() =>
                                  trackKBEvent('kb_article_click', {
                                    article_id: article.id,
                                    placement: 'home_search_suggestion',
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
                          <Link
                            href={`/knowledge-base/search?q=${encodeURIComponent(query)}`}
                            onClick={() => trackKBSearch(query, 'home_all_search_results', router.locale)}
                          >
                            View all results →
                          </Link>
                        </div>
                      )}
                    </div>
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
                        sizes="(max-width: 540px) calc(100vw - 40px), (max-width: 750px) calc(50vw - 28px), (max-width: 950px) calc(50vw - 40px), (max-width: 1264px) calc(25vw - 28px), 288px"
                        ariaLabel={article.coverImage ? 'Article cover' : 'Article cover placeholder'}
                      >
                        {!article.coverImage && <span>Cover image</span>}
                      </ArticleCover>
                      <h3>{article.title}</h3>
                      <div className={styles.articleMeta}>
                        <Icon name="popular-imgGroup58" size={18} />
                        <span>
                          {article.date
                            ? new Date(article.date).toLocaleDateString('en-US', {
                                month: 'long',
                                day: 'numeric',
                                year: 'numeric',
                                timeZone: 'UTC',
                              })
                            : 'Date not supplied'}{' '}
                          ·
                        </span>
                        <Icon name="popular-imgLayer15" size={12} />
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
