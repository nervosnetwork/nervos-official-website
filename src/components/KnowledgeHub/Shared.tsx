import clsx from 'clsx'
import { ReactNode, useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { Page } from '../Page'
import { Icon, Newsletter } from './Home'
import base from './index.module.scss'
import styles from './pages.module.scss'
import revisedBase from './home-v2.module.scss'
import revisedStyles from './pages-v2.module.scss'
import { KnowledgeFooter } from './KnowledgeFooter'
import articleStyles from './article-v2.module.scss'
import { ArrowButton } from './Components'
import { GuideLife } from './GuideLife'
import type { OGProperties } from '../OpenGraph'
import { trackKBEvent } from './analytics'

export const articleHref = (title?: string) =>
  title ? `/knowledge-base/search?q=${encodeURIComponent(title)}` : '/knowledge-base/articles'

export function PreviewPage({
  title,
  children,
  newsletter = true,
  revision = false,
  headerClassName,
  preview = false,
  noindex = false,
  canonicalPath,
  description,
  openGraph,
}: {
  title: string
  children: ReactNode
  newsletter?: boolean
  revision?: boolean
  headerClassName?: string
  preview?: boolean
  noindex?: boolean
  canonicalPath?: string
  description?: string
  openGraph?: OGProperties
}) {
  return (
    <>
      <Head>
        <title>{preview ? `${title} — Knowledge Base preview` : title}</title>
        {(preview || noindex) && <meta name="robots" content={preview ? 'noindex, nofollow' : 'noindex, follow'} />}
        {canonicalPath && <link rel="canonical" href={`https://www.nervos.org${canonicalPath}`} />}
        {description && <meta name="description" content={description} />}
      </Head>
      <Page
        className={revision ? clsx(revisedBase.page, revisedStyles.page) : clsx(base.page, styles.page)}
        openGraph={openGraph}
      >
        {({ renderHeader, renderFooter }) => (
          <>
            {renderHeader({ variant: 'knowledgeHub', className: headerClassName })}
            {children}
            {newsletter && <Newsletter />}
            {revision ? <KnowledgeFooter /> : renderFooter()}
          </>
        )}
      </Page>
    </>
  )
}

export function Breadcrumb({ current, revision = false }: { current: string; revision?: boolean }) {
  return (
    <nav className={revision ? revisedStyles.breadcrumb : styles.breadcrumb} aria-label="Breadcrumb">
      <Link
        href="/knowledge-base"
        onClick={() => trackKBEvent('kb_cta_click', { cta_id: 'kb_home', placement: 'breadcrumb' })}
      >
        Knowledge Base
      </Link>
      <span aria-hidden="true"> / </span>
      <span aria-current="page">{current}</span>
    </nav>
  )
}

export function ArticleMeta({ large = false }: { large?: boolean }) {
  return (
    <div className={clsx(styles.meta, large && styles.largeMeta)}>
      <Icon name="articleBody-imgGroup58" size={large ? 35 : 18} />
      <span>Nervos</span>
      <span>·</span>
      <span>{large ? 'March 9, 2023' : 'February 28, 2023'}</span>
      <span>·</span>
      <Icon name="articleBody-imgLayer15" size={12} />
      <span>5 min read</span>
    </div>
  )
}

export function RelatedHubs({ revision = false }: { revision?: boolean }) {
  const design = revision ? revisedStyles : styles
  return (
    <section className={design.relatedHubs} aria-label="Related hubs">
      <div className={design.label}>
        <Icon name="topicBody-imgInterfaceMainComponent" />
        Related hubs
      </div>
      <div className={design.pills}>
        {[
          { name: 'Blockchain Architecture', id: 'blockchain-architecture' },
          { name: 'Blockchain VMs & RISC-V', id: 'blockchain-vms-risc-v' },
          { name: 'Nervos CKB', id: 'nervos-ckb' },
        ].map(({ name, id }) => (
          <ArrowButton
            className={design.pill}
            key={name}
            href={`/knowledge-base/topic?hub=${encodeURIComponent(name)}`}
            onClick={() => trackKBEvent('kb_hub_click', { hub_id: id, placement: 'related_hubs' })}
          >
            {name}
          </ArrowButton>
        ))}
      </div>
    </section>
  )
}

export function DiscoverBanner({ compact = false, revision = false }: { compact?: boolean; revision?: boolean }) {
  const design = revision ? articleStyles : styles
  return (
    <aside className={compact ? design.discoverCompact : design.discoverBanner}>
      <GuideLife
        className={design.discoverLife}
        density={compact ? 0.18 : 0.16}
        exclusionPadding={compact ? 12 : 18}
        exclusionSelector="[data-life-exclusion]"
      />
      <div data-life-exclusion>
        <h2>Meet the blockchain built for what comes next.</h2>
        <p>Explore the ideas, architecture, and ecosystem behind CKB.</p>
      </div>
      <span className={design.discoverAction} data-life-exclusion>
        <ArrowButton
          className={design.discoverButton}
          href="/knowledge-base/start-here"
          onClick={() =>
            trackKBEvent('kb_cta_click', {
              cta_id: 'discover_ckb',
              placement: compact ? 'article_sidebar_banner' : 'article_bottom_banner',
            })
          }
        >
          Discover CKB
        </ArrowButton>
      </span>
    </aside>
  )
}

export function useActiveSection(ids: string[], mobileScrollMargin = false) {
  const [active, setActive] = useState(ids[0] ?? '')
  const key = ids.join('|')
  useEffect(() => {
    const sectionIds = key.split('|')
    let frame = 0
    const update = () => {
      let current = sectionIds[0] ?? ''
      sectionIds.forEach(id => {
        const node = document.getElementById(id)
        if (!node) return
        const threshold =
          mobileScrollMargin && window.matchMedia('(max-width: 750px)').matches
            ? (parseFloat(getComputedStyle(node).scrollMarginTop) || 150) + 2
            : 150
        if (node.getBoundingClientRect().top <= threshold) current = id
      })
      setActive(current)
    }
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [key, mobileScrollMargin])
  return active
}
