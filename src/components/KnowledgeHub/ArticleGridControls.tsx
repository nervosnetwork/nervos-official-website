import { useEffect, useRef, type CSSProperties } from 'react'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { Icon } from './Icon'
import styles from './pages-v2.module.scss'
import { trackKBEvent } from './analytics'

// Observe the menu's actual open state so pointer and keyboard activation are
// counted alike, without counting close actions or component renders.
function FilterOpenTracker({ open, placement }: { open: boolean; placement: string }) {
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) trackKBEvent('kb_filter_open', { placement })
    wasOpen.current = open
  }, [open, placement])
  return null
}

export function ArticleGridControls({
  density,
  onDensityChange,
  placement = 'article_grid',
}: {
  density: number
  onDensityChange: (value: number) => void
  placement?: string
}) {
  const changeDensity = (value: number) => {
    if (value !== density) trackKBEvent('kb_layout_change', { placement, layout: 'grid', columns: value })
    onDensityChange(value)
  }
  return (
    <div className={styles.controls} aria-label="Article layout">
      <button className={styles.gridReset} aria-label="Reset to four cards per row" onClick={() => changeDensity(4)}>
        <span className={styles.gridIcon} aria-hidden="true" />
      </button>
      <input
        aria-label="Cards per row"
        type="range"
        min="3"
        max="5"
        value={density}
        style={{ '--rangeProgress': `${((density - 3) / 2) * 100}%` } as CSSProperties}
        onChange={event => changeDensity(Number(event.target.value))}
      />
      <Menu as="div" className={styles.filterMenu}>
        {({ open }) => (
          <>
            <FilterOpenTracker open={open} placement={placement} />
            <MenuButton className={styles.filterButton}>
              <Icon name="topicBody-imgInterfaceSlider03" size={24} />
              Filter
            </MenuButton>
            <MenuItems className={styles.filterOptions}>
              <MenuItem>
                <button className={styles.filterOption} type="button">
                  Latest to oldest <Icon name="interface-check" size={16} />
                  <span className={styles.srOnly}> (selected)</span>
                </button>
              </MenuItem>
              <MenuItem disabled>
                <button className={styles.filterOption} type="button" disabled>
                  Most popular
                </button>
              </MenuItem>
              <MenuItem disabled>
                <button className={styles.filterOption} type="button" disabled>
                  Must reads
                </button>
              </MenuItem>
            </MenuItems>
          </>
        )}
      </Menu>
    </div>
  )
}
