import { useState } from 'react'
import { PreviewPage, Breadcrumb } from './Shared'
import { HubCard, SubjectCard, StepSection, ArticleCard } from './Components'
import { guideSteps } from './guide-data'
import { hubs, previewArticleTitles } from './fixtures'
import styles from './style-guide.module.scss'

const swatches = [
  'brand',
  'accent',
  'brand-surface',
  'text',
  'secondary',
  'muted',
  'placeholder',
  'disabled',
  'border',
  'divider',
  'surface',
  'subtle',
  'input',
  'raised',
  'dark',
  'dark-raised',
  'dark-elevated',
  'tag-nervos',
  'tag-blockchain',
  'tag-crypto',
  'tag-pow',
]
const scale = ['display', 'h1', 'h2', 'h3', 'h4', 'h5', 'subheader', 'subheader2', 'body', 'body2', 'label', 'footnote']

export function StyleGuide() {
  const [selected, setSelected] = useState(0)
  const firstHub = hubs[0]
  const firstStep = guideSteps[0]
  return (
    <PreviewPage title="Style guide & components" revision newsletter={false}>
      <div className={styles.guide}>
        <Breadcrumb current="Style guide & components" revision />
        <h1>Style guide & components</h1>
        <p>Implementation reference for the updated Figma design. Static sample content only.</p>
        <section>
          <h2>Colour tokens</h2>
          <div className={styles.swatches}>
            {swatches.map(name => (
              <div key={name}>
                <span style={{ background: `var(--kb-${name})` }} />
                <code>{name}</code>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2>Typography · Articulat CF</h2>
          <div className={styles.typeScale}>
            {scale.map(role => (
              <div key={role}>
                <code>{role}</code>
                <span className={styles[role]}>Knowledge Base Hub</span>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2>Subject Card · selected / unselected / step</h2>
          <div className={styles.subjects}>
            {[
              'Scaling Fundamentals',
              'Rollups, Data Availability & Sidechains',
              'What is Nervos CKB?',
              'Why it’s built differently',
            ].map((title, index) => (
              <SubjectCard
                key={title}
                title={title}
                step={index > 1 ? index - 1 : undefined}
                icon={index === 0 ? 'topicControls-imgArrowExpand' : 'topicControls-imgSystemData'}
                selected={selected === index}
                onClick={() => setSelected(index)}
              />
            ))}
          </div>
        </section>
        <section>
          <h2>Topic Hub Card</h2>
          <div className={styles.hub}>
            {firstHub && <HubCard {...firstHub} index={0} titles={previewArticleTitles} />}
          </div>
        </section>
        <section>
          <h2>Step Section</h2>
          {firstStep && <StepSection step={firstStep} index={0} />}
        </section>
        <section>
          <h2>Article Card</h2>
          <ArticleCard horizontal title="What is Nervos? A complete guide for newbies." />
        </section>
        <section>
          <h2>Article grid variants</h2>
          <div className={styles.articleGrid}>
            {(['small', 'medium', 'large'] as const).map(size => (
              <ArticleCard key={size} size={size} title="Layer 1 vs Layer 2" tag="Scaling" />
            ))}
          </div>
        </section>
      </div>
    </PreviewPage>
  )
}
