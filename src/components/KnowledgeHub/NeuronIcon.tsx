import { useEffect, useId, useState } from 'react'
import type { CSSProperties } from 'react'
import styles from './neuron-icon.module.scss'

const artwork = '/images/knowledge-hub/hero-imgLayer12.svg'
// Centerlines traced from the upper branch; the other branches rotate by 45°.
const routes = [
  { path: 'M34.929 29.265 L34.929 2.253', x: 34.929, y: 2.253 },
  { path: 'M34.929 29.265 L34.929 14.3 L28.44 7.812', x: 28.44, y: 7.812 },
  { path: 'M34.929 29.265 L34.929 24.707 L41.518 17.954', x: 41.518, y: 17.954 },
]
type Signal = { id: number; branch: number; route: number; duration: number }

export function NeuronIcon() {
  const id = useId().replace(/:/g, '')
  const [signals, setSignals] = useState<Signal[]>([])

  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let timer: ReturnType<typeof setTimeout>
    let sequence = 0
    let previousBranch = -1
    const emit = () => {
      if (!motion.matches && !document.hidden) {
        const branch = (previousBranch + 1 + Math.floor(Math.random() * 7)) % 8
        previousBranch = branch
        const signal = {
          id: sequence++,
          branch,
          route: Math.floor(Math.random() * routes.length),
          duration: 1.3 + Math.random() * 0.6,
        }
        setSignals(current => [...current.slice(-2), signal])
      }
      timer = setTimeout(emit, 650 + Math.random() * 950)
    }
    const reset = () => setSignals([])
    motion.addEventListener('change', reset)
    timer = setTimeout(emit, 250)
    return () => {
      clearTimeout(timer)
      motion.removeEventListener('change', reset)
    }
  }, [])

  return (
    <svg className={styles.icon} viewBox="0 0 69.8528 69.8517" aria-hidden="true" focusable="false">
      <defs>
        <mask
          id={`${id}-network`}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="70"
          height="70"
          style={{ maskType: 'alpha' }}
        >
          <image href={artwork} width="69.8528" height="69.8517" />
        </mask>
      </defs>
      <image href={artwork} width="69.8528" height="69.8517" />
      <g mask={`url(#${id}-network)`}>
        {signals.map(signal => {
          const route = routes[signal.route] ?? routes[0]!
          return (
            <g
              key={signal.id}
              transform={`rotate(${signal.branch * 45} 34.929 34.927)`}
              style={{ '--duration': `${signal.duration}s` } as CSSProperties}
            >
              <path className={styles.pulse} d={route.path} pathLength="100" />
              <circle
                className={styles.node}
                cx={route.x}
                cy={route.y}
                r="2.25"
                onAnimationEnd={() => setSignals(current => current.filter(item => item.id !== signal.id))}
              />
            </g>
          )
        })}
      </g>
    </svg>
  )
}
