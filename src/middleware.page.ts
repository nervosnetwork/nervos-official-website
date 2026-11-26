import { NextResponse, type NextRequest } from 'next/server'
import migrations from '../public/education_hub_articles/metadata/slug-migrations.json'
import catalog from '../public/education_hub_articles/metadata/catalog.json'
import { kbHubPath, resolveKBHub } from './utils/kb-hubs'
import { prefersMarkdown } from './utils/markdown-accept'

const renamedFolders = new Map(migrations.renames.map(({ from, to }) => [from, to]))
const assetPrefix = '/education_hub_articles/'

// Keep D-07/D-18 working for client navigation with unnormalized data URLs.
// Only derive a page path; never strip /en from a Next data endpoint.
export function requestPagePath(request: NextRequest): string {
  const pathname = request.nextUrl.pathname
  const dataPath = /^\/_next\/data\/[^/]+(\/.*)\.json$/.exec(pathname)?.[1]
  if (!dataPath) return pathname
  const prefix = `/${request.nextUrl.locale}`
  const pagePath = dataPath.toLowerCase().startsWith(`${prefix}/`) ? dataPath.slice(prefix.length) : dataPath
  return pagePath === '/index' ? '/' : pagePath
}

// Approved information documents are English-only. Use middleware rather than
// config redirects so Next client/data navigation follows the same policy.
export function informationPageDestination(request: NextRequest): URL | null {
  if (!request.nextUrl.locale || request.nextUrl.locale === 'en') return null
  const pathname = requestPagePath(request)
  if (!['/about', '/privacy', '/contact'].includes(pathname)) return null
  const destination = new URL(request.url)
  destination.pathname = pathname
  return destination
}

// D-07 applies only to the retired listing, never to article URLs or the new
// /articles pagination. A combined page + sort_by URL goes to the archive in
// one hop; old page numbers do not map to the redesigned listing's page sizes.
export function legacyListingDestination(request: NextRequest): URL | null {
  const { searchParams, locale, defaultLocale } = request.nextUrl
  const pathname = requestPagePath(request)
  if (pathname !== '/knowledge-base') return null
  const hasPage = searchParams.has('page')
  if (!hasPage && !searchParams.has('sort_by')) return null
  const prefix = locale && locale !== defaultLocale ? `/${locale}` : ''
  const destination = new URL(request.url)
  destination.pathname = `${prefix}/knowledge-base${hasPage ? '/articles' : ''}`
  destination.searchParams.delete('page')
  destination.searchParams.delete('sort_by')
  return destination
}

// Hub templates have no translated editions. Resolve only the six approved
// selectors and combine the path migration and locale fallback in one hop.
export function hubDestination(request: NextRequest): URL | null {
  const pathname = requestPagePath(request)
  const destination = new URL(request.url)
  if (pathname === '/knowledge-base/topic') {
    const selectors = request.nextUrl.searchParams.getAll('hub')
    if (selectors.length > 1) return null
    const target = selectors.length ? kbHubPath(selectors[0]) : '/knowledge-base'
    if (!target) return null // The old page returns 404 for invalid selectors.
    destination.pathname = target
    if (selectors.length) destination.searchParams.delete('hub')
    return destination
  }
  const segment = /^\/knowledge-base\/topic\/([^/]+)$/.exec(pathname)?.[1]
  if (!segment) return null
  let id: string
  try {
    id = decodeURIComponent(segment)
  } catch {
    return null
  }
  const hub = resolveKBHub(id)
  if (!hub || hub.id !== id) return null
  if (request.nextUrl.locale === 'en') return null
  destination.pathname = kbHubPath(hub.id)
  return destination
}

export function migratedArticlePath(pathname: string, locale = 'en', now = Date.now()): string | null {
  const match = /^\/knowledge-base\/([^/]+)$/.exec(pathname)
  if (!match?.[1]) return null
  let oldId: string
  try {
    oldId = decodeURIComponent(match[1])
  } catch {
    return null
  }
  const target = renamedFolders.get(oldId)
  if (!target) return null
  // An unpublished translation is not a missing translation.
  const versions = catalog.articles.filter(article => article.id === target)
  const article =
    versions.find(article => article.language === locale) ?? versions.find(article => article.language === 'en')
  if (!article || article.draft || (article.date && Date.parse(article.date) > now)) return null
  return encodeURI(article.canonicalPath)
}

// Keep already-shared image URLs working after moving their article folder.
// An exact comparison avoids redirecting a new lowercase path back to itself.
export function migratedAssetPath(pathname: string): string | null {
  if (!pathname.startsWith(assetPrefix)) return null
  const [folder, ...rest] = pathname.slice(assetPrefix.length).split('/')
  if (!folder || !rest.length) return null
  let decoded: string
  try {
    decoded = decodeURIComponent(folder)
  } catch {
    return null
  }
  const target = renamedFolders.get(decoded)
  return target ? `${assetPrefix}${encodeURIComponent(target)}/${rest.join('/')}` : null
}

