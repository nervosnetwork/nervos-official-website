export function getHeroFade(scrollY: number, distance = 240) {
  if (distance <= 0) return scrollY > 0 ? 1 : 0
  return Math.min(1, Math.max(0, scrollY / distance))
}
