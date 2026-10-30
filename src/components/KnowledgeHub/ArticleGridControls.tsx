import { useEffect, useRef, type CSSProperties } from 'react'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { Icon } from './Icon'
import styles from './pages-v2.module.scss'
import { trackKBEvent } from './analytics'

// Observe the menu's actual open state so pointer and keyboard activation are
// counted alike, without counting close actions or component renders.
function FilterOpenTracker({
  open,
  placement,
  pageType,
  hubId,
}: {
  open: boolean
  placement: string
  pageType?: 'all_articles' | 'search' | 'hub'
  hubId?: string
}) {
  const wasOpen = useRef(false)
  useEffect(() => {
    if (open && !wasOpen.current) trackKBEvent('kb_filter_open', { placement, page_type: pageType, hub_id: hubId })
    wasOpen.current = open
  }, [open, placement, pageType, hubId])
  return null
}

export function ArticleGridControls({
  density,
  onDensityChange,
  placement = 'article_grid',
  pageType,
  hubId,
}: {
  density: number
  onDensityChange: (value: number) => void
  placement?: string
  pageType?: 'all_articles' | 'search' | 'hub'
  hubId?: string
}) {
  const hubLayout = pageType === 'hub'
  const minColumns = hubLayout ? 2 : 3
  const maxColumns = hubLayout ? 3 : 5
  const defaultColumns = hubLayout ? 3 : 4
  const changeDensity = (value: number) => {
    if (value !== density) trackKBEvent('kb_layout_change', { placement, layout: 'grid', columns: value })
    onDensityChange(value)
  }
  return (
    <div className={styles.controls} aria-label="Article layout">
      <button
        className={styles.gridReset}
        aria-label={`Reset to ${hubLayout ? 'three' : 'four'} cards per row`}
        onClick={() => changeDensity(defaultColumns)}
      >
        <span className={styles.gridIcon} aria-hidden="true" />
      </button>
      <input
        aria-label="Cards per row"
        type="range"
        min={minColumns}
        max={maxColumns}
        value={density}
        style={{ '--rangeProgress': `${((density - minColumns) / (maxColumns - minColumns)) * 100}%` } as CSSProperties}
        onChange={event => changeDensity(Number(event.target.value))}
      />
      <Menu as="div" className={styles.filterMenu}>
        {({ open }) => (
          <>
            <FilterOpenTracker open={open} placement={placement} pageType={pageType} hubId={hubId} />
            <MenuButton className={styles.filterButton}>
              <Icon name="topicBody-imgInterfaceSlider03" size={24} />
              Sort
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
