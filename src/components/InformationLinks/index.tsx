import Link from 'next/link'
import { informationPages } from '../../../config/information-pages.mjs'
import styles from './index.module.scss'

const links = [
  { id: 'about', label: 'About us', href: informationPages.about.path },
  { id: 'privacy', label: 'Privacy policy', href: informationPages.privacy.path },
  { id: 'contact', label: 'Contact us', href: informationPages.contact.path },
]

export function InformationLinks({ onNavigate }: { onNavigate?: (link: (typeof links)[number]) => void }) {
  return (
    <nav className={styles.links} aria-label="Site information">
      {links.map(link => (
        <Link key={link.id} href={link.href} locale="en" onClick={() => onNavigate?.(link)}>
          {link.label}
        </Link>
      ))}
    </nav>
  )
}
