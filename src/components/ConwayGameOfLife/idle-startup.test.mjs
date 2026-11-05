import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function load(file, dependencies = {}, globals = {}) {
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    ...globals,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`)
      return dependencies[name]
    },
  })
  return exports
}

function hostFixture(withIdle = true) {
  const frames = new Map()
  const idles = new Map()
  const timers = new Map()
  let nextId = 0
  const host = {
    requestAnimationFrame: callback => (frames.set(++nextId, callback), nextId),
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: (callback, delay) => (timers.set(++nextId, { callback, delay }), nextId),
    clearTimeout: id => timers.delete(id),
    ...(withIdle
      ? {
          requestIdleCallback: (callback, options) => (idles.set(++nextId, { callback, options }), nextId),
          cancelIdleCallback: id => idles.delete(id),
        }
      : {}),
  }
  const flush = queue => {
    const callbacks = [...queue.values()]
    queue.clear()
    for (const item of callbacks) (item.callback ?? item)()
  }
  return { host, frames, idles, timers, flush }
}

const { scheduleGameStartup } = load('./idle-startup.ts')

test('automatic startup leaves a paint opportunity, then uses bounded idle work', () => {
  const h = hostFixture()
  let calls = 0
  const startup = scheduleGameStartup(() => calls++, h.host)
  assert.equal(calls, 0)
  h.flush(h.frames)
  assert.equal(h.idles.size, 0)
  h.flush(h.frames)
  assert.equal(h.idles.values().next().value.options.timeout, 1000)
  assert.equal(startup.started, false)
  h.flush(h.idles)
  assert.equal(startup.started, true)
  assert.equal(calls, 1)
  startup.start()
  assert.equal(calls, 1)
})

test('browsers without idle callbacks use the cancellable timer fallback after painting', () => {
  const h = hostFixture(false)
  let calls = 0
  scheduleGameStartup(() => calls++, h.host)
  h.flush(h.frames)
  h.flush(h.frames)
  assert.equal(h.timers.values().next().value.delay, 32)
  assert.equal(calls, 0)
  h.flush(h.timers)
  assert.equal(calls, 1)
})

for (const stage of ['first-frame', 'second-frame', 'idle', 'timer']) {
  test(`unmount cancels startup during ${stage}, including an already queued callback`, () => {
    const h = hostFixture(stage !== 'timer')
    let calls = 0
    const startup = scheduleGameStartup(() => calls++, h.host)
    if (stage !== 'first-frame') h.flush(h.frames)
    if (stage === 'idle' || stage === 'timer') h.flush(h.frames)
    const queued = [...h.frames.values(), ...h.idles.values(), ...h.timers.values()]
    startup.cancel()
    startup.start()
    for (const item of queued) (item.callback ?? item)()
    assert.equal(calls, 0)
    assert.equal(h.frames.size + h.idles.size + h.timers.size, 0)
  })
}

test('explicit input starts immediately and cannot be overwritten by delayed initialization', () => {
  const h = hostFixture()
  const actions = []
  let startup
  startup = scheduleGameStartup(() => {
    actions.push('seed')
    startup.start() // Initial seeding shares the ordinary mutation path.
  }, h.host)
  h.flush(h.frames)
  h.flush(h.frames)
  const queued = [...h.idles.values()][0].callback
  startup.start()
  actions.push('draw')
  queued()
  assert.deepEqual(actions, ['seed', 'draw'])
  assert.equal(h.idles.size, 0)
})

// Small deterministic hook harness: exercise the real component/controller and
// real state updater ordering without a browser timer or canvas dependency.
function gameFixture() {
  const h = hostFixture()
  const slots = []
  const effects = []
  let cursor = 0
  let tick
  let seeds = 0
  let steps = 0
  const React = {
    createElement: (tag, props) => ({ tag, props }),
    forwardRef: render => render,
    useRef(value) {
      const index = cursor++
      return (slots[index] ??= { current: value })
    },
    useState(value) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof value === 'function' ? value() : value
      return [
        slots[index],
        update => {
          slots[index] = typeof update === 'function' ? update(slots[index]) : update
        },
      ]
    },
    useMemo(fn, dependencies) {
      const index = cursor++
      const previous = slots[index]
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
        slots[index] = { value: fn(), dependencies }
      }
      return slots[index].value
    },
    useCallback(fn, dependencies) {
      return React.useMemo(() => fn, dependencies)
    },
    useEffect(fn, dependencies) {
      React.useMemo(() => effects.push({ fn }), dependencies)
    },
    useImperativeHandle(ref, factory) {
      ref.current = factory()
    },
  }
  const memoized = load('../../hooks/useMemoizedFn.ts', { react: React })
  const utils = load('./utils.ts')
  const { ConwayGameOfLife } = load('./index.tsx', {
    react: { ...React, default: React },
    rxjs: {
      BehaviorSubject: class {
        next() {
          return undefined
        }
      },
    },
    '../../utils/array': { sample: items => items[0] },
    '../../utils/number': { clampNumber: (value, min, max) => Math.min(max, Math.max(min, value)) },
    '../../utils': { mouseEventOffset: () => ({ x: 0, y: 0 }) },
    '../../hooks': {
      ...memoized,
      useIsMobile: () => false,
      useDevicePixelRatio: () => 1,
      useElementSize: () => undefined,
      useInterval: callback => (tick = callback),
    },
    './patterns': {
      patterns: [
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
      ],
    },
    './utils': {
      ...utils,
      patternToCellLifeStates: pattern => (seeds++, utils.patternToCellLifeStates(pattern)),
      stepGame: (...args) => (steps++, utils.stepGame(...args)),
    },
    './useGameKeybindings': {},
    './idle-startup': { scheduleGameStartup: initialize => scheduleGameStartup(initialize, h.host) },
    './index.module.scss': { default: { game: 'existing-canvas-class' } },
  })
  const ref = { current: null }
  const canvas = {
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 1000, bottom: 600 }),
    getContext: () => null,
  }
  const indicatorRef = {
    current: { getBoundingClientRect: () => ({ left: 300, top: 200, right: 700, bottom: 500 }) },
  }
  const render = () => {
    cursor = 0
    const element = ConwayGameOfLife({ initializationIndicatorRef: indicatorRef, defaultRunning: true }, ref)
    element.props.ref.current = canvas
    for (const effect of effects) {
      if (!effect.ran) {
        effect.ran = true
        effect.cleanup = effect.fn()
      }
    }
    return element
  }
  render()
  return { h, ref, render, effects, tick: () => tick(), counts: () => ({ seeds, steps }) }
}

test('component keeps the canvas markup and does not run simulation before idle startup', () => {
  const g = gameFixture()
  const element = g.render()
  assert.equal(element.tag, 'canvas')
  assert.equal(element.props.className, 'existing-canvas-class')
  g.tick()
  assert.deepEqual(g.counts(), { seeds: 0, steps: 0 })
  g.h.flush(g.h.frames)
  g.h.flush(g.h.frames)
  g.h.flush(g.h.idles)
  g.render()
  g.tick()
  assert.deepEqual(g.counts(), { seeds: 1, steps: 1 })
})

test('early drawing seeds once, then preserves the user cell and clear/pause controls', () => {
  const g = gameFixture()
  g.ref.current.setCellLiving(9, 9, true)
  g.render()
  assert.equal(g.ref.current.getCellLiving(9, 9), true)
  assert.equal(g.ref.current.getCellLiving(0, 1), true)
  g.h.flush(g.h.frames)
  g.h.flush(g.h.idles)
  assert.equal(g.counts().seeds, 1)
  g.ref.current.clear()
  g.ref.current.pause()
  g.render()
  g.tick()
  assert.equal(g.ref.current.getCellLiving(9, 9), false)
  assert.equal(g.ref.current.paused, true)
  assert.equal(g.counts().steps, 0)
})

test('the first mouse stroke keeps the same coordinate mapping before and after startup', () => {
  const g = gameFixture()
  const point = { clientX: 0, clientY: 0 }
  const before = g.ref.current.getCellIndexFromExternalMouseControlEvent(point)
  g.ref.current.setCellLiving(before.row, before.col, true)
  g.render()
  const after = g.ref.current.getCellIndexFromExternalMouseControlEvent(point)
  assert.deepEqual(after, before)
  assert.equal(g.ref.current.getCellLiving(after.row, after.col), true)
  // The fixture really has a non-zero automatic camera placement.
  const automatic = gameFixture()
  automatic.h.flush(automatic.h.frames)
  automatic.h.flush(automatic.h.frames)
  automatic.h.flush(automatic.h.idles)
  automatic.render()
  assert.notDeepEqual(automatic.ref.current.getCellIndexFromExternalMouseControlEvent(point), before)
})

test('Strict Mode cleanup/setup cancels the first startup rather than seeding twice', () => {
  const g = gameFixture()
  for (const effect of g.effects) effect.cleanup?.()
  for (const effect of g.effects) effect.cleanup = effect.fn()
  g.h.flush(g.h.frames)
  g.h.flush(g.h.frames)
  g.h.flush(g.h.idles)
  assert.equal(g.counts().seeds, 1)
  for (const effect of g.effects) effect.cleanup?.()
  assert.equal(g.h.frames.size + g.h.idles.size + g.h.timers.size, 0)
})
