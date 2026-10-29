import clsx from 'clsx'
import { CSSProperties, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { Icon, PreviewNotice } from './Home'
import { PreviewPage, DiscoverBanner, useActiveSection } from './Shared'
import { ArticleCard } from './Components'
import { KBArticle, KBCatalog, articlePath, formatArticleDate } from './content'
import styles from './article-v2.module.scss'
import contentStyles from './pages-v2.module.scss'
import { headingPlugin } from './markdown-headings'
import { articleSocialActionsEnabled } from './article-features'
import { trackKBEvent } from './analytics'
import { kbHubPath } from '../../utils/kb-hubs'
import type { KBImageDimensions } from '../../server/kb-images'
import { ArticleLanguageSwitch } from './ArticleLanguageSwitch'
import { ArticleContentLink, ArticleLanguageLink } from './ArticleLanguageLink'

export function ContentArticle({
  article,
  markdown,
  related,
  recent = [],
  hub,
  subjects,
  headings,
  preview = true,
  imageDimensions = {},
  languagesByArticle = {},
}: {
  article: KBArticle
  markdown: string
  related: KBArticle[]
  recent?: KBArticle[]
  hub: KBCatalog['hubs'][number] | null
  subjects: KBCatalog['subjects']
  headings: { id: string; label: string }[]
  preview?: boolean
  imageDimensions?: KBImageDimensions
  languagesByArticle?: Record<string, string[]>
}) {
  const router = useRouter()
  const contents = headings.map(heading => ({ ...heading, id: `user-content-${heading.id}` }))
  const active = useActiveSection(contents.map(item => item.id))
  const [notice, setNotice] = useState('')
  const navRef = useRef<HTMLDivElement>(null)
  const [navHeight, setNavHeight] = useState(80)
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (navRef.current) setNavHeight(navRef.current.getBoundingClientRect().height)
    })
    if (navRef.current) observer.observe(navRef.current)
    return () => observer.disconnect()
  }, [])
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
    const sizes = `(max-width: 900px) min(calc(100vw - 40px), ${cap}px), (max-width: 1100px) min(calc(100vw - 364px), ${cap}px), min(calc(100vw - 472px), ${cap}px)`
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
  return (
    <PreviewPage
      title={article.title}
      newsletter={false}
      revision
      headerClassName={styles.scrollingHeader}
      mobileHeaderActions={<ArticleLanguageSwitch article={article} mobile />}
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
        <div className={styles.articleNav} ref={navRef}>
          <Link href="/knowledge-base" locale="en" className={styles.articleBrand}>
            <span>
              <Icon name="articleNav-imgGroup" size={28} />
            </span>
            <div>
              <strong>Knowledge Base</strong>
              <br />
              Education Hub
            </div>
          </Link>
          <div className={styles.articleActions}>
            <a
              className={styles.writeArticle}
              href="https://github.com/NervosEducationHub/EducationHubArticles"
              onClick={() =>
                trackKBEvent('kb_resource_click', {
                  resource_id: 'write_article',
                  placement: 'article_nav',
                  link_url: 'https://github.com/NervosEducationHub/EducationHubArticles',
                })
              }
            >
              <Icon name="articleNav-imgGroup1" size={19} />
              Write an article
            </a>
            <div className={styles.desktopLanguage}>
              <ArticleLanguageSwitch article={article} />
            </div>
          </div>
          {contents.length > 0 && (
            <label className={styles.mobileContents}>
              <span>Contents</span>
              <select
                aria-label="Table of contents"
                value={active || contents[0]?.id}
                onChange={event => {
                  const sectionIndex = contents.findIndex(item => item.id === event.target.value)
                  const heading = contents[sectionIndex]
                  if (heading) {
                    trackKBEvent('kb_toc_click', {
                      article_id: article.id,
                      section_index: sectionIndex + 1,
                      heading_text: heading.label,
                      placement: 'mobile',
                    })
                  }
                  document.getElementById(event.target.value)?.scrollIntoView({ block: 'start' })
                  window.history.replaceState(null, '', `#${event.target.value}`)
                }}
              >
                {contents.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className={styles.articleLayout}>
          <article className={styles.articleBody}>
            <div className={styles.articleMeta}>
              <div className={clsx(styles.meta, styles.largeMeta)}>
                <Icon name="articleBody-imgGroup58" size={35} />
                <span>{article.authors.join(', ') || 'Author not supplied'}</span>
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
            </header>
            {article.coverImage && renderImage(article.coverImage, article.title, true)}
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
            <div className={styles.ckbMark} aria-label="CKB">
              <span aria-hidden="true">
                <Icon name="article-endmark" size={12} />
              </span>
              <span>C</span>
              <span>K</span>
              <span>B</span>
            </div>
            <DiscoverBanner revision />
            {related.length > 0 && (
              <section className={styles.moreArticles} aria-labelledby="more-articles">
                <h2 id="more-articles">More from CKB</h2>
                {related.map((a, index) => (
                  <ArticleCard
                    key={a.id}
                    article={a}
                    imageSizes="(max-width: 600px) calc(100vw - 40px), (max-width: 900px) 160px, 200px"
                    title={a.title}
                    horizontal
                    analyticsContext={{ placement: 'more_from_ckb', position: index + 1, hub_id: a.hub ?? undefined }}
                  />
                ))}
              </section>
            )}
          </article>
          <aside className={styles.sidebar} aria-label="Article navigation and related content">
            <DiscoverBanner compact revision />
            {contents.length > 0 && (
              <div className={styles.tocSlot}>
                <nav className={styles.stickyContents} aria-label="Table of contents">
                  <h2>Table of contents</h2>
                  <ol className={styles.toc}>
                    {contents.map((item, index) => (
                      <li key={item.id}>
                        <a
                          href={`#${item.id}`}
                          aria-current={active === item.id ? 'location' : undefined}
                          onClick={() =>
                            trackKBEvent('kb_toc_click', {
                              article_id: article.id,
                              section_index: index + 1,
                              heading_text: item.label,
                              placement: 'desktop',
                            })
                          }
                        >
                          {item.label}
                        </a>
                      </li>
                    ))}
                  </ol>
                </nav>
              </div>
            )}
            {recent.length > 0 && (
              <section>
                <h2>Recent posts:</h2>
                <div className={styles.recentPosts}>
                  {recent.map((item, index) => (
                    <ArticleLanguageLink
                      key={item.id}
                      article={item}
                      href={articlePath(item)}
                      onClick={() =>
                        trackKBEvent('kb_article_click', {
                          article_id: item.id,
                          placement: 'recent_posts',
                          position: index + 1,
                          hub_id: item.hub ?? undefined,
                        })
                      }
                    >
                      {item.title}
                      <span className={styles.recentPostArrow} aria-hidden="true">
                        {' '}
                        →
                      </span>
                    </ArticleLanguageLink>
                  ))}
                </div>
              </section>
            )}
            {hub && (
              <section>
                <h2>Categories:</h2>
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
              </section>
            )}
            {articleSocialActionsEnabled && (
              <section className={styles.sharing}>
                <h2>Share this article:</h2>
                <div className={styles.socials}>
                  <Image
                    src="/images/knowledge-hub/articleSidebar-imgFrame442.svg"
                    width={140}
                    height={20}
                    alt=""
                    unoptimized
                  />
                  {['Twitter', 'LinkedIn', 'Reddit', 'Facebook'].map(name => (
                    <button
                      key={name}
                      aria-label={`Share on ${name}`}
                      onClick={() =>
                        setNotice(
                          'Sharing is a visual preview until the final public article URLs are connected. Nothing has been posted.',
                        )
                      }
                    />
                  ))}
                </div>
              </section>
            )}
            {articleSocialActionsEnabled && (
              <section className={styles.like}>
                <h2>Like this post:</h2>
                <button disabled title="Visual preview only — no live like service">
                  <Icon name="articleSidebar-imgVector" size={12} />
                  LIKE
                </button>
              </section>
            )}
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
      <PreviewNotice notice={notice} onClose={() => setNotice('')} />
    </PreviewPage>
  )
}
