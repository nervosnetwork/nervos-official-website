import clsx from 'clsx'
import { CSSProperties, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Icon, PreviewNotice } from './Home'
import { articleHref, ArticleMeta, DiscoverBanner, PreviewPage, useActiveSection } from './Shared'
import { ArticleCard } from './Components'
import styles from './article-v2.module.scss'
import { articleSocialActionsEnabled } from './article-features'

const intro =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.'
const outro =
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'
const full = `${intro} ${outro}`
const contents = [
  { id: 'introduction', label: 'Introduction' },
  { id: 'what-is-nervos', label: 'What is Nervos?' },
  { id: 'common-knowledge-base', label: 'Common Knowledge Base' },
  { id: 'proof-of-work', label: 'Proof of Work' },
  { id: 'how-does-it-work', label: 'How does it work?' },
  { id: 'conclusion', label: 'Conclusion' },
]
const recentPosts = [
  'Hashing it Out: Highlights – Episode 9',
  'How to Store Nervos CKB: A Complete Guide for Beginners',
  'Nervos, Beyond Account Abstraction',
]

function Placeholder({ label, className = '' }: { label: string; className?: string }) {
  return (
    <div role="img" aria-label={label} className={clsx(styles.articlePlaceholder, className)}>
      {label}
    </div>
  )
}

export function Article() {
  const { query } = useRouter()
  const title = typeof query.title === 'string' ? query.title : 'What is Nervos? A complete guide for newbies.'
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
  return (
    <PreviewPage title={title} newsletter={false} revision headerClassName={styles.scrollingHeader}>
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
          <a className={styles.writeArticle} href="https://github.com/NervosEducationHub/EducationHubArticles">
            <Icon name="articleNav-imgGroup1" size={19} />
            Write an article
          </a>
          <label className={styles.mobileContents}>
            <span>Contents</span>
            <select
              aria-label="Table of contents"
              value={active || contents[0]!.id}
              onChange={event => {
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
        </div>
        <div className={styles.articleLayout}>
          <article className={styles.articleBody}>
            <div className={styles.articleMeta}>
              <ArticleMeta large />
            </div>
            <header>
              <h1>{title}</h1>
              <p className={styles.subhead}>Subhead if needed.</p>
            </header>
            <Placeholder label="Article cover image" />
            <section id="introduction">
              <h2>Introduction</h2>
              <p>{full}</p>
              <p>
                {intro}
                <br />
                <br />
                {outro}
                <br />
                <br />
                {full}
              </p>
            </section>
            <figure className={styles.tokenFigure}>
              <figcaption>02/14/2023</figcaption>
              <div className={styles.tokenGrid}>
                <div>
                  <strong>39.63G</strong>
                  <span>Circulating Supply</span>
                </div>
                <div>
                  <strong>103M</strong>
                  <span>Burnt</span>
                </div>
                <div>
                  <strong>11.38G</strong>
                  <span>Unvested</span>
                </div>
              </div>
            </figure>
            <section id="what-is-nervos">
              <h2>What is Nervos?</h2>
              <p>
                {intro}
                <br />
                <br />
                {outro}
                <br />
                <br />
                {full}
                <br />
                <br />
                {full}
              </p>
            </section>
            <section id="common-knowledge-base">
              <h2>Common Knowledge Base</h2>
              <p>
                {intro}
                <br />
                <br />
                {outro}
                <br />
                <br />
                {intro.slice(0, intro.indexOf(' laboris'))}.
              </p>
              <Placeholder label="Article illustration" className={styles.inlineIllustration} />
              <p id="proof-of-work">{outro}</p>
              <p id="how-does-it-work">{full}</p>
            </section>
            <section id="conclusion">
              <h2>Conclusion</h2>
              <p>
                {intro}
                <br />
                <br />
                {outro}
                <br />
                <br />
                {full}
              </p>
            </section>
            <div className={styles.ckbMark} aria-label="CKB">
              <span aria-hidden="true">
                <Icon name="article-endmark" size={12} />
              </span>
              <span>C</span>
              <span>K</span>
              <span>B</span>
            </div>
            <DiscoverBanner revision />
            <section className={styles.moreArticles} aria-labelledby="more-articles">
              <h2 id="more-articles">More from CKB</h2>
              {[0, 1, 2].map(index => (
                <ArticleCard
                  key={index}
                  horizontal
                  title={
                    index === 1
                      ? 'What is Nervos? A complete guide for newbies two line title example - single line for body copy.'
                      : 'What is Nervos? A complete guide for newbies.'
                  }
                />
              ))}
            </section>
          </article>
          <aside className={styles.sidebar} aria-label="Article navigation and related content">
            <DiscoverBanner compact revision />
            <div className={styles.tocSlot}>
              <nav className={styles.stickyContents} aria-label="Table of contents">
                <h2>Table of contents</h2>
                <ol className={styles.toc}>
                  {contents.map(item => (
                    <li key={item.id}>
                      <a href={`#${item.id}`} aria-current={active === item.id ? 'location' : undefined}>
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </div>
            <section>
              <h2>Recent posts:</h2>
              <div className={styles.recentPosts}>
                {recentPosts.map(name => (
                  <Link key={name} href={articleHref(name)}>
                    {name}
                    <span className={styles.recentPostArrow} aria-hidden="true">
                      {' '}
                      →
                    </span>
                  </Link>
                ))}
              </div>
            </section>
            <section>
              <h2>Categories:</h2>
              <div className={styles.categories}>
                {['Events', 'News', 'Releases & Updates', 'Guides & Tutorials', 'Learning Resources', 'Popular'].map(
                  name => (
                    <button
                      key={name}
                      onClick={() =>
                        setNotice(
                          `“${name}” is a category shown in the Figma draft. Category mapping is not connected to production data in this preview.`,
                        )
                      }
                    >
                      {name}
                    </button>
                  ),
                )}
              </div>
            </section>
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
                <p>
                  <Icon name="articleSidebar-imgVector1" size={12} />
                  509 like this post
                </p>
              </section>
            )}
          </aside>
        </div>
      </div>
      <a href="#" className={styles.backToTop} aria-label="Back to top">
        ↑
      </a>
      <PreviewNotice notice={notice} onClose={() => setNotice('')} />
    </PreviewPage>
  )
}
