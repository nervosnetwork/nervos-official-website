import { useEffect, useRef } from 'react'
import { getDrawableCells, stepLife } from './guide-life'
import type { LifeExclusionRect } from './guide-life'

const CELL_STEP = 15
const CELL_SIZE = 10

export function GuideLife({
  className,
  exclusionSelector,
  exclusionPadding = 16,
  density = 0.24,
}: {
  className?: string
  exclusionSelector?: string
  exclusionPadding?: number
  density?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let columns = 0
    let rows = 0
    let generation = 0
    let visible = true
    let live = new Set<string>()

    const getExclusions = (): LifeExclusionRect[] => {
      if (!exclusionSelector || !canvas.parentElement) return []
      const canvasRect = canvas.getBoundingClientRect()
      return Array.from(canvas.parentElement.querySelectorAll<HTMLElement>(exclusionSelector)).map(element => {
        const rect = element.getBoundingClientRect()
        return {
          left: rect.left - canvasRect.left,
          top: rect.top - canvasRect.top,
          right: rect.right - canvasRect.left,
          bottom: rect.bottom - canvasRect.top,
        }
      })
    }

    const seed = () => {
      live = new Set<string>()
      for (let y = 0; y < rows; y += 1) {
        for (let x = 0; x < columns; x += 1) {
          if (Math.random() < density) live.add(`${x},${y}`)
        }
      }
      generation = 0
    }

    const draw = () => {
      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
      context.fillStyle = '#fff'
      const exclusions = getExclusions()
      const drawable = getDrawableCells(live, CELL_STEP, CELL_SIZE, exclusions, exclusionPadding)
      for (const cell of drawable) {
        const [x, y] = cell.split(',').map(Number) as [number, number]
        context.fillRect(x * CELL_STEP, y * CELL_STEP, CELL_SIZE, CELL_SIZE)
      }
      return drawable.length
    }

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect()
      if (!width || !height) return
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      columns = Math.floor(width / CELL_STEP)
      rows = Math.floor(height / CELL_STEP)
      seed()
      draw()
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? false
    })
    visibilityObserver.observe(canvas)
    resize()

    const timer = window.setInterval(() => {
      if (!visible || document.hidden || reducedMotion.matches || !columns || !rows) return
      live = stepLife(live, columns, rows)
      generation += 1
      const visibleCells = draw()
      if (visibleCells < 6 || generation >= 100) {
        seed()
        draw()
      }
    }, 280)

    return () => {
      window.clearInterval(timer)
      resizeObserver.disconnect()
      visibilityObserver.disconnect()
    }
  }, [density, exclusionPadding, exclusionSelector])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