// Only the blocking article route needs an early missing-page decision.
// SSR archive/search/topic pages determine their own query-dependent 404s.
export function missingKBArticlePath(pathname: string, locale = 'en', now = Date.now()): boolean {
  const segment = /^\/knowledge-base\/([^/]+)$/.exec(pathname)?.[1]
  if (!segment || ['articles', 'search', 'start-here', 'topic'].includes(segment)) return false
  let id: string
  try {
    id = decodeURIComponent(segment)
  } catch {
    return true
  }
  id = renamedFolders.get(id) ?? id
  const versions = catalog.articles.filter(article => article.id === id)
  // A missing translation still redirects to published English. An existing
  // draft/future translation stays unavailable, matching articleStaticProps.
  const article =
    versions.find(article => article.language === locale) ?? versions.find(article => article.language === 'en')
  return !article || article.draft || Boolean(article.date && !(Date.parse(article.date) <= now))
}

export function middleware(request: NextRequest) {
  const informationDestination = informationPageDestination(request)
  if (informationDestination) return NextResponse.redirect(informationDestination, 308)
  // Vercel prefixes canonical English requests with /en before middleware.
  // The raw URL cannot distinguish that internal rewrite from a public alias;
  // redirect only real migrations, never the presence of the default locale.
  const hubRedirect = hubDestination(request)
  if (hubRedirect) return NextResponse.redirect(hubRedirect, 308)
  const listingDestination = legacyListingDestination(request)
  if (listingDestination) return NextResponse.redirect(listingDestination, 308)
  const pagePath = requestPagePath(request)
  const migratedPath = migratedAssetPath(pagePath) ?? migratedArticlePath(pagePath, request.nextUrl.locale)
  if (migratedPath) {
    const destination = new URL(request.url)
    // Use the final full path (already locale-prefixed) and preserve the query.
    // getStaticProps alone cannot see query parameters on incoming old URLs.
    destination.pathname = migratedPath
    return NextResponse.redirect(destination, 308)
  }

  // B9 supports English landing URLs and actual article renditions. Keep SSG and ordinary
  // browser rendering intact, and never turn a client-navigation JSON request
  // into Markdown even when requestPagePath resolves it to a landing page.
  const pathname = request.nextUrl.pathname
  const isPageRead =
    (request.method === 'GET' || request.method === 'HEAD') &&
    !request.headers.has('x-nextjs-data') &&
    !pathname.startsWith('/_next/')
  const markdown = prefersMarkdown(request.headers.get('accept') ?? undefined)
  if (isPageRead && markdown && missingKBArticlePath(pathname, request.nextUrl.locale)) {
    return NextResponse.rewrite(new URL('/api/markdown-not-found', request.url))
  }
  const englishHomepage =
    isPageRead && request.nextUrl.locale === 'en' && (pathname === '/' || pathname === '/knowledge-base')
  if (englishHomepage && markdown) {
    const destination = new URL(
      pathname === '/' ? '/api/markdown-homepage/home' : '/api/markdown-homepage/knowledge-base',
      request.url,
    )
    return NextResponse.rewrite(destination)
  }
  if (isPageRead && markdown) {
    const segment = /^\/knowledge-base\/([^/]+)$/.exec(pathname)?.[1]
    if (segment && !['articles', 'search', 'start-here', 'topic'].includes(segment)) {
      let id: string
      try {
        id = decodeURIComponent(segment)
      } catch {
        return NextResponse.rewrite(new URL('/api/markdown-not-found', request.url))
      }
      // Next can restore a locale-stripped public URL inside rewritten APIs.
      // Bind these values here, overriding any caller-supplied copies. Direct
      // API calls bind identity from their own URL instead of these headers.
      const headers = new Headers(request.headers)
      headers.set('x-kb-markdown-language', request.nextUrl.locale)
      headers.set('x-kb-markdown-id', encodeURIComponent(id))
      return NextResponse.rewrite(
        new URL(`/api/markdown-article/${request.nextUrl.locale}/${encodeURIComponent(id)}`, request.url),
        { request: { headers } },
      )
    }
  }
  return NextResponse.next()
}

// Next 14 appends an optional .json group to middleware matchers. A bare
// terminal parameter would consume that group as its constraint, so use a
// catch-all here and keep the exact single-segment check in migratedArticlePath.
export const config = {
  matcher: ['/', '/about', '/privacy', '/contact', '/education_hub_articles/:path*', '/knowledge-base/:path*'],
}
