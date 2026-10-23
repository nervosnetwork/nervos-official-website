// Bounds are relative to the viewport; recommendations are outside the reading range.
export function readingProgress(startTop: number, endBottom: number, viewportHeight: number, headerHeight: number) {
  const distance = endBottom - startTop - (viewportHeight - headerHeight)
  if (distance <= 0) return startTop <= headerHeight ? 100 : 0
  return Math.round(Math.max(0, Math.min(1, (headerHeight - startTop) / distance)) * 100)
}
