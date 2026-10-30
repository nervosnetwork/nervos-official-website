import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { hubs } from './fixtures'
import { Breadcrumb, PreviewPage, RelatedHubs } from './Shared'
import styles from './pages-v2.module.scss'
import { SubjectCard, ArticleCard } from './Components'
import { ArticleGridControls } from './ArticleGridControls'
import { byDate, type KBCatalog } from './content'
import { trackKBEvent } from './analytics'
import { kbHubPath } from '../../utils/kb-hubs'

const subjectPresentation: Record<string, { icon: string }> = {
  'hash-functions': { icon: 'subject-hash-functions' },
  'digital-signatures-elliptic-curves': { icon: 'subject-digital-signatures' },
  'cryptographic-primitives': { icon: 'subject-cryptographic-primitives' },
  'applied-cryptography': { icon: 'subject-applied-cryptography' },
  'quantum-threat': { icon: 'subject-quantum-threat' },
  'quantum-resistant-blockchains': { icon: 'subject-quantum-resistant-blockchains' },
  'post-quantum-cryptography': { icon: 'subject-post-quantum-cryptography' },
  'crypto-agility-migration': { icon: 'subject-crypto-agility' },
  'state-models-storage': { icon: 'subject-state-models' },
  'consensus-finality': { icon: 'subject-consensus-finality' },
  'pow-network-security': { icon: 'subject-pow-security' },
  'blockchain-fundamentals': { icon: 'subject-blockchain-fundamentals' },
  'blockchain-virtual-machines': { icon: 'subject-virtual-machines' },
  'execution-verification': { icon: 'subject-execution-verification' },
  'opcodes-precompiles': { icon: 'subject-opcodes' },
  'risc-v-ckb-vm': { icon: 'subject-risc-v' },
  'scaling-fundamentals': {
    icon: 'topicControls-imgArrowExpand',
  },
  'rollups-data-availability-sidechains': {
    icon: 'topicControls-imgSystemData',
  },
  'payment-channels-networks': {
    icon: 'topicControls-imgInterfaceCreditCard01',
  },
  'bitcoin-scaling-rgbpp': {
    icon: 'topicControls-img1421344023328',
  },
  'agent-payments-micropayments': { icon: 'subject-agent-payments' },
  'nervos-ckb-introduction': { icon: 'subject-nervos-introduction' },
  'ckb-architecture': { icon: 'subject-ckb-architecture' },
  'ckb-tokenomics-issuance': { icon: 'subject-tokenomics' },
  'ckb-ecosystem-development': { icon: 'subject-ecosystem-development' },
}

// Desktop reserves 280px for navigation plus a 32px gap. Tablet stacks the
// selector above two cards; mobile uses one card across the content width.
const hubImageSizes = {
  2: '(max-width: 767px) calc(100vw - 42px), (max-width: 1023px) calc(50vw - 42px), min(calc(50vw - 198px), 434px)',
  3: '(max-width: 767px) calc(100vw - 42px), (max-width: 1023px) calc(50vw - 42px), min(calc(33.333333vw - 138px), 283.333333px)',
}

export interface TopicProps {
  catalog: KBCatalog
  hubId: string
  subjectId?: string
}

