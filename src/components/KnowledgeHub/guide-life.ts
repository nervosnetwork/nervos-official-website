export type LifeExclusionRect = {
  left: number
  top: number
  right: number
  bottom: number
}

export function cellIntersectsRects(
  x: number,
  y: number,
  size: number,
  rects: LifeExclusionRect[],
  padding = 0,
): boolean {
  return rects.some(
    rect =>
      x + size >= rect.left - padding &&
      x <= rect.right + padding &&
      y + size >= rect.top - padding &&
      y <= rect.bottom + padding,
  )
}

export function getDrawableCells(
  live: Set<string>,
  step: number,
  size: number,
  rects: LifeExclusionRect[],
  padding = 0,
): string[] {
  return Array.from(live).filter(cell => {
    const [x, y] = cell.split(',').map(Number) as [number, number]
    return !cellIntersectsRects(x * step, y * step, size, rects, padding)
  })
}

export function stepLife(live: Set<string>, columns: number, rows: number): Set<string> {
  const neighbors = new Map<string, number>()

  for (const cell of live) {
    const [x, y] = cell.split(',').map(Number) as [number, number]
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue
        const nextX = x + dx
        const nextY = y + dy
        if (nextX < 0 || nextX >= columns || nextY < 0 || nextY >= rows) continue
        const key = `${nextX},${nextY}`
        neighbors.set(key, (neighbors.get(key) ?? 0) + 1)
      }
    }
  }

  const next = new Set<string>()
  for (const [cell, count] of neighbors) {
    if (count === 3 || (count === 2 && live.has(cell))) next.add(cell)
  }
  return next
}
