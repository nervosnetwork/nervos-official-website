import type { KBArticle } from '../components/KnowledgeHub/content'
import { kbHubPath, resolveKBHub } from '../utils/kb-hubs'
import { metaDescription } from '../utils/meta-description'
import { PRODUCTION_SITE_ORIGIN, sharingImageUrl } from '../utils/sharing-urls'
import type { StructuredDataNode } from '../utils/page-seo'

const organizationId = `${PRODUCTION_SITE_ORIGIN}/#org`

function articlePublisher(): StructuredDataNode {
  // Keep article markup self-contained; consumers need not fetch the home
  // page to resolve the shared organization identifier.
  return {
    '@type': 'Organization',
    '@id': organizationId,
    name: 'Nervos Network',
    url: `${PRODUCTION_SITE_ORIGIN}/`,
  }
}

// The organization details below are supplied in handoff tab 13. Contact
// details are deliberately absent until the owner confirms them.
export function homepageStructuredData(): StructuredDataNode[] {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      '@id': organizationId,
      name: 'Nervos Network',
      alternateName: ['Nervos', 'Nervos CKB', 'CKB'],
      url: `${PRODUCTION_SITE_ORIGIN}/`,
      logo: `${PRODUCTION_SITE_ORIGIN}/favicon.svg`,
      description: 'Nervos CKB is an open-source, Proof-of-Work Layer 1 blockchain built on RISC-V and the Cell model.',
      foundingDate: '2018',
      sameAs: [
        'https://x.com/NervosNetwork',
        'https://github.com/nervosnetwork',
        'https://talk.nervos.org/',
        'https://medium.com/nervosnetwork',
        'https://www.youtube.com/c/NervosNetwork',
        'https://en.wikipedia.org/wiki/Nervos_Network',
        'https://www.linkedin.com/company/nervos/',
        'https://coinmarketcap.com/currencies/nervos-network/',
        'https://www.coingecko.com/en/coins/nervos-network',
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      '@id': `${PRODUCTION_SITE_ORIGIN}/#website`,
      url: `${PRODUCTION_SITE_ORIGIN}/`,
      name: 'Nervos Network',
      publisher: { '@id': organizationId },
    },
  ]
}

export function articleStructuredData(article: KBArticle, canonical: string): StructuredDataNode[] {
  if (!article.title?.trim()) return []
  const description = metaDescription(article.description?.trim() || article.subtitle)
  const date = article.date && Number.isFinite(Date.parse(article.date)) ? article.date : null
  const hub = resolveKBHub(article.hub)
  const breadcrumbs: StructuredDataNode[] = [
    { '@type': 'ListItem', position: 1, name: 'Knowledge Base', item: `${PRODUCTION_SITE_ORIGIN}/knowledge-base` },
  ]
  if (hub) {
    breadcrumbs.push({
      '@type': 'ListItem',
      position: breadcrumbs.length + 1,
      name: hub.name,
      item: `${PRODUCTION_SITE_ORIGIN}${kbHubPath(hub.id)}`,
    })
  }
  breadcrumbs.push({ '@type': 'ListItem', position: breadcrumbs.length + 1, name: article.title, item: canonical })

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      '@id': `${canonical}#article`,
      headline: article.title,
      ...(description ? { description } : {}),
      ...(article.coverImage ? { image: sharingImageUrl(article.coverImage) } : {}),
      ...(date ? { datePublished: date } : {}),
      inLanguage: article.language,
      publisher: articlePublisher(),
      mainEntityOfPage: canonical,
      // The source only has display-name strings, not verified Person /
      // Organization identities. Do not invent authors or modification dates.
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      '@id': `${canonical}#breadcrumb`,
      itemListElement: breadcrumbs,
    },
  ]
}
