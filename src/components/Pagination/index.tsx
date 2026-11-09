import type { FC } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Image from 'next/image'
import clsx from 'clsx'
import styles from './index.module.scss'

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

  const visiblePages = Array.from({ length: pageCount }, (_, index) => index + 1).filter(
    number =>
      number === 1 ||
      number === pageCount ||
      Math.abs(number - page) <= 1 ||
      (page === 1 && number <= 3) ||
      (page === pageCount && number > pageCount - 3),
  )
  const indicators: Array<number | string> = []
  for (const number of visiblePages) {
    const previous = indicators[indicators.length - 1]
    if (typeof previous === 'number' && number - previous > 1) {
      if (number - previous === 2) indicators.push(previous + 1)
      else indicators.push(`ellipsis-${previous}`)
    }
    indicators.push(number)
  }

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
      ) : null}
      {indicators.map(i =>
        typeof i === 'string' ? (
          <span key={i} aria-hidden="true" data-ellipsis="true">
            …
          </span>
        ) : page === i ? (
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
      ) : null}
    </nav>
  )
}
export default Pagination
