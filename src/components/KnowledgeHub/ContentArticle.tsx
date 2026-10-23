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
import { LanguageToggle } from '../Header/KnowledgeHeader'
import { readingProgress } from './reading-progress'

export function ContentArticle({
  article,
  markdown,
  related,
  recent = [],
  hub,
  subjects,
  headings,
  preview = true,
}: {
  article: KBArticle
  markdown: string
  related: KBArticle[]
  recent?: KBArticle[]
  hub: KBCatalog['hubs'][number] | null
  subjects: KBCatalog['subjects']
  headings: { id: string; label: string; depth: number }[]
  preview?: boolean
}) {
  const router = useRouter()
  const contents = headings.map(heading => ({ ...heading, id: `user-content-${heading.id}` }))
  const mobileContents = contents.filter(heading => heading.depth === 2)
  const active = useActiveSection(contents.map(item => item.id))
  const [notice, setNotice] = useState('')
  const navRef = useRef<HTMLDivElement>(null)
  const articleRef = useRef<HTMLElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)
  const [navHeight, setNavHeight] = useState(80)
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (navRef.current) setNavHeight(navRef.current.getBoundingClientRect().height)
    })
    if (navRef.current) observer.observe(navRef.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let frame = 0
    const update = () => {
      if (!articleRef.current || !textRef.current || !navRef.current) return
      setProgress(
        readingProgress(
          articleRef.current.getBoundingClientRect().top,
          textRef.current.getBoundingClientRect().bottom,
          window.innerHeight,
          (navRef.current.getBoundingClientRect().height || 56) + 2,
        ),
      )
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    const observer = new ResizeObserver(schedule)
    for (const element of [articleRef.current, textRef.current, navRef.current]) {
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
  const recentPosts = (
    <>
      <h2>Recent posts:</h2>
      <div className={styles.recentPosts}>
        {recent.map(item => (
          <Link
            key={item.id}
            href={articlePath(item)}
            onClick={() => trackKBEvent('kb_article_click', { article_id: item.id, placement: 'recent_posts' })}
          >
            {item.title}
            <span className={styles.recentPostArrow} aria-hidden="true">
              {' '}
              →
            </span>
          </Link>
        ))}
      </div>
    </>
  )
  const categoryTags = hub && (
    <div className={styles.categories}>
      <button
        onClick={() => {
          trackKBEvent('kb_hub_click', { hub_id: hub.id, placement: 'article_categories' })
          void router.push(`/knowledge-base/topic?hub=${encodeURIComponent(hub.id)}`)
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
              `/knowledge-base/topic?hub=${encodeURIComponent(hub.id)}&subject=${encodeURIComponent(subject.id)}`,
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
      preview={preview}
      canonicalPath={article.canonicalPath}
      description={article.subtitle}
      openGraph={{
        type: 'article',
        title: article.title,
        description: article.subtitle,
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
          <Link href="/knowledge-base" className={styles.articleBrand}>
            <span>
              <Icon name="articleNav-imgGroup" size={28} />
            </span>
            <div>
              <strong>Knowledge Base</strong>
              <br />
              Education Hub
            </div>
          </Link>
          <div className={styles.articleNavActions}>
            <a
              className={styles.writeArticle}
              href="https://github.com/NervosEducationHub/EducationHubArticles"
              onClick={() =>
                trackKBEvent('kb_resource_click', { resource_id: 'write_article', placement: 'article_nav' })
              }
            >
              <span className={styles.writeArticleFace}>
                <Icon name="articleNav-imgGroup1" size={19} />
                Write an article
              </span>
            </a>
            <LanguageToggle />
          </div>
          <div
            className={styles.readingProgress}
            role="progressbar"
            aria-label="Article reading progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <span style={{ transform: `scaleX(${progress / 100})` }} />
          </div>
        </div>
        <div className={styles.articleLayout}>
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
            </header>
            {hub && <div className={styles.mobileCategories}>{categoryTags}</div>}
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
            {article.coverImage && <img src={article.coverImage} alt="" className={contentStyles.articleCover} />}
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
                  img: ({ src, alt }) => <img src={resolveImage(src)} alt={alt || ''} loading="lazy" />,
                  a: ({ href, children }) => <a href={href}>{children}</a>,
                }}
              >
                {markdown}
              </ReactMarkdown>
            </div>
            {recent.length > 0 && <section className={styles.mobileRecentPosts}>{recentPosts}</section>}
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
                {related.map(a => (
                  <ArticleCard
                    key={a.id}
                    article={a}
                    title={a.title}
                    horizontal
                    analyticsContext={{ placement: 'more_from_ckb' }}
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
            {recent.length > 0 && <section className={styles.desktopRecentPosts}>{recentPosts}</section>}
            {hub && (
              <section className={styles.desktopCategories}>
                <h2>Categories:</h2>
                {categoryTags}
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
