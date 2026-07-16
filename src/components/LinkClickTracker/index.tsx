import { useEffect } from 'react'

const TRACKED_LINK_PROTOCOLS = new Set(['http:', 'https:'])

type Umami = (eventName: string, eventParams: Record<string, string>) => void

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

      const linkUrl = new URL(link.href, window.location.href)

      if (!TRACKED_LINK_PROTOCOLS.has(linkUrl.protocol)) {
        return
      }

      const umami = (window as typeof window & { umami?: { track?: Umami } }).umami
      const track = umami?.track

      if (!track) {
        return
      }

      track('link_click', {
        destination_category: getDestinationCategory(linkUrl),
      })
    }

    document.addEventListener('click', handleLinkClick)

    return () => {
      document.removeEventListener('click', handleLinkClick)
    }
  }, [])

  return null
}
