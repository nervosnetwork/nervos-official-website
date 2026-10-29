import { ComponentProps, Fragment, RefObject, useEffect, useRef, useState } from 'react'
import { Dialog, Disclosure, Transition } from '@headlessui/react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useTranslation } from 'next-i18next'
import clsx from 'clsx'
import LogoIcon from './logo.svg'
import CodeIcon from './code.svg'
import CommunityIcon from './community.svg'
import CircleIcon from './circle.svg'
import LearnIcon from './learn.svg'
import { Icon } from '../KnowledgeHub/Icon'
import { trackKBEvent } from '../KnowledgeHub/analytics'
import { articlePath, type KBArticle } from '../KnowledgeHub/content'
import { setArticleLanguagePreference } from '../KnowledgeHub/article-language'
import styles from './knowledge-header.module.scss'
import { navigationCurrent } from './navigation-current'

const navigationGroups = [
  {
    label: 'developers',
    icon: <CodeIcon aria-hidden="true" />,
    href: '/developers',
    links: [
      ['docs', 'https://docs.nervos.org/'],
      ['github', 'https://github.com/nervosnetwork/'],
      ['explorer', 'https://explorer.nervos.org/'],
    ],
  },
  {
    label: 'CKB',
    icon: <CircleIcon aria-hidden="true" />,
    href: '/ckbpage',
    links: [
      ['mining', '/mining'],
      ['wallets', '/wallets'],
      ['journey', '/journey'],
      ['ecosystem', 'https://ckbdapps.com/ecosystem'],
    ],
  },
  {
    label: 'community',
    icon: <CommunityIcon aria-hidden="true" />,
    href: '/community',
    links: [
      ['community_fund_dao', 'https://dao.ckb.community/'],
      ['forum', 'https://talk.nervos.org/'],
      ['rfcs', 'https://github.com/nervosnetwork/rfcs'],
      ['ckb_nodes', 'https://nodes.ckb.dev/'],
    ],
  },
  {
    label: 'learn',
    icon: <LearnIcon aria-hidden="true" />,
    href: '/learn',
    links: [
      ['medium', 'https://medium.com/nervosnetwork'],
      ['youtube', 'https://www.youtube.com/c/NervosNetwork'],
    ],
  },
] as const

function MenuGlyph() {
  return (
    <svg
      className={styles.menuGlyph}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3 6h18" />
      <path d="M3 12h18" />
      <path d="M3 18h18" />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg
      className={styles.externalIcon}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14 3h7v7M21 3 10 14M10 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6" />
    </svg>
  )
}

function DestinationIcon({ home = false }: { home?: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d={
          home
            ? 'm3 10 9-7 9 7v11h-6v-7H9v7H3Z'
            : 'M12 5v16M12 5C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 1Z'
        }
      />
    </svg>
  )
}

function articleLanguages(article?: KBArticle) {
  return (['en', 'zh'] as const).filter(language =>
    (article?.availableLanguages ?? (article ? [article.language] : [])).includes(language),
  )
}

export function LanguageToggle({ article }: { article?: KBArticle }) {
  const { t } = useTranslation('common', { keyPrefix: 'navigation' })
  const languages = articleLanguages(article)
  if (!article || !languages.length) return null
  return (
    <div className={styles.languageToggle} role="group" aria-label={t('language', 'Language')}>
      {languages.map(locale => (
        <Link
          key={locale}
          className={styles.languageOption}
          href={articlePath(article)}
          locale={locale}
          hrefLang={locale}
          lang={locale}
          aria-label={locale === 'en' ? 'English' : '中文'}
          aria-current={article.language === locale ? 'page' : undefined}
          onClick={() => setArticleLanguagePreference(locale)}
          onAuxClick={event => {
            if (event.button === 1) setArticleLanguagePreference(locale)
          }}
        >
          <span className={styles.languageFace} lang={locale}>
            {locale === 'en' ? 'EN' : '中文'}
          </span>
        </Link>
      ))}
    </div>
  )
}

