import { useEffect } from 'react'
import { trackKBEvent } from '../KnowledgeHub/analytics'

const TRACKED_LINK_PROTOCOLS = new Set(['http:', 'https:'])

function getDestinationCategory(url: URL) {
  const hostname = url.hostname.replace(/^www\./, '')

  if (url.origin === window.location.origin) {
    return 'internal'
  }

  if (hostname === 'docs.nervos.org') {
    return 'documentation'
  }

  if (hostname === 'github.com') {
    return url.pathname.includes('/discussions') ? 'community' : 'source_repository'
  }

  if (hostname === 'discord.gg' || hostname === 't.me' || hostname === 'talk.nervos.org') {
    return 'community'
  }

  return 'other'
}

export function LinkClickTracker() {
  useEffect(() => {
    const handleLinkClick = (event: MouseEvent) => {
      const target = event.target

      if (!(target instanceof Element)) {
        return
      }

      const link = target.closest<HTMLAnchorElement>('a[href]')

      if (!link) {
        return
      }

      let linkUrl: URL
      try {
        linkUrl = new URL(link.href, window.location.href)
      } catch {
        return
      }

      if (!TRACKED_LINK_PROTOCOLS.has(linkUrl.protocol)) {
        return
      }

      trackKBEvent('link_click', {
        destination_category: getDestinationCategory(linkUrl),
        link_url: linkUrl.href,
        outbound: linkUrl.origin !== window.location.origin,
      })
    }

    document.addEventListener('click', handleLinkClick)

    return () => {
      document.removeEventListener('click', handleLinkClick)
    }
  }, [])

  return null
}
