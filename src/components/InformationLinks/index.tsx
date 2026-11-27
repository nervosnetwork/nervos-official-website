import Link from 'next/link'
import { informationPages } from '../../../config/information-pages.mjs'
import styles from './index.module.scss'

const links = [
  { id: 'about', label: 'About us', href: informationPages.about.path },
  { id: 'privacy', label: 'Privacy Policy', href: informationPages.privacy.path },
  { id: 'contact', label: 'Contact us', href: informationPages.contact.path },
]

export function InformationLinks({
  onNavigate,
  footerBottom = false,
}: {
  onNavigate?: (link: (typeof links)[number]) => void
  footerBottom?: boolean
}) {
  return (
    <nav className={footerBottom ? styles.bottomLinks : styles.links} aria-label="Site information">
      {links.map(link => (
        <Link key={link.id} href={link.href} locale="en" onClick={() => onNavigate?.(link)}>
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
