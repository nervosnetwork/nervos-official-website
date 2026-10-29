import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')

function eventTarget() {
  const listeners = new Map()
  const registrations = []
  return {
    registrations,
    addEventListener: (name, handler, options) => {
      if (!listeners.has(name)) listeners.set(name, new Set())
      listeners.get(name).add(handler)
      registrations.push({ name, handler, options })
    },
    removeEventListener: (name, handler) => listeners.get(name)?.delete(handler),
    dispatch: (name, event = {}) => [...(listeners.get(name) || [])].forEach(handler => handler(event)),
    count: name => listeners.get(name)?.size || 0,
  }
}

function hooks() {
  const refs = []
  const effects = []
  let refIndex = 0
  let effectIndex = 0
  const pending = []
  return {
    react: {
      useRef: initial => {
        const index = refIndex++
        if (!(index in refs)) refs[index] = { current: initial }
        return refs[index]
      },
      useEffect: (callback, dependencies) => {
        const index = effectIndex++
        const previous = effects[index]
        if (!previous || dependencies.some((value, offset) => !Object.is(value, previous.dependencies[offset]))) {
          pending.push(() => {
            previous?.cleanup?.()
            effects[index] = { callback, dependencies, cleanup: callback() }
          })
        }
      },
    },
    render: component => {
      refIndex = 0
      effectIndex = 0
      assert.equal(component(), null, 'Analytics trackers must render no UI')
      pending.splice(0).forEach(run => run())
    },
    replay: () => {
      effects.forEach(effect => effect.cleanup?.())
      effects.forEach(effect => (effect.cleanup = effect.callback()))
    },
    unmount: () => effects.forEach(effect => effect.cleanup?.()),
  }
}

function tracker(name, { scrollY = 0 } = {}) {
  const lifecycle = hooks()
  const events = []
  const frames = new Map()
  const cancelledFrames = []
  let frameId = 0
  const router = { asPath: '/knowledge-base/existing_article' }
  const document = {
    ...eventTarget(),
    documentElement: { scrollHeight: 1000, offsetHeight: 1000, clientHeight: 100, scrollTop: 0 },
    body: { scrollHeight: 1000, offsetHeight: 1000, clientHeight: 100, scrollTop: 0 },
  }
  const window = {
    ...eventTarget(),
    location: { href: 'https://www.nervos.org/knowledge-base', origin: 'https://www.nervos.org' },
    innerHeight: 100,
    scrollY,
    requestAnimationFrame: callback => {
      const id = ++frameId
      frames.set(id, callback)
      return id
    },
    cancelAnimationFrame: id => {
      cancelledFrames.push(id)
      frames.delete(id)
    },
  }
  class Element {
    constructor(anchor) {
      this.anchor = anchor
    }
    closest(selector) {
      assert.equal(selector, 'a[href]')
      return this.anchor
    }
  }
  const imports = {
    react: lifecycle.react,
    'next/router': { useRouter: () => router },
    '../KnowledgeHub/analytics': {
      trackKBEvent: (eventName, data) => events.push({ name: eventName, data: structuredClone(data) }),
    },
  }
  const source = fs.readFileSync(new URL(`../${name}/index.tsx`, import.meta.url), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    window,
    document,
    Element,
    URL,
    require: dependency => {
      assert.ok(Object.hasOwn(imports, dependency), `Unexpected tracker dependency: ${dependency}`)
      return imports[dependency]
    },
  })
  return {
    ...lifecycle,
    window,
    document,
    router,
    events,
    frames,
    cancelledFrames,
    mount: () => lifecycle.render(exports[name]),
    click: href => document.dispatch('click', { target: new Element({ href }) }),
    nonAnchorClick: () => document.dispatch('click', { target: new Element(null) }),
    flushFrames: () => {
      const queued = [...frames.values()]
      frames.clear()
      queued.forEach(callback => callback())
    },
  }
}

test('link tracker registers one listener, resolves child clicks, and cleans up without rendering UI', () => {
  const page = tracker('LinkClickTracker')
  page.mount()
  page.mount()
  assert.equal(page.document.count('click'), 1)
  page.click('/knowledge-base/article')
  assert.deepEqual(page.events, [
    {
      name: 'link_click',
      data: {
        destination_category: 'internal',
        link_url: 'https://www.nervos.org/knowledge-base/article',
        outbound: false,
      },
    },
  ])
  page.unmount()
  assert.equal(page.document.count('click'), 0)
  page.click('https://docs.nervos.org/')
  assert.equal(page.events.length, 1)
})