export function LanguageRadioGroup({ article, onSelect }: { article?: KBArticle; onSelect?: () => void }) {
  const { t } = useTranslation('common', { keyPrefix: 'navigation' })
  const router = useRouter()
  const languages = articleLanguages(article)
  if (!article || !languages.length) return null
  return (
    <fieldset className={styles.languageGroup}>
      <legend>{t('language', 'Language')}</legend>
      {languages.map(locale => (
        <label key={locale} className={styles.languageRadio}>
          <input
            type="radio"
            name="menu-language"
            value={locale}
            checked={article.language === locale}
            onClick={() => {
              // An English-only fallback must still let readers explicitly
              // replace a previously saved Chinese preference with English.
              if (article.language === locale) {
                setArticleLanguagePreference(locale)
                onSelect?.()
              }
            }}
            onChange={() => {
              setArticleLanguagePreference(locale)
              onSelect?.()
              void router.push(articlePath(article), undefined, { locale })
            }}
          />
          <span lang={locale}>{locale === 'en' ? 'English' : '简体中文'}</span>
        </label>
      ))}
    </fieldset>
  )
}

function KnowledgeBrand({ onClick }: { onClick?: () => void }) {
  const { t } = useTranslation('common', { keyPrefix: 'navigation' })
  return (
    <Link href="/knowledge-base" locale="en" className={styles.brand} onClick={onClick}>
      <span className={styles.brandIcon}>
        <Icon name="articleNav-imgGroup" size={24} />
      </span>
      <span className={styles.brandText}>
        <span>{t('knowledge_base')}</span>
        <span className={styles.brandSubtitle}>{t('education_hub', 'Education Hub')}</span>
      </span>
    </Link>
  )
}

