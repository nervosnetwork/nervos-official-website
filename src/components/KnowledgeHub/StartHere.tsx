import clsx from 'clsx'
import { useEffect, useRef } from 'react'
import { BELOW_DESKTOP_QUERY } from '../../utils/breakpoints'
import { guideSteps } from './guide-data'
import { Breadcrumb, PreviewPage, useActiveSection } from './Shared'
import { ArrowButton, SubjectCard, StepSection } from './Components'
import styles from './pages-v2.module.scss'
import type { KBCatalog } from './content'
import { trackKBEvent } from './analytics'

// Approved editorial selections in order, using the D-18 canonical IDs.
const readingIds = [
  ['nervos_overview_of_a_layered_blockchain', 'tokenomics_of_nervos_network'],
  ['comparing_blockchain_virtual_machines', 'account_abstraction_where_we_are_going'],
  ['what_is_fiber', 'the_case_for_rgbpp'],
  ['blockchain_crypto_agility', 'ckb_blockchain_developers_dream'],
]

export function StartHere({ catalog }: { catalog: KBCatalog }) {
  const sidebarRef = useRef<HTMLElement>(null)
  const navRef = useRef<HTMLElement>(null)
  const active = useActiveSection(
    guideSteps.map(step => step.id),
    true,
  )
  useEffect(() => {
    const sidebar = sidebarRef.current
    const layout = sidebar?.parentElement
    if (!sidebar || !layout) return
    const measure = () =>
      layout.style.setProperty('--selectionRailHeight', `${sidebar.getBoundingClientRect().height}px`)
    const observer = new ResizeObserver(measure)
    observer.observe(sidebar)
    measure()
    return () => {
      observer.disconnect()
      layout.style.removeProperty('--selectionRailHeight')
    }
  }, [])
  useEffect(() => {
    const revealActive = () => {
      const nav = navRef.current
      const selected = nav?.querySelector<HTMLElement>('[aria-current="step"]')
      if (!nav || !selected || !window.matchMedia(BELOW_DESKTOP_QUERY).matches) return
      const bounds = nav.getBoundingClientRect()
      const item = selected.getBoundingClientRect()
      if (item.left < bounds.left || item.right > bounds.right)
        nav.scrollTo({ left: nav.scrollLeft + item.left - bounds.left - 4, behavior: 'auto' })
    }
    revealActive()
    window.addEventListener('resize', revealActive)
    return () => window.removeEventListener('resize', revealActive)
  }, [active])

  return (
    <PreviewPage
      title="Start Here"
      description="Nervos CKB explores what becomes possible when Bitcoin’s design principles meet open-ended programmability. Discover a blockchain built for people who want to push the technology further."
      canonicalPath="/knowledge-base/start-here"
      revision
      headerClassName={styles.scrollingHeader}
    >
      <div className={clsx(styles.container, styles.twoColumnPage, styles.startPage)}>
        <div className={styles.breadcrumbDock}>
          <Breadcrumb current="Start here" revision />
        </div>
        <header className={styles.startHero}>
          <div className={styles.startHeroCopy}>
            <h1>
              Understand Nervos CKB in <br className={styles.startTitleBreak} />
              five steps
            </h1>
            <strong>Inspired by Bitcoin’s foundations. Built for what comes next.</strong>
            <p>
              Nervos CKB explores what becomes possible when Bitcoin’s design principles meet open-ended
              programmability. Discover a blockchain built for people who want to push the technology further.
            </p>
          </div>
        </header>
        <div className={styles.twoColumnLayout}>
          <aside className={clsx(styles.layoutSidebar, styles.stepSidebar)} ref={sidebarRef}>
            <nav className={styles.stepNav} aria-label="Guide steps" ref={navRef}>
              {guideSteps.map((step, index) => (
                <SubjectCard
                  key={step.id}
                  compact
                  title={step.navTitle}
                  step={index + 1}
                  href={`#${step.id}`}
                  selected={active === step.id}
                  onClick={() => trackKBEvent('kb_step_select', { step: index + 1, step_name: step.title })}
                />
              ))}
            </nav>
          </aside>
          <div className={styles.layoutContent}>
            <div className={styles.guideSteps}>
              {guideSteps.map((step, index) => (
                <StepSection
                  key={step.id}
                  step={step}
                  index={index}
                  articles={(readingIds[index] ?? []).flatMap(id => catalog.articles.filter(a => a.id === id))}
                />
              ))}
            </div>
            <nav className={styles.guideLinks} aria-label="Continue learning">
              <ArrowButton className={styles.pill} href="/knowledge-base" direction="left">
                Back to Knowledge Base
              </ArrowButton>
              <ArrowButton className={clsx(styles.pill, styles.keepReading)} href="/knowledge-base/articles">
                Keep reading
              </ArrowButton>
            </nav>
          </div>
        </div>
      </div>
    </PreviewPage>
  )
}