test('HTTP(S) links preserve destination categories and classify outbound by origin', () => {
  const page = tracker('LinkClickTracker')
  page.mount()
  const cases = [
    ['https://www.nervos.org/knowledge-base', 'internal', false],
    ['https://docs.nervos.org/', 'documentation', true],
    ['https://github.com/nervosnetwork/ckb', 'source_repository', true],
    ['https://github.com/nervosnetwork/ckb/discussions', 'community', true],
    ['https://discord.gg/nervos', 'community', true],
    ['https://t.me/nervos', 'community', true],
    ['https://talk.nervos.org/', 'community', true],
    ['http://www.nervos.org/knowledge-base', 'other', true],
    ['https://example.test/resource', 'other', true],
  ]
  for (const [url] of cases) page.click(url)
  assert.deepEqual(
    page.events.map(event => [event.data.link_url, event.data.destination_category, event.data.outbound]),
    cases,
  )
})

test('invalid hrefs, non-HTTP links, non-elements and non-anchor clicks are ignored', () => {
  const page = tracker('LinkClickTracker')
  page.mount()
  for (const href of [
    'http://[',
    'mailto:private@example.test',
    'tel:123456789',
    'javascript:void(0)',
    'data:text/plain,x',
  ]) {
    assert.doesNotThrow(() => page.click(href))
  }
  page.document.dispatch('click', { target: null })
  page.document.dispatch('click', { target: {} })
  page.nonAnchorClick()
  assert.deepEqual(page.events, [])
})

test('scroll and resize events batch into a single RAF and emit every reached milestone only once', () => {
  const page = tracker('ScrollDepthTracker')
  page.mount()
  assert.equal(page.window.count('scroll'), 1)
  assert.equal(page.window.count('resize'), 1)
  assert.equal(page.window.registrations.find(item => item.name === 'scroll').options.passive, true)
  page.flushFrames()
  assert.deepEqual(page.events, [])
  for (const scrollY of [150, 400, 650, 800, 900]) {
    page.window.scrollY = scrollY
    page.window.dispatch('scroll')
    page.window.dispatch('scroll')
    page.window.dispatch('resize')
    assert.equal(page.frames.size, 1)
    page.flushFrames()
    page.window.dispatch('scroll')
    page.flushFrames()
  }
  assert.deepEqual(
    page.events,
    [25, 50, 75, 90, 100].map(percent_scrolled => ({ name: 'scroll_depth', data: { percent_scrolled } })),
  )
})

test('StrictMode cleanup cancels a pending RAF and replay can schedule and send normally', () => {
  const page = tracker('ScrollDepthTracker', { scrollY: 900 })
  page.mount()
  const firstFrame = [...page.frames.keys()][0]
  page.replay()
  assert.deepEqual(page.cancelledFrames, [firstFrame])
  assert.equal(page.frames.size, 1)
  assert.equal(page.frames.has(firstFrame), false)
  assert.equal(page.window.count('scroll'), 1)
  assert.equal(page.window.count('resize'), 1)
  page.flushFrames()
  assert.deepEqual(
    page.events.map(event => event.data.percent_scrolled),
    [25, 50, 75, 90, 100],
  )
  page.window.dispatch('scroll')
  assert.equal(page.frames.size, 1)
  page.unmount()
  assert.equal(page.frames.size, 0)
  assert.equal(page.window.count('scroll'), 0)
  assert.equal(page.window.count('resize'), 0)
  page.window.dispatch('scroll')
  page.flushFrames()
  assert.equal(page.events.length, 5)
})

test('hash-only navigation preserves scroll milestones while a new route or query resets them', () => {
  const page = tracker('ScrollDepthTracker', { scrollY: 400 })
  page.mount()
  page.flushFrames()
  assert.deepEqual(
    page.events.map(event => event.data.percent_scrolled),
    [25, 50],
  )
  const registrations = page.window.registrations.length
  page.router.asPath += '#section-2'
  page.mount()
  assert.equal(page.window.registrations.length, registrations)
  assert.equal(page.frames.size, 0)
  page.window.dispatch('scroll')
  page.flushFrames()
  assert.equal(page.events.length, 2)
  page.router.asPath = '/knowledge-base/another_article'
  page.mount()
  page.flushFrames()
  assert.deepEqual(
    page.events.map(event => event.data.percent_scrolled),
    [25, 50, 25, 50],
  )
  page.router.asPath = '/knowledge-base/another_article?view=read'
  page.mount()
  page.flushFrames()
  assert.deepEqual(
    page.events.map(event => event.data.percent_scrolled),
    [25, 50, 25, 50, 25, 50],
  )
})

test('navigation before a scheduled RAF runs cancels the old page and still tracks the next page', () => {
  const page = tracker('ScrollDepthTracker', { scrollY: 400 })
  page.mount()
  const oldFrame = [...page.frames.keys()][0]
  page.router.asPath = '/knowledge-base/next_article'
  page.mount()
  assert.deepEqual(page.cancelledFrames, [oldFrame])
  assert.equal(page.frames.size, 1)
  page.flushFrames()
  assert.deepEqual(
    page.events.map(event => event.data.percent_scrolled),
    [25, 50],
  )
})
