import React from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useTranslation } from 'next-i18next'
import clsx from 'clsx'
import { DISABLE_CGOL_MOUSE_CONTROLLER } from '../../../../components/ConwayGameOfLife/constants'
import { SubscribeWrap } from './SubscribeWrap'
import { XIcon, DiscordIcon, TelegramIcon, LinkedInIcon, RedditIcon, YoutubeIcon, TIcon } from './icons'

import styles from './index.module.scss'

export type MediasProps = {
  label: string | React.ReactNode
  url: string
  name: string
  icon: string
  width: number
  height: number
}

export const FooterMedia: React.FC<{ darkSocialIcons?: boolean }> = ({ darkSocialIcons = false }) => {
  const [t] = useTranslation('common', { keyPrefix: 'mailchimp' })
  const title = t('title')
  const description = t('slogan')

  // Todo: the url is temporarily filled with placeholders
  const medias: MediasProps[] = [
    {
      label: <XIcon />,
      url: 'https://x.com/NervosNetwork',
      name: 'Twitter',
      icon: 'twitter',
      width: 20,
      height: 16.1667,
    },
    {
      label: <DiscordIcon />,
      url: 'https://discord.gg/FKh8Zzvwqa',
      name: 'Discord',
      icon: 'discord',
      width: 20,
      height: 14.3997,
    },
    {
      label: <TelegramIcon />,
      url: 'https://t.me/NervosNetwork',
      name: 'Telegram',
      icon: 'telegram',
      width: 20.0013,
      height: 16.4893,
    },
    {
      label: <LinkedInIcon />,
      url: 'https://www.linkedin.com/company/nervos',
      name: 'LinkedIn',
      icon: 'linkedin',
      width: 20,
      height: 19.1164,
    },
    {
      label: <RedditIcon />,
      url: 'https://www.reddit.com/r/NervosNetwork/',
      name: 'Reddit',
      icon: 'reddit',
      width: 20,
      height: 20,
    },
    {
      label: <YoutubeIcon />,
      url: 'https://www.youtube.com/c/NervosNetwork',
      name: 'YouTube',
      icon: 'youtube',
      width: 20,
      height: 20,
    },
    {
      label: <TIcon />,
      url: 'https://talk.nervos.org/',
      name: 'Nervos Talk',
      icon: 'talk',
      width: 18,
      height: 18,
    },
  ]

  return (
    <div className={clsx(styles.footerMedia, DISABLE_CGOL_MOUSE_CONTROLLER)}>
      <div className={styles.title}>{title}</div>
      <div className={styles.description}>{description}</div>
      <SubscribeWrap />
      <div className={clsx(styles.medias, darkSocialIcons && styles.darkSocials)}>
        {medias?.map(({ label, url, name, icon, width, height }) => (
          <Link
            href={url}
            key={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={darkSocialIcons ? name : undefined}
          >
            {darkSocialIcons ? (
              <Image
                src={`/images/information-pages/footer-${icon}.svg`}
                width={width}
                height={height}
                style={{ width, height }}
                alt=""
                unoptimized
              />
            ) : (
              label
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
