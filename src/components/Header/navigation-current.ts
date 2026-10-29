/** Use Next's locale-neutral pathname; query filters do not change the current section. */
export function navigationCurrent(pathname: string, href: string): 'page' | 'location' | undefined {
  if (pathname === href) return 'page'
  if (href === '/knowledge-base' && pathname.startsWith('/knowledge-base/')) return 'location'
  return undefined
}
