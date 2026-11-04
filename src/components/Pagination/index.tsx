import type { FC } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Image from 'next/image'
import clsx from 'clsx'
import styles from './index.module.scss'

const INDICATOR_COUNT = 5
const SIBLING_COUNT = Math.ceil((INDICATOR_COUNT - 1) / 2)

const Pagination: FC<{
  pageCount: number
  currentPage?: number
  className?: string
  hrefForPage?: (page: number) => string
  onPageChange?: (page: number) => void
}> = ({ pageCount, currentPage, className, hrefForPage, onPageChange }) => {
  const { query, pathname } = useRouter()

  const page = currentPage ?? Number(query.page ?? '1')
  const prev = `${page - 1}`
  const next = `${page + 1}`
  const getHref = (p: number) =>
    hrefForPage ? hrefForPage(p) : `${pathname}?${new URLSearchParams({ ...query, page: String(p) }).toString()}`

  const indicators = Array.from({ length: INDICATOR_COUNT })
    .map((_, idx) => {
      if (page <= SIBLING_COUNT) return idx + 1
      if (page >= pageCount - SIBLING_COUNT) return pageCount - INDICATOR_COUNT + idx + 1
      return page - SIBLING_COUNT + idx
    })
    .filter(i => i > 0 && i <= pageCount)

  if (pageCount < 1) return null

  return (
    <nav className={clsx(styles.container, className)} aria-label="Pagination">
      {+prev > 0 ? (
        <Link
          href={getHref(+prev)}
          className={styles.prev}
          aria-label="Previous page"
          onClick={() => onPageChange?.(+prev)}
        >
          <Image src="/images/left.svg" alt="" width={10} height={16} unoptimized />
        </Link>
      ) : (
        <span className={styles.prev} aria-label="Previous page" aria-disabled="true" data-disabled="true">
          <Image src="/images/left.svg" alt="" width={10} height={16} unoptimized />
        </span>
      )}
      {indicators.map(i =>
        page === i ? (
          <span key={i} className={styles.indicator} aria-label={`Page ${i}`} aria-current="page" data-active="true">
            {i}
          </span>
        ) : (
          <Link
            key={i}
            href={getHref(i)}
            className={styles.indicator}
            aria-label={`Go to page ${i}`}
            onClick={() => onPageChange?.(i)}
          >
            {i}
          </Link>
        ),
      )}
      {+next <= pageCount ? (
        <Link
          href={getHref(+next)}
          className={styles.next}
          aria-label="Next page"
          onClick={() => onPageChange?.(+next)}
        >
          <Image src="/images/left.svg" alt="" width={10} height={16} unoptimized />
        </Link>
      ) : (
        <span className={styles.next} aria-label="Next page" aria-disabled="true" data-disabled="true">
          <Image src="/images/left.svg" alt="" width={10} height={16} unoptimized />
        </span>
      )}
    </nav>
  )
}
export default Pagination
