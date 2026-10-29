import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')

function load(file, imports, globals = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  })
  const exports = {}
  vm.runInNewContext(outputText, {
    exports,
    require: name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`)
      return imports[name]
    },
    ...globals,
  })
  return exports
}

const validation = load('../../utils/newsletter.ts', { zod: require('zod') })

function signup(placement, mutate = async () => ({ success: true, status: 'accepted' })) {
  const states = []
  const refs = []
  const calls = []
  const events = []
  let stateIndex = 0
  let refIndex = 0
  const { useNewsletterSignup: invokeSignup } = load(
    './useNewsletterSignup.ts',
    {
      react: {
        useState: initial => {
          const index = stateIndex++
          if (!(index in states)) states[index] = initial
          return [states[index], value => (states[index] = value)]
        },
        useRef: initial => {
          const index = refIndex++
          if (!(index in refs)) refs[index] = { current: initial }
          return refs[index]
        },
      },
      '../../utils/api': {
        api: {
          newsLetter: {
            signup: {
              useMutation: options => {
                assert.equal(options.retry, false, 'A failed mutation should not silently retry submissions')
                return {
                  mutateAsync: input => {
                    calls.push({ ...input })
                    return mutate(input)
                  },
                }
              },
            },
          },
        },
      },
      '../../utils/newsletter': validation,
      './analytics': { trackKBEvent: (name, data) => events.push({ name, data: { ...data } }) },
    },
    {
      FormData: class {
        constructor(form) {
          this.form = form
        }
        get(name) {
          assert.equal(name, 'email')
          return this.form.email
        }
      },
    },
  )
  return {
    calls,
    events,
    render: () => {
      stateIndex = 0
      refIndex = 0
      return invokeSignup(placement)
    },
  }
}

function submission(email = ' reader@example.test ') {
  let resets = 0
  let prevented = 0
  return {
    event: {
      preventDefault: () => prevented++,
      currentTarget: { email, reset: () => resets++ },
    },
    resets: () => resets,
    prevented: () => prevented,
  }
}

for (const placement of ['signal', 'footer']) {
  test(`${placement} uses the shared API and only emits accepted signup events without the email`, async () => {
    const form = signup(placement)
    const input = submission()
    await form.render().onSubmit(input.event)
    assert.deepEqual(form.calls, [{ email: 'reader@example.test' }])
    assert.equal(input.resets(), 1)
    assert.equal(input.prevented(), 1)
    assert.deepEqual(form.events, [
      { name: 'kb_newsletter_submit', data: { placement, status: 'accepted' } },
      { name: 'kb_newsletter_result', data: { placement, outcome: 'accepted' } },
    ])
    assert.equal(form.render().status, 'Thanks! Your signup request was received.')
    assert.equal(form.render().isSubmitting, false)
    assert.equal(form.render().isError, false)
    assert.doesNotMatch(JSON.stringify(form.events), /reader@|email|success|preview/)
  })
}

test('pending submissions are disabled and duplicate clicks before rerender cannot send a second request', async () => {
  let resolve
  const form = signup('signal', () => new Promise(done => (resolve = done)))
  const handler = form.render().onSubmit
  const first = submission()
  const pending = handler(first.event)
  await handler(submission().event)
  assert.equal(form.calls.length, 1)
  assert.equal(form.render().isSubmitting, true)
  assert.equal(form.render().status, 'Submitting…')
  assert.deepEqual(form.events, [], 'A pending request is not an accepted signup')
  resolve({ success: true, status: 'accepted' })
  await pending
  assert.equal(form.render().isSubmitting, false)
  assert.equal(form.events.length, 2)
})

test('invalid input produces feedback without sending a request or analytics event', async () => {
  const form = signup('footer')
  await form.render().onSubmit(submission('not-an-email').event)
  assert.equal(form.render().isInvalid, true)
  assert.equal(form.render().isError, true)
  assert.equal(form.calls.length, 0)
  assert.equal(form.events.length, 0)
})

test('API rejection and network failures keep the email, show a retryable error and never emit submit', async () => {
  for (const mutate of [
    async () => ({ success: false }),
    async () => {
      throw new Error('Test failure with private details')
    },
  ]) {
    const form = signup('footer', mutate)
    const input = submission()
    await form.render().onSubmit(input.event)
    assert.equal(form.render().isSubmitting, false)
    assert.equal(form.render().isError, true)
    assert.equal(form.render().isInvalid, false, 'A service failure does not mean the email is invalid')
    assert.equal(input.resets(), 0)
    assert.equal(form.render().status, 'Unable to submit. Please try again or contact media@nervos.org.')
    assert.deepEqual(form.events, [{ name: 'kb_newsletter_result', data: { placement: 'footer', outcome: 'error' } }])
    await form.render().onSubmit(input.event)
    assert.equal(form.calls.length, 2, 'The user can explicitly retry a failed submission')
    assert.ok(form.events.every(event => event.name !== 'kb_newsletter_submit'))
  }
})

test('a failed signup followed by a successful retry emits submit exactly once after acceptance', async () => {
  let attempts = 0
  const form = signup('signal', async () => ({ success: ++attempts > 1, status: 'accepted' }))
  const input = submission()
  await form.render().onSubmit(input.event)
  assert.equal(form.events.filter(event => event.name === 'kb_newsletter_submit').length, 0)
  await form.render().onSubmit(input.event)
  assert.equal(input.resets(), 1)
  assert.deepEqual(
    form.events.filter(event => event.name === 'kb_newsletter_submit'),
    [{ name: 'kb_newsletter_submit', data: { placement: 'signal', status: 'accepted' } }],
  )
})

test('newsletter status starts empty and wires the real shared signup with pending controls', () => {
  let submitted
  const state = {
    isSubmitting: false,
    status: '',
    isError: false,
    isInvalid: false,
    onSubmit: event => (submitted = event),
  }
  const { Newsletter } = load('./Home.tsx', {
    react: {},
    'react/jsx-runtime': require('react/jsx-runtime'),
    'next/link': {},
    '@headlessui/react': {},
    'next/head': {},
    'next/router': {},
    '../Page': {},
    './fixtures': {},
    './content': {},
    './home-v2.module.scss': { default: {} },
    './Icon': { Icon: () => null },
    './ArticleLanguageLink': { ArticleLanguageLink: 'a' },
    './Components': {},
    './KnowledgeFooter': {},
    './GuideLife': {},
    './NeuronIcon': {},
    './analytics': {},
    './search-analytics': {},
    './useNewsletterSignup': {
      useNewsletterSignup: placement => {
        assert.equal(placement, 'signal')
        return state
      },
    },
  })
  const nodes = node => {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(nodes)
    return [node, ...nodes(node.props?.children)]
  }
  let tree = nodes(Newsletter())
  assert.equal(
    tree.find(node => node.props?.id === 'signal-newsletter-note').props.children,
    'Monthly. Unsubscribe anytime.',
  )
  assert.equal(tree.find(node => node.props?.id === 'signal-newsletter-status').props.children, '')
  const input = tree.find(node => node.type === 'input')
  assert.equal(input.props.name, 'email')
  assert.equal(input.props.placeholder, 'Your email address')
  assert.equal(input.props['aria-describedby'], 'signal-newsletter-note signal-newsletter-status')
  assert.equal(input.props.required, true)
  assert.equal(input.props.disabled, false)
  assert.equal(tree.find(node => node.type === 'button').props['aria-label'], 'Get the briefing')
  assert.equal(tree.find(node => node.type === 'button').props.children[0], 'Get the briefing')
  const submission = {}
  tree.find(node => node.type === 'form').props.onSubmit(submission)
  assert.equal(submitted, submission)
  state.isSubmitting = true
  state.status = 'Submitting…'
  tree = nodes(Newsletter())
  assert.equal(tree.find(node => node.type === 'input').props.disabled, true)
  assert.equal(tree.find(node => node.type === 'button').props.disabled, true)
  assert.equal(tree.find(node => node.type === 'button').props['aria-label'], 'Submitting newsletter signup')
  assert.equal(tree.find(node => node.type === 'button').props.children[0], 'Get the briefing')
  assert.equal(tree.find(node => node.props?.id === 'signal-newsletter-status').props.children, 'Submitting…')
})
