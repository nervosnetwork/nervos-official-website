type StartupHost = Pick<Window, 'requestAnimationFrame' | 'cancelAnimationFrame' | 'setTimeout' | 'clearTimeout'> &
  Partial<Pick<Window, 'requestIdleCallback' | 'cancelIdleCallback'>>

/** Leave a paint opportunity before automatic startup. Explicit input can start immediately. */
export function scheduleGameStartup(initialize: () => void, host: StartupHost = window) {
  let started = false
  let cancelled = false
  let frame: number | undefined
  let idle: number | undefined
  let timer: number | undefined

  const clearScheduled = () => {
    if (frame !== undefined) host.cancelAnimationFrame(frame)
    if (idle !== undefined) host.cancelIdleCallback?.(idle)
    if (timer !== undefined) host.clearTimeout(timer)
    frame = idle = timer = undefined
  }
  const start = () => {
    if (started || cancelled) return
    started = true
    clearScheduled()
    initialize()
  }

  frame = host.requestAnimationFrame(() => {
    if (cancelled || started) return
    frame = host.requestAnimationFrame(() => {
      frame = undefined
      if (cancelled || started) return
      if (host.requestIdleCallback) {
        idle = host.requestIdleCallback(start, { timeout: 1000 })
      } else {
        // Safari and other browsers without requestIdleCallback still yield to painting.
        timer = host.setTimeout(start, 32)
      }
    })
  })

  return {
    start,
    get started() {
      return started
    },
    cancel() {
      cancelled = true
      clearScheduled()
    },
  }
}
