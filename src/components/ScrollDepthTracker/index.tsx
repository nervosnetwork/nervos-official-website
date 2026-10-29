import { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { trackKBEvent } from '../KnowledgeHub/analytics'

const SCROLL_MILESTONES = [25, 50, 75, 90, 100]

function getScrollDepth() {
  const element = document.documentElement
  const body = document.body
  const scrollTop = window.scrollY || element.scrollTop || body.scrollTop || 0
  const viewportHeight = window.innerHeight || element.clientHeight
  const scrollHeight = Math.max(
    element.scrollHeight,
    body.scrollHeight,
    element.offsetHeight,
    body.offsetHeight,
    element.clientHeight,
    body.clientHeight,
  )

  if (scrollHeight <= viewportHeight) {
    return 100
  }

  return Math.min(100, Math.floor(((scrollTop + viewportHeight) / scrollHeight) * 100))
}

export function ScrollDepthTracker() {
  const router = useRouter()
  const trackedMilestones = useRef(new Set<number>())
  const animationFrame = useRef<number | null>(null)
  const routeKey = router.asPath.split('#')[0]

  useEffect(() => {
    trackedMilestones.current = new Set()

    const sendScrollDepthEvents = () => {
      animationFrame.current = null

      const scrollDepth = getScrollDepth()
      SCROLL_MILESTONES.forEach(milestone => {
        if (scrollDepth >= milestone && !trackedMilestones.current.has(milestone)) {
          trackedMilestones.current.add(milestone)
          trackKBEvent('scroll_depth', {
            percent_scrolled: milestone,
          })
        }
      })
    }

    const scheduleScrollDepthCheck = () => {
      if (animationFrame.current !== null) {
        return
      }

      animationFrame.current = window.requestAnimationFrame(sendScrollDepthEvents)
    }

    scheduleScrollDepthCheck()
    window.addEventListener('scroll', scheduleScrollDepthCheck, { passive: true })
    window.addEventListener('resize', scheduleScrollDepthCheck)

    return () => {
      if (animationFrame.current !== null) {
        window.cancelAnimationFrame(animationFrame.current)
        animationFrame.current = null
      }

      window.removeEventListener('scroll', scheduleScrollDepthCheck)
      window.removeEventListener('resize', scheduleScrollDepthCheck)
    }
  }, [routeKey])

  return null
}
