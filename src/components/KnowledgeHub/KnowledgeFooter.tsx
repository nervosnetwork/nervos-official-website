import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/router'
import Logo from '../Footer/logo.svg'
import { trackKBEvent } from './analytics'
import { useNewsletterSignup } from './useNewsletterSignup'
import styles from './footer-v2.module.scss'
import { InformationLinks } from '../InformationLinks'

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
    links: [['Knowledge Base', '/knowledge-base']],
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
const footerResources: Record<string, string> = {
  Documentation: 'developer_docs',
  Github: 'github',
  Explorer: 'explorer',
}

// Translate generic navigation copy while retaining official names and stable analytics IDs.
const chineseLabels: Record<string, string> = {
  Discover: '探索',
  Developers: '开发者',
  Community: '社区',
  Learn: '学习',
  Mining: '挖矿',
  Wallets: '钱包',
  'Press Kit': '媒体资料',
  Documentation: '开发文档',
  Explorer: '区块浏览器',
  'Knowledge Base': '知识库',
}

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
  const { locale } = useRouter()
  const chinese = locale === 'zh'
  const labelFor = (label: string) => (chinese ? (chineseLabels[label] ?? label) : label)
  const { onSubmit, isSubmitting, status, isError, isInvalid } = useNewsletterSignup('footer', locale)
  return (
    <footer className={styles.footer}>
      <div className={styles.top}>
        <nav className={styles.groups} aria-label={chinese ? '页脚导航' : 'Footer navigation'}>
          {groups.map(group => (
            <div key={group.title}>
              <h2>
                {group.href ? (
                  <Link
                    href={group.href}
                    locale="en"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      trackKBEvent('kb_footer_link_click', {
                        group: footerLinkId(group.title),
                        link_id: `${footerLinkId(group.title)}_heading`,
                        link_text: labelFor(group.title),
                        link_url: group.href,
                      })
                    }
                  >
                    {labelFor(group.title)}
                    <FooterArrow kind="chevron" />
                  </Link>
                ) : (
                  labelFor(group.title)
                )}
              </h2>
              <ul>
                {group.links.map(([label, href]) => (
                  <li key={label}>
                    <Link
                      href={href}
                      locale="en"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => {
                        trackKBEvent('kb_footer_link_click', {
                          group: footerLinkId(group.title),
                          link_id: footerLinkId(label),
                          link_text: labelFor(label),
                          link_url: href,
                        })
                        const resource = footerResources[label]
                        if (resource) {
                          trackKBEvent('kb_resource_click', {
                            resource_id: resource,
                            placement: 'footer',
                            link_url: href,
                          })
                        }
                      }}
                    >
                      {labelFor(label)}
                      {!unmarkedLinks.has(label) && <FooterArrow />}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className={styles.subscribe}>
          <h2>{chinese ? '与我们一同前行。' : 'Be a part of the journey.'}</h2>
          <p>
            {chinese
              ? 'Nervos Network 怀抱远大目标，始终坚定使命，不断前行。订阅我们的每月通讯，获取你所需的最新动态。'
              : 'The Nervos Network is an ambitious project with a strong mission that is always moving forward. Signing up to our monthly newsletter will give you all the updates you need.'}
          </p>
          <form onSubmit={event => void onSubmit(event)} aria-busy={isSubmitting}>
            <input
              type="email"
              name="email"
              required
              maxLength={254}
              disabled={isSubmitting}
              autoComplete="email"
              aria-label={chinese ? '订阅邮箱地址' : 'Footer email address'}
              aria-describedby={status ? 'footer-newsletter-status' : undefined}
              aria-invalid={isInvalid || undefined}
              placeholder={chinese ? '你的电子邮箱' : 'Your Email'}
            />
            <button
              type="submit"
              disabled={isSubmitting}
              aria-label={
                isSubmitting
                  ? chinese
                    ? '正在提交订阅请求'
                    : 'Submitting newsletter signup'
                  : chinese
                    ? '订阅通讯'
                    : 'Subscribe to newsletter'
              }
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
                onClick={() => trackKBEvent('kb_social_click', { network: icon, placement: 'footer', link_url: href })}
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
          {chinese ? '©Nervos 是由 ' : '©Nervos is an open-source project funded by the '}
          <span className={styles.textPrimary}>Nervos Foundation</span>
          {chinese ? ' 资助的开源项目。保留所有权利。' : '. All Rights Reserved.'}
        </p>
      </div>
      <InformationLinks
        onNavigate={link =>
          trackKBEvent('kb_footer_link_click', {
            group: 'information',
            link_id: link.id,
            link_text: link.label,
            link_url: link.href,
          })
        }
      />
    </footer>
  )
}
