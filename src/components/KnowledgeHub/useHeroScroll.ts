import { useEffect, useRef, useState } from 'react'
import { getHeroFade } from './start-here-scroll'

export function useHeroScroll() {
  const breadcrumbRef = useRef<HTMLDivElement>(null)
  const [heroFade, setHeroFade] = useState(0)
  const [breadcrumbHeight, setBreadcrumbHeight] = useState(55)

  useEffect(() => {
    let frame = 0
    const update = () => setHeroFade(getHeroFade(window.scrollY))
    const onScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(update)
    }
    const observer = new ResizeObserver(() => {
      if (breadcrumbRef.current) setBreadcrumbHeight(breadcrumbRef.current.getBoundingClientRect().height)
    })
    if (breadcrumbRef.current) observer.observe(breadcrumbRef.current)
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [])

  return { heroFade, breadcrumbHeight, breadcrumbRef }
}
