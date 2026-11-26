import Link from 'next/link'
import Image from 'next/image'
import clsx from 'clsx'
import { informationPages } from '../../../config/information-pages.mjs'
import { Page } from '../Page'
import { AboutContent } from './AboutContent'
import { ContactContent } from './ContactContent'
import { PrivacyContent } from './PrivacyContent'
import styles from './information.module.scss'

export type InformationPageKind = 'about' | 'privacy' | 'contact'

const introductions = {
  about: (
    <>
      <strong>Common Knowledge Base (CKB)</strong> is the Layer 1 blockchain of Nervos Network. It processes, validates,
      and finalizes transactions on its own ledger, under its own consensus rules, without relying on any other chain.
      Its native token, also called CKB, pays for transaction fees, and holding it gives the right to store data on the
      chain: one CKB for each byte. CKB has been producing blocks since its launch in November 2019.
    </>
  ),
  contact: <>Pick the channel that matches your question and you&apos;ll reach the right people faster.</>,
  privacy: (
    <>
      This policy explains what information nervos.org collects when you visit, why, and what you can do about it. It
      covers this website only. Other sites we link to, such as the Nervos Talk forum, GitHub, Discord, or wallets
      listed on our pages, have their own policies.
    </>
  ),
}

const resources = [
  { label: 'Start here: a quick introduction to CKB', href: '/knowledge-base/start-here', icon: 'learn-start.svg' },
  { label: 'Browse the Nervos Knowledge Base', href: '/knowledge-base', icon: 'learn-kb.svg' },
  {
    label: 'Compare blockchain virtual machines',
    href: '/knowledge-base/comparing_blockchain_virtual_machines',
    icon: 'learn-article.svg',
  },
  { label: 'Read the developer documentation', href: 'https://docs.nervos.org/', icon: 'learn-article.svg' },
  { label: 'Join the Common Knowledge Base Association', href: 'https://ckba.build/', icon: 'learn-article.svg' },
]

export function InformationPage({ kind, updatedAt }: { kind: InformationPageKind; updatedAt?: string | null }) {
  const metadata = informationPages[kind]
  return (
    <Page
      className={clsx(styles.page, kind === 'privacy' && styles.privacyPage)}
      openGraph={defaults => ({ ...defaults, title: metadata.title, description: metadata.description })}
    >
      {({ renderHeader, renderFooter }) => (
        <>
          {renderHeader({ variant: 'information', className: styles.header })}
          <div className={styles.hero}>
            <Image
              className={styles.heroDecoration}
              src="/images/information-pages/hero-cells.png"
              width={2048}
              height={1063}
              alt=""
              priority
            />
            <h1>{metadata.heading}</h1>
            <div className={styles.introduction}>
              <p>{introductions[kind]}</p>
            </div>
          </div>
          <div className={styles.community}>
            <p>
              As an open-source community-driven initiative, we welcome your input and encourage you to suggest new
              topics, add content, and provide examples where you believe it could be helpful.
            </p>
            <div className={styles.revision}>
              {updatedAt && (
                <time dateTime={updatedAt}>
                  Last updated:{' '}
                  {new Intl.DateTimeFormat('en', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: 'UTC',
                  }).format(new Date(updatedAt))}
                </time>
              )}
              <a
                className={styles.contributors}
                href="https://github.com/nervosnetwork/nervos-official-website/graphs/contributors"
                target="_blank"
                rel="noopener noreferrer"
              >
                See contributors
              </a>
            </div>
          </div>
          <div className={styles.content}>
            {kind === 'about' ? <AboutContent /> : kind === 'contact' ? <ContactContent /> : <PrivacyContent />}
          </div>
          <section className={styles.learn} aria-labelledby="information-learn-more">
            <div className={styles.learnInner}>
              <h2 id="information-learn-more">Learn more</h2>
              <div className={styles.resources}>
                {resources.map((resource, index) => (
                  <Link
                    key={resource.href}
                    className={styles.resource}
                    href={resource.href}
                    locale="en"
                    {...(resource.href.startsWith('https:') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                  >
                    <Image
                      src={`/images/information-pages/${resource.icon}`}
                      width={index === 1 ? 31 : 30}
                      height={index === 1 ? 31 : 30}
                      alt=""
                      unoptimized
                    />
                    <span>{resource.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
          {renderFooter({ darkSocialIcons: true, className: styles.informationFooter })}
        </>
      )}
    </Page>
  )
}
