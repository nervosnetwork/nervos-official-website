import type { GetStaticProps, NextPage } from 'next'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { Page } from 'src/components/Page'
import clsx from 'clsx'
import { useTranslation } from 'next-i18next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { BASE_URL } from 'src/utils'
import { withStaticPageSEO } from '../../server/page-seo'
import { StyledLink } from '../../components/StyledLink'
import { useBodyClass, useIsMobile } from '../../hooks'
import styles from './index.module.scss'
import presets from '../../styles/presets.module.scss'
import { BadgeLeft, BadgeRight, inprogress, journey } from './icons'
import { Journey } from './Journey'

const Roadmap: NextPage = () => {
  useBodyClass([presets.themeDark ?? ''])
  const [t, { language }] = useTranslation(['journey', 'common'])
  const { pathname } = useRouter()
  const isMobile = useIsMobile()
  const isDesktop = !isMobile
  // The former "In progress / Upcoming / Achievements" lists went stale quickly and were hard to keep accurate.
  // Point visitors to Nervos Talk, where roadmap discussions and development updates are always current.
  const roadmapSectionData = {
    title: <div className={clsx(styles.sectionTitle, styles.inProgressTitle)}>{t('roadmap.title')}</div>,
    icon: inprogress,
    iconPosition: 'left' as const,
    description: t('roadmap.description'),
    joinLink: 'https://talk.nervos.org/',
    joinLinkText: t('roadmap.link_text'),
  }

  const journeySectionData = {
    title: <div className={clsx(styles.sectionTitle)}>{t('journey.title')}</div>,
    icon: journey,
    iconPosition: 'right' as const,
    description: t('journey.description'),
    // TODO: add join button href here
    joinLink: 'https://discord.gg/FKh8Zzvwqa',
    joinLinkText: t('journey.link_text'),
  }

  const pageTitle = 'Nervos Network | Journey'

  return (
    <>
      <Head>
        <title>{pageTitle}</title>
      </Head>
      <Page
        className={styles.baseSeparatePage}
        openGraph={props => ({
          ...props,
          type: 'website',
          title: t('title'),
          description: `${t('subtitle.never_finished')}, ${t('subtitle.always_building')}`,
          url: `${BASE_URL}/${language}${pathname}`,
          site_name: pageTitle,
          image: {
            alt: 'coverImage',
            url: `${BASE_URL}/images/topics/Journey.png`,
          },
        })}
      >
        <div className={styles.content}>
          {isDesktop && (
            <>
              <div className={clsx(styles.embellishedElements, styles.embellishedElementLeft)} />
              <div className={clsx(styles.embellishedElements, styles.embellishedElementRight)} />
            </>
          )}
          {isMobile && (
            <>
              <div className={clsx(styles.embellishedElements, styles.embellishedElementMobileUp)} />
              <div className={clsx(styles.embellishedElements, styles.embellishedElementMobileDown)} />
            </>
          )}
          <div>
            <h1 className={styles.title}>{t('title')}</h1>
            <div className={styles.subTitleWrapper}>
              <div className={styles.subTitleItem}>{t('subtitle.never_finished')},</div>
              <div className={styles.subTitleItem}>{t('subtitle.always_building')}</div>
            </div>
          </div>

          <div className={styles.badges}>
            <div className={styles.badgeLeft}>
              <BadgeLeft />
            </div>
            <div className={styles.badgeRight}>
              <BadgeRight />
            </div>
          </div>

          <div className={styles.slogan}>
            <div className={styles.sloganTitle}>{t('get_involved.title')}</div>
            <div className={styles.sloganText}>{t('get_involved.description_1')}</div>
            <div className={styles.sloganText}>{t('get_involved.description_2')}</div>
            {/* // TODO: add join button href here */}
            <StyledLink className={styles.link} href="https://github.com/nervosnetwork/rfcs/" colored>
              {t('get_involved.rfcs')}
            </StyledLink>{' '}
            | {/* // TODO: add join button href here */}
            <StyledLink className={styles.link} href="https://talk.nervos.org" colored>
              {t('get_involved.nervos_talk_forum')}
            </StyledLink>
          </div>
          <Journey
            title={roadmapSectionData.title}
            icon={roadmapSectionData.icon}
            iconPosition={roadmapSectionData.iconPosition}
            description={roadmapSectionData.description}
            joinLink={roadmapSectionData.joinLink}
            joinLinkText={roadmapSectionData.joinLinkText}
          />
          <Journey
            title={journeySectionData.title}
            icon={journeySectionData.icon}
            iconPosition={journeySectionData.iconPosition}
            description={journeySectionData.description}
            joinLink={journeySectionData.joinLink}
            joinLinkText={journeySectionData.joinLinkText}
          />
        </div>
      </Page>
    </>
  )
}

export const getStaticProps: GetStaticProps = withStaticPageSEO('/journey', async ({ locale = 'en' }) => {
  const lng = await serverSideTranslations(locale, ['common', 'journey'])
  return {
    props: lng,
  }
})

export default Roadmap
