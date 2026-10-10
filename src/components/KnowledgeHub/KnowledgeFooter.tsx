import Link from 'next/link'
import Image from 'next/image'
import Logo from '../Footer/logo.svg'
import { trackKBEvent } from './analytics'
import { useNewsletterSignup } from './useNewsletterSignup'
import styles from './footer-v2.module.scss'

type FooterGroup = {
  title: string
  href?: string
  links: [label: string, href: string][]
}

const groups: FooterGroup[] = [
  {
    title: 'Discover',
    links: [
      ['CKB', '/ckbpage'],
      ['Mining', '/mining'],
      ['Wallets', '/wallets'],
      ['Wiki', 'https://en.wikipedia.org/wiki/Nervos_Network'],
      ['Press Kit', '/media-kit'],
    ],
  },
  {
    title: 'Developers',
    href: '/developers',
    links: [
      ['Documentation', 'https://docs.nervos.org/'],
      ['Github', 'https://github.com/nervosnetwork/'],
      ['Explorer', 'https://explorer.nervos.org/'],
    ],
  },
  {
    title: 'Ecosystem',
    href: 'https://ckbdapps.com/ecosystem',
    links: [
      ['Nervos Foundation', '/foundation'],
      ['Cryptape', 'https://cryptape.com/'],
      ['Godwoken', 'https://godwoken.com/'],
      ['Nervina Labs', 'https://nervina.io/'],
      ['Tunnel Vision Labs', 'https://tunnelvisionlabs.xyz/'],
    ],
  },
  {
    title: 'Community',
    href: '/community',
    links: [
      ['Community Fund DAO', 'https://dao.ckb.community/'],
      ['Nervos Talk Forum', 'https://talk.nervos.org/'],
      ['RFCs', 'https://github.com/nervosnetwork/rfcs/'],
    ],
  },
  {
    title: 'Learn',
    href: '/learn',
    links: [
      ['Knowledge Base', '/knowledge-base'],
      ['Blog', 'https://archive.nervos.org/blog'],
      ['Medium', 'https://medium.com/nervosnetwork'],
      ['Youtube', 'https://www.youtube.com/c/NervosNetwork'],
    ],
  },
]
const socials = [
  { label: 'Twitter', href: 'https://x.com/NervosNetwork', icon: 'twitter', height: 16.168 },
  { label: 'Discord', href: 'https://discord.gg/FKh8Zzvwqa', icon: 'discord', height: 14.4 },
  { label: 'Telegram', href: 'https://t.me/NervosNetwork', icon: 'telegram', height: 16.49 },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/nervos', icon: 'linkedin', height: 19.116 },
  { label: 'Reddit', href: 'https://www.reddit.com/r/NervosNetwork/', icon: 'reddit', height: 20 },
  { label: 'Youtube', href: 'https://www.youtube.com/c/NervosNetwork', icon: 'youtube', height: 20 },
  { label: 'Nervos Talk', href: 'https://talk.nervos.org/', icon: 'talk', height: 18 },
]

// Keep the design's arrow markers independent from how each destination opens.
const unmarkedLinks = new Set(['CKB', 'Mining', 'Wallets', 'Knowledge Base'])

// Only fixed navigation labels are used here; never include destination URLs or form values.
const footerLinkId = (label: string) => label.toLowerCase().replace(/\s+/g, '_')

function FooterArrow({ kind = 'external' }: { kind?: 'external' | 'chevron' | 'heading-external' }) {
  return (
    <Image
      className={styles.linkArrow}
      src={`/images/knowledge-hub/footer-${kind}.svg`}
      alt=""
      width={kind === 'chevron' ? 4.036 : kind === 'external' ? 5.7 : 6.7}
      height={kind === 'chevron' ? 7 : kind === 'external' ? 5.7 : 6.7}
      unoptimized
    />
  )
}

export function KnowledgeFooter() {
  const { onSubmit, isSubmitting, status, isError, isInvalid } = useNewsletterSignup('footer')
  return (
    <footer className={styles.footer}>
      <div className={styles.top}>
        <nav className={styles.groups} aria-label="Footer navigation">
          {groups.map(group => (
            <div key={group.title}>
              <h2>
                {group.href ? (
                  <Link
                    href={group.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      trackKBEvent('kb_footer_link_click', {
                        group: footerLinkId(group.title),
                        link_id: `${footerLinkId(group.title)}_heading`,
                      })
                    }
                  >
                    {group.title}
                    <FooterArrow kind={group.title === 'Ecosystem' ? 'heading-external' : 'chevron'} />
                  </Link>
                ) : (
                  group.title
                )}
              </h2>
              <ul>
                {group.links.map(([label, href]) => (
                  <li key={label}>
                    <Link
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() =>
                        trackKBEvent('kb_footer_link_click', {
                          group: footerLinkId(group.title),
                          link_id: footerLinkId(label),
                        })
                      }
                    >
                      {label}
                      {!unmarkedLinks.has(label) && <FooterArrow />}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className={styles.subscribe}>
          <h2>Be a part of the journey.</h2>
          <p>
            The Nervos Network is an ambitious project with a strong mission that is always moving forward. Signing up
            to our monthly newsletter will give you all the updates you need.
          </p>
          <form onSubmit={event => void onSubmit(event)} aria-busy={isSubmitting}>
            <input
              type="email"
              name="email"
              required
              maxLength={254}
              disabled={isSubmitting}
              autoComplete="email"
              aria-label="Footer email address"
              aria-describedby={status ? 'footer-newsletter-status' : undefined}
              aria-invalid={isInvalid || undefined}
              placeholder="Your Email"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              aria-label={isSubmitting ? 'Submitting newsletter signup' : 'Subscribe to newsletter'}
            >
              <Image src="/images/knowledge-hub/footer-submit.svg" width={20} height={14.286} alt="" unoptimized />
            </button>
          </form>
          <div className={styles.socials}>
            {socials.map(({ label, href, icon, height }) => (
              <a
                key={label}
                href={href}
                aria-label={label}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackKBEvent('kb_social_click', { network: icon, placement: 'footer' })}
              >
                <Image
                  src={`/images/knowledge-hub/footer-${icon}.svg`}
                  width={icon === 'talk' ? 18 : 20}
                  height={height}
                  alt=""
                  unoptimized
                />
              </a>
            ))}
          </div>
          <span className={styles.socialRule} aria-hidden="true" />
          {status && (
            <p
              id="footer-newsletter-status"
              role={isError ? 'alert' : 'status'}
              aria-live="polite"
              className={styles.status}
            >
              {status}
            </p>
          )}
        </div>
      </div>
      <div className={styles.bottom}>
        <Logo />
        <p>
          ©Nervos is an open-source project funded by the Nervos Foundation.
          <br />
          All Rights Reserved.
        </p>
      </div>
    </footer>
  )
}
