// Sharing metadata must point to the public site, including when rendered in a
// local or preview deployment. This does not change routing or canonical policy.
export const PRODUCTION_SITE_ORIGIN = 'https://www.nervos.org'

export function sharingPageUrl(path: string, locale?: string, defaultLocale = 'en'): string {
  const source = new URL(path, PRODUCTION_SITE_ORIGIN)
  let pathname = source.pathname
  const defaultPrefix = `/${defaultLocale}`
  if (pathname === defaultPrefix || pathname.startsWith(`${defaultPrefix}/`)) {
    pathname = pathname.slice(defaultPrefix.length) || '/'
  }
  if (locale && locale !== defaultLocale && pathname !== `/${locale}` && !pathname.startsWith(`/${locale}/`)) {
    pathname = `/${locale}${pathname === '/' ? '' : pathname}`
  }
  // Preserve query-based Hub and listing addresses until their routing policy
  // is agreed. A fragment identifies a section, not a separate shared page.
  return `${PRODUCTION_SITE_ORIGIN}${pathname}${source.search}`
}

export function sharingImageUrl(src: string): string {
  const image = new URL(src, `${PRODUCTION_SITE_ORIGIN}/`)
  if (image.hostname === 'nervos.org' || image.hostname === 'www.nervos.org') {
    return `${PRODUCTION_SITE_ORIGIN}${image.pathname}${image.search}${image.hash}`
  }
  // Keep existing external images on their original host. Protocol-relative
  // image URLs are resolved to HTTPS by the production base above.
  return image.href
}