function CurrentPageIcon() {
  return (
    <svg
      className={styles.currentIcon}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

export function NavigationMenu({
  article = false,
  articleLanguage,
  className,
}: {
  article?: boolean
  articleLanguage?: KBArticle
  className?: string
}) {
  const { t } = useTranslation('common', { keyPrefix: 'navigation' })
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const current = (href: string) => navigationCurrent(router.pathname, href)

  useEffect(() => {
    const close = () => setOpen(false)
    const desktop = window.matchMedia('(min-width: 901px)')
    const onResize = () => {
      if (desktop.matches) close()
    }
    desktop.addEventListener('change', onResize)
    router.events.on('routeChangeStart', close)
    return () => {
      desktop.removeEventListener('change', onResize)
      router.events.off('routeChangeStart', close)
    }
  }, [router.events])

  return (
    <>
      <button
        type="button"
        className={clsx(styles.menuButton, !article && styles.standaloneMenu, className)}
        aria-label={t('open_menu', 'Open menu')}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <MenuGlyph />
      </button>
      <Transition
        show={open}
        as={Fragment}
        enter={styles.menuTransition}
        enterFrom={styles.menuClosed}
        leave={styles.menuTransition}
        leaveTo={styles.menuClosed}
      >
        <Dialog onClose={setOpen} initialFocus={closeRef} className={styles.dialog}>
          <Dialog.Panel className={styles.panel}>
            <Dialog.Title className={styles.srOnly}>{t('site_navigation', 'Site navigation')}</Dialog.Title>
            <div className={styles.modalHeader}>
              {article ? (
                <KnowledgeBrand onClick={() => setOpen(false)} />
              ) : (
                <Link
                  href="/"
                  locale={article ? 'en' : undefined}
                  aria-label={t('nervos_home', 'Nervos Home')}
                  className={styles.modalLogo}
                  onClick={() => setOpen(false)}
                >
                  <LogoIcon />
                </Link>
              )}
              <button
                ref={closeRef}
                className={styles.closeButton}
                aria-label={t('close_menu', 'Close menu')}
                onClick={() => setOpen(false)}
              >
                <MenuGlyph />
              </button>
            </div>
            {article && (
              <div className={styles.contribute}>
                <a
                  className={styles.writeArticle}
                  href="https://github.com/NervosEducationHub/EducationHubArticles"
                  onClick={() =>
                    trackKBEvent('kb_resource_click', { resource_id: 'write_article', placement: 'mobile_menu' })
                  }
                >
                  <span className={styles.writeArticleFace}>
                    <Icon name="articleNav-imgGroup1" size={19} />
                    {t('write_article', 'Write an article')}
                    <ExternalLinkIcon />
                  </span>
                </a>
              </div>
            )}
            {article && (
              <div className={styles.pinnedLanguage}>
                <LanguageRadioGroup article={articleLanguage} onSelect={() => setOpen(false)} />
              </div>
            )}
            <div className={styles.menuBody}>
              <nav
                aria-label={t('site_navigation', 'Site navigation')}
                onClick={event => {
                  if (event.target instanceof Element && event.target.closest('a[href]')) setOpen(false)
                }}
              >
                <h2 className={styles.navigationLabel}>{t('navigation_label', 'Navigation')}</h2>
                <div className={styles.navigationGroups}>
                  <Link
                    href="/knowledge-base"
                    locale={article ? 'en' : undefined}
                    className={styles.navigationRow}
                    aria-current={current('/knowledge-base')}
                  >
                    <span className={styles.navigationIcon}>
                      <DestinationIcon />
                    </span>
                    <span>{t('knowledge_base')}</span>
                    {current('/knowledge-base') && <CurrentPageIcon />}
                  </Link>
                  <Link
                    href="/"
                    locale={article ? 'en' : undefined}
                    className={styles.navigationRow}
                    aria-current={current('/')}
                  >
                    <span className={styles.navigationIcon}>
                      <DestinationIcon home />
                    </span>
                    <span>{t('nervos_home', 'Nervos Home')}</span>
                    {current('/') && <CurrentPageIcon />}
                  </Link>
                  {navigationGroups.map(group => (
                    <Disclosure key={group.label} as="div">
                      {({ open: expanded }) => (
                        <>
                          <h3 className={styles.groupHeading}>
                            <Disclosure.Button
                              className={styles.navigationRow}
                              data-current={
                                Boolean(current(group.href) || group.links.some(([, href]) => current(href))) ||
                                undefined
                              }
                            >
                              <span className={styles.navigationIcon}>{group.icon}</span>
                              <span>{group.label === 'CKB' ? 'CKB' : t(group.label)}</span>
                              {(current(group.href) || group.links.some(([, href]) => current(href))) && (
                                <CurrentPageIcon />
                              )}
                              <svg
                                className={styles.expandIcon}
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.5"
                              >
                                <path d="M5 12h14" />
                                {!expanded && <path d="M12 5v14" />}
                              </svg>
                            </Disclosure.Button>
                          </h3>
                          <Disclosure.Panel className={styles.groupLinks}>
                            <Link
                              href={group.href}
                              locale={article ? 'en' : undefined}
                              aria-current={current(group.href)}
                            >
                              {t('overview', 'Overview')}
                              {current(group.href) && <CurrentPageIcon />}
                            </Link>
                            {group.links.map(([label, href]) => (
                              <Link
                                key={href}
                                href={href}
                                locale={article && href.startsWith('/') ? 'en' : undefined}
                                aria-current={current(href)}
                              >
                                <span>{t(label).replace(/\n/g, ' ')}</span>
                                {href.startsWith('https://') && <ExternalLinkIcon />}
                                {current(href) && <CurrentPageIcon />}
                              </Link>
                            ))}
                          </Disclosure.Panel>
                        </>
                      )}
                    </Disclosure>
                  ))}
                </div>
              </nav>
            </div>
          </Dialog.Panel>
        </Dialog>
      </Transition>
    </>
  )
}

export function KnowledgeHeader({
  children,
  className,
  readingProgress,
  articleLanguage,
  headerRef,
  ...props
}: ComponentProps<'div'> & {
  readingProgress?: number
  articleLanguage?: KBArticle
  headerRef?: RefObject<HTMLDivElement>
}) {
  const { t } = useTranslation('common', { keyPrefix: 'navigation' })
  return (
    <div
      ref={headerRef}
      className={clsx(styles.header, readingProgress !== undefined && styles.readingHeader, className)}
      {...props}
    >
      <KnowledgeBrand />
      <div className={styles.headerActions}>
        <div className={styles.desktopActions}>
          <a
            className={styles.writeArticle}
            href="https://github.com/NervosEducationHub/EducationHubArticles"
            onClick={() =>
              trackKBEvent('kb_resource_click', {
                resource_id: 'write_article',
                placement: 'article_nav',
                link_url: 'https://github.com/NervosEducationHub/EducationHubArticles',
              })
            }
          >
            <span className={styles.writeArticleFace}>
              <Icon name="articleNav-imgGroup1" size={19} />
              {t('write_article', 'Write an article')}
              <img src="/images/knowledge-hub/article-nav-external.svg" width="5" height="5" alt="" />
            </span>
          </a>
          <LanguageToggle article={articleLanguage} />
          {children}
        </div>
        <NavigationMenu article articleLanguage={articleLanguage} />
      </div>
      {readingProgress !== undefined && (
        <div
          className={styles.mobileReadingProgress}
          role="progressbar"
          aria-label="Article reading progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={readingProgress}
        >
          <span style={{ transform: `scaleX(${readingProgress / 100})` }} />
        </div>
      )}
    </div>
  )
}
