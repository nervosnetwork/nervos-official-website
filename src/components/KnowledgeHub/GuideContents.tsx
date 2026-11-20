import clsx from 'clsx'
import { useEffect, useRef, type MouseEvent } from 'react'
import { guideSteps } from './guide-data'
import { useActiveSection } from './Shared'
import { trackKBEvent } from './analytics'
import articleStyles from './article-v2.module.scss'
import styles from './start-here.module.scss'

export const guideContents = guideSteps.map((step, index) => ({
  id: `${step.id}-title`,
  label: step.title,
  step: index + 1,
  children: [
    ...step.points.map((point, pointIndex) => ({
      id: `${step.id}-point-${pointIndex + 1}`,
      label: point.slice(0, point.indexOf(':')),
    })),
    ...(step.actions ?? []).map((action, actionIndex) => ({
      id: `${step.id}-point-${actionIndex + 1}`,
      label: action.title,
    })),
  ],
}))

export function GuideContents() {
  const active = useActiveSection(
    guideContents.flatMap(group => [group.id, ...group.children.map(child => child.id)]),
    true,
    true,
  )
  const navRef = useRef<HTMLElement>(null)
  const markerRef = useRef<HTMLLIElement>(null)
  const activeGroup = guideContents.find(
    group => group.id === active || group.children.some(child => child.id === active),
  )

  useEffect(() => {
    const nav = navRef.current
    const marker = markerRef.current
    const list = nav?.querySelector('ol')
    if (!nav || !marker || !list) return
    if (!active) {
      marker.removeAttribute('data-visible')
      return
    }
    // Match the article TOC's moving marker, including its scrollport clearance.
    const revealActive = () => {
      const link = nav.querySelector<HTMLElement>('[aria-current="location"]')
      if (!link || !nav.clientHeight) return
      const previousTop = marker.getBoundingClientRect().top
      const bounds = nav.getBoundingClientRect()
      const item = link.getBoundingClientRect()
      if (item.top < bounds.top + 8) nav.scrollTop += item.top - bounds.top - 8
      else if (item.bottom > bounds.bottom - 8) nav.scrollTop += item.bottom - bounds.bottom + 8
      const trackTop = list.getBoundingClientRect().top
      const target = link.getBoundingClientRect().top - trackTop + 13
      const start = Math.max(bounds.top + 8, Math.min(previousTop, bounds.bottom - 13)) - trackTop
      const visible = marker.dataset.visible === 'true'
      marker.getAnimations().forEach(animation => animation.cancel())
      marker.style.transform = `translateY(${target}px)`
      marker.dataset.visible = 'true'
      if (visible && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && Math.abs(start - target) > 0.5)
        marker.animate([{ transform: `translateY(${start}px)` }, { transform: `translateY(${target}px)` }], {
          duration: 260,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        })
    }
    revealActive()
    const observer = new ResizeObserver(revealActive)
    observer.observe(nav)
    observer.observe(list)
    return () => observer.disconnect()
  }, [active])

  const navigate = (event: MouseEvent<HTMLAnchorElement>, id: string, step: number) => {
    trackKBEvent('kb_step_select', { step, step_name: guideContents[step - 1]?.label })
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    const heading = document.getElementById(id)
    if (!heading) return
    event.preventDefault()
    const disclosure = event.currentTarget.closest('details')
    if (disclosure) disclosure.open = false
    window.history.replaceState(window.history.state, '', `#${id}`)
    heading.scrollIntoView({
      block: 'start',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
    heading.focus({ preventScroll: true })
  }

  return (
    <>
      <nav className={clsx(articleStyles.stickyContents, styles.contents)} aria-label="Table of contents" ref={navRef}>
        <h2>Table of contents</h2>
        <ol className={articleStyles.toc}>
          <li className={articleStyles.tocMarker} ref={markerRef} aria-hidden="true" role="presentation" />
          {guideContents.map(group => {
            const expanded = activeGroup?.id === group.id
            const childrenId = `${group.id}-contents`
            return (
              <li key={group.id}>
                <a
                  href={`#${group.id}`}
                  aria-current={active === group.id ? 'location' : undefined}
                  aria-expanded={expanded}
                  aria-controls={childrenId}
                  onClick={event => navigate(event, group.id, group.step)}
                >
                  {group.label}
                </a>
                <div
                  id={childrenId}
                  className={articleStyles.tocChildren}
                  data-expanded={expanded}
                  aria-hidden={!expanded}
                >
                  <ol>
                    {group.children.map(child => (
                      <li key={child.id}>
                        <a
                          href={`#${child.id}`}
                          aria-current={active === child.id ? 'location' : undefined}
                          tabIndex={expanded ? undefined : -1}
                          onClick={event => navigate(event, child.id, group.step)}
                        >
                          {child.label}
                        </a>
                      </li>
                    ))}
                  </ol>
                </div>
              </li>
            )
          })}
        </ol>
      </nav>
      <nav className={styles.mobileContents} aria-label="Table of contents">
        <details>
          <summary>On this page</summary>
          <ul>
            {guideContents.map(group => (
              <li key={group.id}>
                <a
                  href={`#${group.id}`}
                  aria-current={activeGroup?.id === group.id ? 'location' : undefined}
                  onClick={event => navigate(event, group.id, group.step)}
                >
                  {group.label}
                </a>
              </li>
            ))}
          </ul>
        </details>
      </nav>
    </>
  )
}