export function Topic({ catalog, hubId, subjectId }: TopicProps) {
  const hub = catalog.hubs.find(item => item.id === hubId)
  const heading = hub?.heading ?? 'Blockchain Scalability'
  const description =
    hub && hub.id !== 'blockchain-scalability'
      ? hubs.find(item => item.name === hub.name)?.description
      : 'Blockchain scalability is the study of how blockchain networks increase throughput, reduce costs, and support more complex applications. This hub covers Layer 1 and Layer 2 approaches, including rollups, payment channels, Lightning, RGB++, and Fiber, and how Nervos CKB scales without sacrificing security or decentralization.'
  const subjects = [
    ...catalog.subjects
      .filter(item => item.hub === hubId)
      .sort((a, b) => a.order - b.order)
      .map(item => ({
        ...item,
        icon: subjectPresentation[item.id]?.icon ?? 'topicHero-imgInterfaceBookOpen',
      })),
    {
      id: 'all',
      name: 'View all',
      icon: 'topics-imgGroup59',
    },
  ]
  const [selectedSubject, setSelectedSubject] = useState(
    subjects.find(item => item.id === subjectId)?.id ?? subjects[0]?.id ?? 'all',
  )
  const [density, setDensity] = useState(3)
  const gridRef = useRef<HTMLDivElement>(null)
  const transitionRef = useRef<Animation | null>(null)
  const requestedSubject = useRef(selectedSubject)

  useEffect(() => () => transitionRef.current?.cancel(), [])
  useEffect(() => {
    const grid = gridRef.current
    if (!grid || !transitionRef.current) return
    transitionRef.current.cancel()
    transitionRef.current = null
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    transitionRef.current = grid.animate(
      [
        { opacity: 0, transform: 'translateY(12px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
  }, [selectedSubject])

  const selectSubject = (id: string) => {
    if (requestedSubject.current === id) return
    requestedSubject.current = id
    trackKBEvent('kb_subject_select', { hub_id: hubId, subject_id: id, placement: 'topic' })
    const grid = gridRef.current
    const current = grid ? getComputedStyle(grid) : null
    const from = { opacity: current?.opacity ?? '1', transform: current?.transform ?? 'none' }
    transitionRef.current?.cancel()
    transitionRef.current = null
    if (!grid || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setSelectedSubject(id)
      return
    }
    if (id === selectedSubject) {
      transitionRef.current = grid.animate([from, { opacity: 1, transform: 'translateY(0)' }], {
        duration: 220,
        easing: 'ease-out',
      })
      return
    }
    const exit = grid.animate([from, { opacity: 0, transform: 'translateY(-8px)' }], {
      duration: 140,
      easing: 'ease-in',
      fill: 'forwards',
    })
    transitionRef.current = exit
    exit.onfinish = () => setSelectedSubject(id)
  }
  const subject = subjects.find(item => item.id === selectedSubject) ?? {
    id: 'all',
    name: 'View all',
    icon: 'topics-imgGroup59',
  }
  // Keep one set of cards in the HTML; the existing subject controls toggle their visibility.
  const hubPosts = catalog.articles.filter(post => post.hub === hubId).sort(byDate)
  const visiblePosts = hubPosts.filter(post => subject.id === 'all' || post.subjects.includes(subject.id))
  const visiblePositions = new Map(visiblePosts.map((post, index) => [post.id, index + 1]))

  return (
    <PreviewPage
      title={heading}
      description={description}
      canonicalPath={kbHubPath(hubId) ?? '/knowledge-base'}
      revision
      headerClassName={styles.scrollingHeader}
    >
      <div className={clsx(styles.container, styles.twoColumnPage)}>
        <div className={styles.breadcrumbDock}>
          <Breadcrumb current={heading} revision />
        </div>
        <header className={styles.topicHero}>
          <h1>{heading}</h1>
          <p>{description}</p>
        </header>
        <div className={styles.twoColumnLayout}>
          <aside className={styles.layoutSidebar}>
            <nav className={styles.subjectNav} aria-label="Subjects">
              {subjects.map(item => (
                <SubjectCard
                  key={item.id}
                  compact
                  title={item.name}
                  icon={item.icon}
                  selected={subject.id === item.id}
                  onClick={() => selectSubject(item.id)}
                />
              ))}
            </nav>
          </aside>
          <div className={styles.layoutContent}>
            <div className={styles.topicToolbar}>
              <div>
                <h2 id="subject-title">{subject.name === 'View all' ? 'All subjects' : subject.name}</h2>
              </div>
              <ArticleGridControls
                density={density}
                onDensityChange={setDensity}
                placement="topic"
                pageType="hub"
                hubId={hubId}
              />
            </div>
            <section className={styles.topicArticles} aria-labelledby="subject-title">
              <div className={clsx(styles.topicGrid, styles[`density${density}`])} ref={gridRef}>
                {hubPosts.map(post => (
                  <ArticleCard
                    key={post.id}
                    compact
                    title={post.title}
                    article={post}
                    hidden={!visiblePositions.has(post.id)}
                    analyticsContext={
                      visiblePositions.has(post.id)
                        ? {
                            placement: 'topic_articles',
                            hub_id: hubId,
                            subject_id: subject.id,
                            position: visiblePositions.get(post.id),
                          }
                        : undefined
                    }
                    tag={
                      subject.id === 'all'
                        ? catalog.subjects.find(item => item.id === post.subjects[0])?.name
                        : undefined
                    }
                    size={density === 2 ? 'large' : 'medium'}
                    imageSizes={hubImageSizes[density === 2 ? 2 : 3]}
                  />
                ))}
              </div>
              {visiblePosts.length === 0 && (
                <p role="status" className={styles.empty}>
                  No articles in this subject yet.
                </p>
              )}
              <p className={styles.srOnly} aria-live="polite">
                Showing {visiblePosts.length} articles, latest to oldest
              </p>
            </section>
          </div>
        </div>
        <RelatedHubs revision currentHubId={hubId} />
      </div>
    </PreviewPage>
  )
}
