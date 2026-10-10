// changed from https://codersteps.com/articles/how-to-add-opengraph-to-your-next-js-website
import { FC } from 'react'
import Head from 'next/head'
import { pick } from '../../utils'
import { sharingImageUrl, sharingPageUrl } from '../../utils/sharing-urls'

export type OGProperties = {
  locale?: string
  url: string
  title: string
  type: 'article' | 'website'
  description: string
  site_name: string
  image?: {
    alt?: string
    type?: string
    url: string
    width?: string
    height?: string
  }
  author?: string
  section?: string
  modified_time?: string
  published_time?: string

  twitter?: {
    card?: 'summary' | 'summary_large_image' | 'app' | 'player'
    domain?: string
    site?: string
    creator?: string
  }
}

export const OpenGraph: FC<{ properties: OGProperties }> = ({ properties }) => {
  const normalized = {
    ...properties,
    url: sharingPageUrl(properties.url),
    image: properties.image ? { ...properties.image, url: sharingImageUrl(properties.image.url) } : undefined,
  }
  const { url, title, type, description, image, twitter } = normalized

  const ogTags: [string, string][] = []

  Object.entries(pick(normalized, 'type', 'locale', 'title', 'description', 'url', 'site_name')).forEach(
    ([key, value]) => {
      if (value == null) return
      ogTags.push([`og:${key}`, value])
    },
  )

  if (type === 'article') {
    Object.entries(pick(properties, 'author', 'section', 'modified_time', 'published_time')).forEach(([key, value]) => {
      if (value == null) return
      ogTags.push([`article:${key}`, value])
    })
  }

  if (image) {
    Object.entries({
      image: image.url,
      'image:secure_url': image.url.replace('http://', 'https://'),
      'image:width': image.width,
      'image:height': image.height,
      'image:alt': image.alt,
      'image:type': image.type,
    }).forEach(([key, value]) => {
      if (value == null) return
      ogTags.push([`og:${key}`, value])
    })
  }

  Object.entries({
    image: image?.url,
    card: twitter?.card,
    url,
    domain: twitter?.domain,
    title,
    description,
    site: twitter?.site,
    creator: twitter?.creator,
  }).forEach(([key, value]) => {
    if (value == null) return
    ogTags.push([`twitter:${key}`, value])
  })

  return (
    <Head>
      {ogTags.map(([key, value]) => (
        <meta key={key} property={key} content={value} />
      ))}
    </Head>
  )
}
