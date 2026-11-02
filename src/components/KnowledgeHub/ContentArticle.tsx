import clsx from 'clsx'
import { CSSProperties, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { Icon } from './Home'
import { PreviewPage, DiscoverBanner, useActiveSection } from './Shared'
import { ArrowButton, ArticleCard } from './Components'
import { KBArticle, KBCatalog, formatArticleDate } from './content'
import styles from './article-v2.module.scss'
import contentStyles from './pages-v2.module.scss'
import { headingPlugin } from './markdown-headings'
import { trackKBEvent } from './analytics'
import { kbHubPath } from '../../utils/kb-hubs'
import type { KBImageDimensions } from '../../server/kb-images'
import { ArticleContentLink } from './ArticleLanguageLink'
import { readingProgress } from './reading-progress'
import {
  ARTICLE_DISCOVER_DESKTOP_QUERY,
  ARTICLE_DISCOVER_EXPERIMENT_ID,
  initializeArticleDiscoverExperiment,
  type ArticleDiscoverVariant,
} from './article-discover-experiment'

// TODO: Restore article likes once real counts and persisted votes are available.
const articleLikesEnabled = false

export function ContentArticle({
  article,
  markdown,
  related = [],
  hub,
  subjects,
  headings,
  preview = true,
  imageDimensions = {},
  languagesByArticle = {},
}: {
  article: KBArticle
  markdown: string
  related?: KBArticle[]
  hub: KBCatalog['hubs'][number] | null
  subjects: KBCatalog['subjects']
  headings: { id: string; label: string; depth: number }[]
  preview?: boolean
  imageDimensions?: KBImageDimensions
  languagesByArticle?: Record<string, string[]>
}) {
  const router = useRouter()
  const experimentPath = (router.asPath ?? article.id).split('#')[0] || article.id
  const [experiment, setExperiment] = useState<{
    variant: ArticleDiscoverVariant
    preview: boolean
    path: string
  } | null>(null)
  const experimentViewRef = useRef('')
  useEffect(() => {
    setExperiment({ ...initializeArticleDiscoverExperiment(), path: experimentPath })
  }, [experimentPath])
  useEffect(() => {
    if (!experiment || experiment.preview || experiment.path !== experimentPath) return
    const media = window.matchMedia(ARTICLE_DISCOVER_DESKTOP_QUERY)
    const expose = () => {
      const layout = media.matches ? 'desktop' : 'inline'
      const key = `${experimentPath}:${experiment.variant}:${layout}`
      if (experimentViewRef.current === key) return
      experimentViewRef.current = key
      trackKBEvent('kb_experiment_view', {
        experiment_id: ARTICLE_DISCOVER_EXPERIMENT_ID,
        variant: experiment.variant,
        article_id: article.id,
        layout,
      })
    }
    expose()
    media.addEventListener('change', expose)
    return () => media.removeEventListener('change', expose)
  }, [article.id, experiment, experimentPath])
  const trackDiscover = (placement: string) => {
    const assignment = typeof window !== 'undefined' ? initializeArticleDiscoverExperiment() : null
    trackKBEvent('kb_cta_click', {
      cta_id: 'discover_ckb',
      placement,
      ...(assignment && !assignment.preview
        ? {
            experiment_id: ARTICLE_DISCOVER_EXPERIMENT_ID,
            variant: assignment.variant,
            article_id: article.id,
            layout: window.matchMedia?.(ARTICLE_DISCOVER_DESKTOP_QUERY).matches ? 'desktop' : 'inline',
          }
        : {}),
    })
  }
  const contents = headings.map(heading => ({ ...heading, id: `user-content-${heading.id}` }))
  const mobileContents = contents.filter(heading => heading.depth === 2)
  const active = useActiveSection(
    contents.map(item => item.id),
    true,
    true,
  )
  const desktopContents: { heading: (typeof contents)[number]; children: typeof contents }[] = []
  for (const heading of contents) {
    // Markdown H1s are rendered as H2s. Keep orphan headings navigable when
    // an article starts at a lower level or has no top-level sections.
    const parent = desktopContents[desktopContents.length - 1]
    if (heading.depth <= 2 || !parent) desktopContents.push({ heading, children: [] })
    else parent.children.push(heading)
  }
  const activeGroup = desktopContents.find(
    group => group.heading.id === active || group.children.some(heading => heading.id === active),
  )
  const trackDesktopSection = (item: (typeof contents)[number]) =>
    trackKBEvent('kb_toc_click', {
      article_id: article.id,
      section_index: contents.findIndex(heading => heading.id === item.id) + 1,
      heading_text: item.label,
      placement: 'desktop',
    })
  const [liked, setLiked] = useState(false)
  const headerRef = useRef<HTMLDivElement>(null)
  const articleRef = useRef<HTMLElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const bottomDiscoverRef = useRef<HTMLDivElement>(null)
  const [bottomDiscoverReached, setBottomDiscoverReached] = useState(false)
  const contentsRef = useRef<HTMLElement>(null)
  const contentsMarkerRef = useRef<HTMLLIElement>(null)
  const [progress, setProgress] = useState(0)
  const [navHeight, setNavHeight] = useState(64)
  useEffect(() => {
    const nav = contentsRef.current
    const marker = contentsMarkerRef.current
    if (!nav || !marker) return
    if (!active) {
      marker.removeAttribute('data-visible')
      return
    }
    const list = nav.querySelector('ol')
    if (!list) return
    const revealActive = () => {
      const link = nav.querySelector<HTMLElement>('[aria-current="location"]')
      if (!link || !nav.clientHeight) return
      const previousTop = marker.getBoundingClientRect().top
      const bounds = nav.getBoundingClientRect()
      const item = link.getBoundingClientRect()
      if (item.top < bounds.top + 8) nav.scrollTop += item.top - bounds.top - 8
      else if (item.bottom > bounds.bottom - 8) nav.scrollTop += item.bottom - bounds.bottom + 8

      const trackTop = list.getBoundingClientRect().top
      const target = link.getBoundingClientRect().top - trackTop + 13
      // Keep both ends of the motion inside the visible scrollport, including
      // when the TOC scrolls to reveal a distant section or expands children.
      const start = Math.max(bounds.top + 8, Math.min(previousTop, bounds.bottom - 13)) - trackTop
      const visible = marker.dataset.visible === 'true'
      marker.getAnimations().forEach(animation => animation.cancel())
      marker.style.transform = `translateY(${target}px)`
      marker.dataset.visible = 'true'
      if (visible && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && Math.abs(start - target) > 0.5)
        marker.animate([{ transform: `translateY(${start}px)` }, { transform: `translateY(${target}px)` }], {
          duration: 260,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        })
    }
    revealActive()
    // Expansion changes the active entry's position over several animation frames.
    const observer = new ResizeObserver(revealActive)
    observer.observe(nav)
    observer.observe(list)
    return () => observer.disconnect()
  }, [active])
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (headerRef.current) setNavHeight(headerRef.current.getBoundingClientRect().height)
    })
    if (headerRef.current) observer.observe(headerRef.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let frame = 0
    const update = () => {
      if (!articleRef.current || !textRef.current || !headerRef.current) return
      if (bottomDiscoverRef.current)
        setBottomDiscoverReached(bottomDiscoverRef.current.getBoundingClientRect().top < window.innerHeight)
      setProgress(
        readingProgress(
          articleRef.current.getBoundingClientRect().top,
          textRef.current.getBoundingClientRect().bottom,
          window.innerHeight,
          (headerRef.current.getBoundingClientRect().height || 56) + 2,
        ),
      )
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    const observer = new ResizeObserver(schedule)
    for (const element of [articleRef.current, textRef.current, headerRef.current]) {
      if (element) observer.observe(element)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [article.id, markdown])
  const resolveImage = (src = '') =>
    /^(https?:)?\/\//.test(src) || src.startsWith('/')
      ? src
      : `/education_hub_articles/${encodeURIComponent(article.id)}/${src}`
  const renderImage = (src: string, alt: string, hero = false) => {
    let dimensions = imageDimensions[src]
    if (!dimensions && src.startsWith('/') && !src.startsWith('//')) {
      try {
        const pathname = new URL(src, 'https://kb.invalid').pathname
        dimensions = imageDimensions[pathname] ?? imageDimensions[decodeURI(pathname)]
      } catch {
        // Unknown sources keep the previous raw-image fallback.
      }
    }
    const className = hero ? contentStyles.articleCover : undefined
    // Keep animation, SVGs and external/unknown images on their original URL.
    if (!dimensions || !['png', 'jpg', 'webp', 'avif'].includes(dimensions.type))
      return (
        <img
          src={src}
          alt={alt}
          className={className}
          width={dimensions?.width}
          height={dimensions?.height}
          loading={hero ? undefined : 'lazy'}
        />
      )
    // Match the existing reading-column breakpoints; width/height preserve
    // intrinsic layout, while sizes controls only the downloaded resource.
    const cap = Math.min(dimensions.width, hero ? 650 : 690)
    const sizes = `(max-width: 1023px) min(calc(100vw - 40px), ${cap}px), min(calc(100vw - 354px), ${cap}px)`
    return (
      <Image
        src={src}
        alt={alt}
        className={className}
        width={dimensions.width}
        height={dimensions.height}
        style={{ aspectRatio: `${dimensions.width} / ${dimensions.height}` }}
        sizes={sizes}
        quality={80}
        priority={hero}
        fetchPriority={hero ? 'high' : undefined}
        loading={hero ? undefined : 'lazy'}
      />
    )
  }
  const shareUrl = encodeURIComponent(`https://www.nervos.org${article.canonicalPath}`)
  const shareTitle = encodeURIComponent(article.title)
  const shareLinks = [
    { name: 'Twitter', icon: 'twitter', href: `https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareTitle}` },
    { name: 'LinkedIn', icon: 'linkedin', href: `https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}` },
    { name: 'Reddit', icon: 'reddit', href: `https://www.reddit.com/submit?url=${shareUrl}&title=${shareTitle}` },
    { name: 'Facebook', icon: 'facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${shareUrl}` },
  ]
  useEffect(() => setLiked(false), [article.id])
  const categoryTags = hub && (
    <div className={styles.categories}>
      <button
        onClick={() => {
          trackKBEvent('kb_hub_click', { hub_id: hub.id, placement: 'article_categories' })
          void router.push(kbHubPath(hub.id) ?? '/knowledge-base', undefined, { locale: 'en' })
        }}
      >
        {hub.name}
      </button>
      {subjects.map(subject => (
        <button
          key={subject.id}
          onClick={() => {
            trackKBEvent('kb_subject_select', {
              hub_id: hub.id,
              subject_id: subject.id,
              placement: 'article_categories',
            })
            void router.push(
              `${kbHubPath(hub.id) ?? '/knowledge-base'}?subject=${encodeURIComponent(subject.id)}`,
              undefined,
              { locale: 'en' },
            )
          }}
        >
          {subject.name}
        </button>
      ))}
    </div>
  )
  return (
    <PreviewPage
      title={article.title}
      newsletter={false}
      revision
      articleNavigation
      readingProgress={progress}
      articleLanguage={article}
      headerRef={headerRef}
      preview={preview}
      canonicalPath={article.canonicalPath}
      openGraph={{
        type: 'article',
        title: article.title,
        description: article.description?.trim() || article.subtitle,
        url: `https://www.nervos.org${article.canonicalPath}`,
        site_name: 'Nervos Network',
        locale: article.language,
        author: article.authors.join(', ') || undefined,
        published_time: article.date ?? undefined,
        twitter: { card: 'summary_large_image', site: '@NervosNetwork' },
        ...(article.coverImage
          ? { image: { url: new URL(article.coverImage, 'https://www.nervos.org').href, alt: article.title } }
          : {}),
      }}
    >
      <div className={styles.articlePage} style={{ '--articleNavHeight': `${navHeight}px` } as CSSProperties}>
        <div className={styles.articleLayout}>
          <aside className={styles.sidebar} aria-label="Article navigation">
            <nav className={styles.stickyContents} aria-label="Table of contents" ref={contentsRef}>
              {contents.length > 0 && (
                <>
                  <h2>Table of contents</h2>
                  <ol className={styles.toc}>
                    <li className={styles.tocMarker} ref={contentsMarkerRef} aria-hidden="true" role="presentation" />
                    {desktopContents.map(({ heading, children }) => {
                      const expanded = activeGroup?.heading.id === heading.id
                      const childrenId = `${heading.id}-contents`
                      return (
                        <li key={heading.id}>
                          <a
                            href={`#${heading.id}`}
                            aria-current={active === heading.id ? 'location' : undefined}
                            aria-expanded={children.length ? expanded : undefined}
                            aria-controls={children.length ? childrenId : undefined}
                            onClick={() => trackDesktopSection(heading)}
                          >
                            {heading.label}
                          </a>
                          {children.length > 0 && (
                            <div
                              id={childrenId}
                              className={styles.tocChildren}
                              data-expanded={expanded}
                              aria-hidden={!expanded}
                            >
                              <ol>
                                {children.map(item => (
                                  <li
                                    key={item.id}
                                    style={{ '--tocIndent': `${Math.max(1, item.depth - 2) * 12}px` } as CSSProperties}
                                  >
                                    <a
                                      href={`#${item.id}`}
                                      aria-current={active === item.id ? 'location' : undefined}
                                      tabIndex={expanded ? undefined : -1}
                                      onClick={() => trackDesktopSection(item)}
                                    >
                                      {item.label}
                                    </a>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                </>
              )}
              <Link
                href="/knowledge-base/start-here"
                locale="en"
                className={styles.discoverSteps}
                onClick={() => trackDiscover('article_sidebar')}
              >
                Discover CKB in 5 Steps
              </Link>
            </nav>
          </aside>
          <article className={styles.articleBody} ref={articleRef}>
            <div className={styles.articleMeta}>
              <div className={clsx(styles.meta, styles.largeMeta)}>
                <Icon name="articleBody-imgGroup58" size={35} />
                <span>{article.authors.join(', ') || 'Nervos Network'}</span>
                <span>·</span>
                <span>{formatArticleDate(article.date)}</span>
                <span>·</span>
                <Icon name="articleBody-imgLayer15" size={12} />
                <span>{article.readingMinutes} min read</span>
              </div>
            </div>
            <header>
              <h1>{article.title}</h1>
              {article.subtitle && <p className={styles.subhead}>{article.subtitle}</p>}
              {hub && <div className={styles.articleCategories}>{categoryTags}</div>}
            </header>
            {mobileContents.length > 0 && (
              <nav className={styles.inlineContents} aria-label="On this page">
                <h2>On this page:</h2>
                <ul>
                  {mobileContents.map(item => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        onClick={() =>
                          trackKBEvent('kb_toc_click', {
                            article_id: article.id,
                            section_index: contents.findIndex(heading => heading.id === item.id) + 1,
                            heading_text: item.label,
                            placement: 'mobile',
                          })
                        }
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <div className={styles.mobileDiscover}>
              <p>New to CKB? Start with the essentials.</p>
              <Link href="/knowledge-base/start-here" locale="en" onClick={() => trackDiscover('article_mobile_intro')}>
                Discover CKB in 5 Steps <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div className={styles.mobileDiscoverBanner}>
              <DiscoverBanner revision onDiscoverClick={() => trackDiscover('article_mobile_banner')} />
            </div>
            {article.coverImage && renderImage(article.coverImage, article.title, true)}
            <div ref={textRef}>
              <ReactMarkdown
                className={contentStyles.articleMarkdown}
                remarkPlugins={[remarkGfm, headingPlugin]}
                rehypePlugins={[
                  rehypeRaw,
                  [
                    rehypeSanitize,
                    {
                      ...defaultSchema,
                      attributes: {
                        ...defaultSchema.attributes,
                        h2: [
                          ['id', /^section-\d+$/, 'footnote-label'],
                          ['className', 'sr-only'],
                        ],
                      },
                    },
                  ],
                ]}
                components={{
                  // The article title owns the page H1; body headings keep the existing H1/H2 styling.
                  h1: ({ children, id }) => <h2 id={id}>{children}</h2>,
                  img: ({ src, alt }) =>
                    renderImage(
                      resolveImage(src),
                      alt?.trim() && alt.trim().toLowerCase() !== 'alt_text' ? alt : article.title,
                    ),
                  a: ({ href, children }) => (
                    <ArticleContentLink
                      href={href}
                      languagesByArticle={languagesByArticle}
                      currentLanguage={article.language}
                    >
                      {children}
                    </ArticleContentLink>
                  ),
                }}
              >
                {markdown}
              </ReactMarkdown>
            </div>
            <div className={styles.articleActions}>
              {articleLikesEnabled && (
                <button
                  type="button"
                  className={styles.likeButton}
                  aria-label="Like this article"
                  aria-pressed={liked}
                  title="Like this article (sample count)"
                  onClick={() => setLiked(value => !value)}
                >
                  <span className={styles.likeHeart} aria-hidden="true">
                    <img src="/images/knowledge-hub/article-like.svg" width="12" height="10.6909" alt="" />
                    <img
                      className={styles.likeHeartFill}
                      src="/images/knowledge-hub/article-like-filled.svg"
                      width="12"
                      height="10.6909"
                      alt=""
                    />
                  </span>
                  <span>{509 + Number(liked)}</span>
                </button>
              )}
              <div className={styles.shareActions} role="group" aria-label="Share this article">
                <span>Share</span>
                {shareLinks.map(({ name, icon, href }) => (
                  <a
                    key={name}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Share on ${name}`}
                    onClick={() => trackKBEvent('kb_social_click', { network: icon, placement: 'article_end' })}
                  >
                    <Image src={`/images/${icon}.svg`} width={20} height={20} alt="" unoptimized />
                  </a>
                ))}
              </div>
            </div>
            <div className={styles.ckbMark} aria-label="CKB">
              <span aria-hidden="true">
                <Icon name="article-endmark" size={12} />
              </span>
              <span>C</span>
              <span>K</span>
              <span>B</span>
            </div>
            <div ref={bottomDiscoverRef} data-discover-banner="bottom">
              <DiscoverBanner revision onDiscoverClick={() => trackDiscover('article_bottom_banner')} />
            </div>
            <section className={styles.moreArticles} aria-labelledby="more-articles">
              <h2 id="more-articles">More from CKB</h2>
              {related.map((item, index) => (
                <ArticleCard
                  key={item.id}
                  article={item}
                  imageSizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1023px) 160px, 200px"
                  title={item.title}
                  horizontal
                  analyticsContext={{ placement: 'more_from_ckb', position: index + 1, hub_id: item.hub ?? undefined }}
                />
              ))}
              <div className={styles.allArticlesAction}>
                <ArrowButton
                  className={styles.allArticlesButton}
                  href="/knowledge-base/articles"
                  locale="en"
                  onClick={() =>
                    trackKBEvent('kb_cta_click', { cta_id: 'all_articles', placement: 'article_recommended' })
                  }
                >
                  See all articles
                </ArrowButton>
              </div>
            </section>
          </article>
          <aside className={styles.experimentSidebar} aria-label="Discover CKB">
            <div
              className={clsx(styles.stickyDiscover, bottomDiscoverReached && styles.discoverHidden)}
              aria-hidden={bottomDiscoverReached}
              ref={element => {
                if (element) element.inert = bottomDiscoverReached
              }}
            >
              <DiscoverBanner revision onDiscoverClick={() => trackDiscover('article_right_banner')} />
            </div>
          </aside>
        </div>
      </div>
      <a
        href="#"
        className={styles.backToTop}
        aria-label="Back to top"
        onClick={() => trackKBEvent('kb_back_to_top', { article_id: article.id })}
      >
        ↑
      </a>
    </PreviewPage>
  )
}
