import clsx from 'clsx'
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Icon } from './Home'
import { hubs } from './fixtures'
import { Breadcrumb, PreviewPage, RelatedHubs } from './Shared'
import styles from './pages-v2.module.scss'
import { SubjectCard, ArticleCard } from './Components'
import { ArticleGridControls } from './ArticleGridControls'
import { useHeroScroll } from './useHeroScroll'
import { byDate, type KBCatalog } from './content'
import { trackKBEvent } from './analytics'

const subjectPresentation: Record<string, { icon: string; description?: string }> = {
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
    description:
      'The core trade-offs. What throughput really means, why the scalability trilemma exists, and the difference between scaling at Layer 1 and scaling at Layer 2.',
  },
  'rollups-data-availability-sidechains': {
    icon: 'topicControls-imgSystemData',
    description: 'Explore rollups, data availability and sidechains.',
  },
  'payment-channels-networks': {
    icon: 'topicControls-imgInterfaceCreditCard01',
    description: 'Explore payment channels and networks.',
  },
  'bitcoin-scaling-rgbpp': {
    icon: 'topicControls-img1421344023328',
    description: 'Explore Bitcoin scaling and RGB++.',
  },
  'agent-payments-micropayments': { icon: 'subject-agent-payments' },
  'nervos-ckb-introduction': { icon: 'subject-nervos-introduction' },
  'ckb-architecture': { icon: 'subject-ckb-architecture' },
  'ckb-tokenomics-issuance': { icon: 'subject-tokenomics' },
  'ckb-ecosystem-development': { icon: 'subject-ecosystem-development' },
}

export interface TopicProps {
  catalog: KBCatalog
  hubId: string
  subjectId?: string
}

export function Topic({ catalog, hubId, subjectId }: TopicProps) {
  const hub = catalog.hubs.find(item => item.id === hubId)
  const heading = hub?.heading ?? 'Blockchain Scalability'
  const subjects = [
    ...catalog.subjects
      .filter(item => item.hub === hubId)
      .sort((a, b) => a.order - b.order)
      .map(item => ({
        ...item,
        icon: subjectPresentation[item.id]?.icon ?? 'topicHero-imgInterfaceBookOpen',
        description: subjectPresentation[item.id]?.description ?? '',
      })),
    {
      id: 'all',
      name: 'View all',
      icon: 'topics-imgGroup59',
      description: 'Browse all articles in this topic.',
    },
  ]
  const [selectedSubject, setSelectedSubject] = useState(
    subjects.find(item => item.id === subjectId)?.id ?? subjects[0]?.id ?? 'all',
  )
  const [density, setDensity] = useState(4)
  const { heroFade, breadcrumbHeight, breadcrumbRef } = useHeroScroll()
  const subject = subjects.find(item => item.id === selectedSubject) ?? {
    id: 'all',
    name: 'View all',
    icon: 'topics-imgGroup59',
    description: 'Browse all articles in this topic.',
  }
  const posts = catalog.articles
    .filter(post => post.hub === hubId && (subject.id === 'all' || post.subjects.includes(subject.id)))
    .sort(byDate)

  return (
    <PreviewPage title={heading} revision headerClassName={styles.scrollingHeader}>
      <div
        className={styles.container}
        style={{ '--heroFade': heroFade, '--breadcrumbHeight': `${breadcrumbHeight}px` } as CSSProperties}
      >
        <div className={styles.breadcrumbDock} ref={breadcrumbRef}>
          <Breadcrumb current={heading} revision />
        </div>
        <header className={styles.topicHero}>
          <h1>{heading}</h1>
          <p>
            {hub && hub.id !== 'blockchain-scalability'
              ? hubs.find(item => item.name === hub.name)?.description
              : 'Blockchain scalability is the study of how blockchain networks increase throughput, reduce costs, and support more complex applications. This hub covers Layer 1 and Layer 2 approaches, including rollups, payment channels, Lightning, RGB++, and Fiber, and how Nervos CKB scales without sacrificing security or decentralization.'}
          </p>
        </header>
        <div className={styles.topicRail} style={{ paddingTop: `${48 * (1 - heroFade)}px` }}>
          <h2 className={styles.subjectsLabel}>
            <Icon name="topicHero-imgInterfaceBookOpen" size={24} />
            Subjects
          </h2>
          <nav className={styles.subjectNav} aria-label="Subjects">
            {subjects.map(item => (
              <SubjectCard
                key={item.id}
                title={item.name}
                icon={item.icon}
                selected={subject.id === item.id}
                onClick={() => {
                  if (selectedSubject !== item.id)
                    trackKBEvent('kb_subject_select', {
                      hub_id: hubId,
                      subject_id: item.id,
                      placement: 'topic',
                    })
                  setSelectedSubject(item.id)
                }}
              />
            ))}
          </nav>
          <div className={styles.topicToolbar}>
            <div>
              <h2 id="subject-title">{subject.name === 'View all' ? 'All subjects' : subject.name}</h2>
              <p>{subject.description}</p>
            </div>
            <ArticleGridControls density={density} onDensityChange={setDensity} placement="topic" />
          </div>
        </div>
        <section className={styles.topicArticles} aria-labelledby="subject-title">
          <div className={clsx(styles.topicGrid, styles[`density${density}`])}>
            {posts.map(post => (
              <ArticleCard
                key={post.id}
                title={post.title}
                article={post}
                analyticsContext={{ placement: 'topic_articles', hub_id: hubId, subject_id: subject.id }}
                tag={
                  subject.id === 'all' ? catalog.subjects.find(item => item.id === post.subjects[0])?.name : undefined
                }
                size={density === 5 ? 'small' : density === 3 ? 'large' : 'medium'}
              />
            ))}
          </div>
          {posts.length === 0 && (
            <p role="status" className={styles.empty}>
              No articles in this subject yet.
            </p>
          )}
          <p className={styles.srOnly} aria-live="polite">
            Showing {posts.length} articles, latest to oldest
          </p>
        </section>
        <RelatedHubs revision />
      </div>
    </PreviewPage>
  )
}
