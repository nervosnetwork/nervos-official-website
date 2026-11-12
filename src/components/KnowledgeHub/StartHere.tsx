import clsx from 'clsx'
import { guideSteps } from './guide-data'
import { Breadcrumb, PreviewPage } from './Shared'
import { ArrowButton } from './Components'
import { GuideSection } from './GuideSection'
import { GuideContents } from './GuideContents'
import styles from './pages-v2.module.scss'
import guideStyles from './start-here.module.scss'
import type { KBCatalog } from './content'

// Approved editorial selections in order, using the D-18 canonical IDs.
const readingIds = [
  ['nervos_overview_of_a_layered_blockchain', 'tokenomics_of_nervos_network'],
  ['comparing_blockchain_virtual_machines', 'account_abstraction_where_we_are_going'],
  ['what_is_fiber', 'the_case_for_rgbpp'],
  ['blockchain_crypto_agility', 'ckb_blockchain_developers_dream'],
]

const guideDescription =
  "Discover how CKB builds on Bitcoin's foundations to make blockchains more programmable, flexible, and ready for whatever comes next."

export function StartHere({ catalog }: { catalog: KBCatalog }) {
  return (
    <PreviewPage
      title="Understand CKB in 5 minutes"
      description={guideDescription}
      canonicalPath="/knowledge-base/start-here"
      revision
      headerClassName={styles.scrollingHeader}
    >
      <div className={clsx(styles.container, guideStyles.page)}>
        <div className={clsx(styles.breadcrumbDock, guideStyles.breadcrumb)}>
          <Breadcrumb current="Start here" revision />
        </div>
        <header className={guideStyles.hero}>
          <div>
            <h1>
              Understand CKB in <span>5 minutes</span>
            </h1>
            <strong>Bitcoin&apos;s principles. A new world of possibilities.</strong>
            <p>{guideDescription}</p>
          </div>
        </header>
        <div className={guideStyles.layout}>
          <aside className={guideStyles.sidebar} aria-label="Guide navigation">
            <GuideContents />
          </aside>
          <article className={guideStyles.content}>
            {guideSteps.map((step, index) => (
              <GuideSection
                key={step.id}
                step={step}
                index={index}
                articles={(readingIds[index] ?? []).flatMap(id => catalog.articles.filter(a => a.id === id))}
              />
            ))}
            <nav className={clsx(styles.guideLinks, guideStyles.footer)} aria-label="Continue learning">
              <ArrowButton className={styles.pill} href="/knowledge-base" direction="left">
                Back to Knowledge Base
              </ArrowButton>
              <ArrowButton className={clsx(styles.pill, styles.keepReading)} href="/knowledge-base/articles">
                Keep reading
              </ArrowButton>
            </nav>
          </article>
        </div>
      </div>
    </PreviewPage>
  )
}
