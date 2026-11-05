import { IS_PROD } from './env'

const productionMeasurementID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || 'G-WVH440CNZ3'
export const GA_DEBUG =
  !IS_PROD && (process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview' || process.env.NEXT_PUBLIC_GA_DEBUG === 'true')
// Preview must be configured explicitly: debug_mode alone does not isolate
// traffic from production reports. Do not silently reuse the production stream.
export const GA_MEASUREMENT_ID = IS_PROD
  ? productionMeasurementID
  : process.env.NEXT_PUBLIC_GA_PREVIEW_MEASUREMENT_ID || ''
export const GA_ENABLED =
  (IS_PROD || GA_DEBUG) &&
  /^G-[A-Z0-9]+$/.test(GA_MEASUREMENT_ID) &&
  (IS_PROD || GA_MEASUREMENT_ID !== productionMeasurementID)

type GAWindow = Window & {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => unknown
  nervosGAInitialized?: boolean
  nervosGAPage?: string
  nervosGAPageLocation?: string
  nervosGAPageReferrer?: string
}

// Event URLs need a destination, not arbitrary form/query/hash contents.
export function analyticsURL(value: string, base = 'https://www.nervos.org'): string | undefined {
  try {
    if (!value.trim()) return undefined
    const url = new URL(value, base)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return undefined
    if (/@|%40/i.test(url.pathname)) return undefined
    url.search = ''
    url.hash = ''
    return url.href.slice(0, 500)
  } catch {
    return undefined
  }
}

export function analyticsText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (/[\u0000-\u001f\u007f]/.test(value)) return undefined
  const text = value.trim().replace(/\s+/g, ' ')
  // Best-effort filtering, also applied to search input. Reject obvious emails,
  // URLs, common wallet formats and long digit sequences; not a general PII detector.
  if (
    !text ||
    /@|https?:\/\/|0x[a-f\d]{16,}|\b(?:bc1|tb1|ckb1|ckt1)[a-z\d]{20,}|\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b|(?:\d[\s()+.-]*){7,}/i.test(
      text,
    )
  )
    return undefined
  return Array.from(text).slice(0, 100).join('')
}

export function contentGroup(pathname: string): string {
  const path = pathname.replace(/^\/(en|zh|es|fr|ko|tr|pt)(?=\/|$)/, '').replace(/\/$/, '')
  if (path === '/knowledge-base') return 'kb_home'
  if (/^\/knowledge-base\/topic(?:\/|$)/.test(path)) return 'hub'
  if (/^\/knowledge-base\/start-here$/.test(path)) return 'start_here'
  if (/^\/knowledge-base\/(articles|search)$/.test(path)) return 'all_articles'
  if (/^\/knowledge-base\/[^/]+$/.test(path)) return 'article'
  return 'core'
}

export function initializeGA(): GAWindow | undefined {
  if (!GA_ENABLED || typeof window === 'undefined') return undefined
  const browser = window as GAWindow
  try {
    if (browser.nervosGAInitialized) return browser
    browser.dataLayer = browser.dataLayer || []
    browser.gtag =
      browser.gtag ||
      function () {
        // eslint-disable-next-line prefer-rest-params -- Match Google's standard gtag Arguments queue.
        browser.dataLayer?.push(arguments)
      }
    browser.gtag('js', new Date())
    browser.gtag('config', GA_MEASUREMENT_ID, {
      send_page_view: false,
      ...(GA_DEBUG ? { debug_mode: true } : {}),
    })
    browser.nervosGAInitialized = true
    return browser
  } catch {
    return undefined
  }
}

function pageTitle(browser: GAWindow): string {
  // Search page titles may include free-form user input. Other titles are
  // published editorial text; preserve their usefulness in existing reports.
  if (/\/knowledge-base\/search\/?$/.test(browser.location.pathname)) return 'Knowledge Base'
  return (
    analyticsText(document.title) ||
    (contentGroup(browser.location.pathname) === 'core' ? 'Nervos Network' : 'Knowledge Base')
  )
}

export function trackGAEvent(name: string, data: Record<string, string | number | boolean>): void {
  const browser = initializeGA()
  if (!browser) return
  try {
    browser.gtag?.('event', name, {
      ...data,
      send_to: GA_MEASUREMENT_ID,
      content_group: contentGroup(browser.location.pathname),
      page_location: analyticsURL(browser.location.href) || 'https://www.nervos.org/',
      page_referrer: browser.nervosGAPageReferrer || '',
      page_title: pageTitle(browser),
      ...(GA_DEBUG ? { debug_mode: true } : {}),
    })
  } catch {
    // Blocked analytics must never interrupt navigation or subscription.
  }
}

export function trackGAPageView(asPath: string): void {
  const browser = initializeGA()
  if (!browser) return
  try {
    // Retain query changes as distinct views, but do not send their contents.
    // Hash-only navigation and StrictMode effect replays are not new views.
    const key = asPath.split('#')[0] || '/'
    if (browser.nervosGAPage === key) return
    const pageLocation = analyticsURL(browser.location.href) || 'https://www.nervos.org/'
    const context = {
      page_location: pageLocation,
      page_referrer: browser.nervosGAPageLocation || analyticsURL(document.referrer || '') || '',
      page_title: pageTitle(browser),
      content_group: contentGroup(browser.location.pathname),
    }
    browser.gtag?.('set', context)
    browser.gtag?.('event', 'page_view', {
      ...context,
      send_to: GA_MEASUREMENT_ID,
      ...(GA_DEBUG ? { debug_mode: true } : {}),
    })
    browser.nervosGAPage = key
    browser.nervosGAPageLocation = pageLocation
    browser.nervosGAPageReferrer = context.page_referrer
  } catch {
    // Keep the page functional if the SDK is unavailable.
  }
}
