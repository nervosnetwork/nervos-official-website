import { NextResponse, type NextRequest } from 'next/server'
import migrations from '../public/education_hub_articles/metadata/slug-migrations.json'
import catalog from '../public/education_hub_articles/metadata/catalog.json'
import { kbHubPath, resolveKBHub } from './utils/kb-hubs'

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

export function middleware(request: NextRequest) {
  // Vercel prefixes canonical English requests with /en before middleware.
  // The raw URL cannot distinguish that internal rewrite from a public alias;
  // redirect only real migrations, never the presence of the default locale.
  const hubRedirect = hubDestination(request)
  if (hubRedirect) return NextResponse.redirect(hubRedirect, 308)
  const listingDestination = legacyListingDestination(request)
  if (listingDestination) return NextResponse.redirect(listingDestination, 308)
  const pagePath = requestPagePath(request)
  const migratedPath = migratedAssetPath(pagePath) ?? migratedArticlePath(pagePath, request.nextUrl.locale)
  if (!migratedPath) return NextResponse.next()
  const destination = new URL(request.url)
  // Use the final full path (already locale-prefixed) and preserve the query.
  // getStaticProps alone cannot see query parameters on incoming old URLs.
  destination.pathname = migratedPath
  return NextResponse.redirect(destination, 308)
}

// Next 14 appends an optional .json group to middleware matchers. A bare
// terminal parameter would consume that group as its constraint, so use a
// catch-all here and keep the exact single-segment check in migratedArticlePath.
export const config = {
  matcher: ['/education_hub_articles/:path*', '/knowledge-base/:path*'],
}
