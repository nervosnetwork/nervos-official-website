import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const { initTRPC } = require('@trpc/server')

function load(relativePath, imports, globals = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
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

const validation = load('../../../utils/newsletter.ts', { zod: require('zod') })

function router({ status = 202, fetchError, config = true, timeout = false } = {}) {
  const calls = []
  let abort
  let cleared = false
  const t = initTRPC.create()
  const { newsLetterRouter } = load(
    './newsletter.ts',
    {
      '../trpc': { createTRPCRouter: t.router, publicProcedure: t.procedure },
      '../../../env.mjs': { env: config ? { SENDGRID_API_TOKEN: 'test-token', SENDGRID_LIST_ID: 'test-list' } : {} },
      '../../../utils/newsletter': validation,
    },
    {
      AbortController,
      setTimeout: (callback, delay) => {
        assert.equal(delay, 10_000)
        abort = callback
        return 1
      },
      clearTimeout: () => {
        cleared = true
      },
      fetch: async (url, options) => {
        calls.push({ url, ...options, data: JSON.parse(options.body) })
        if (timeout) {
          abort()
          throw new Error('Aborted test request')
        }
        if (fetchError) throw new Error('Test network failure')
        return { status }
      },
    },
  )
  return { caller: newsLetterRouter.createCaller({}), calls, cleared: () => cleared }
}

test('email-only signup uses the existing SendGrid list and omits first_name', async () => {
  const { caller, calls, cleared } = router()
  const result = await caller.signup({ email: ' reader@example.test ' })
  assert.equal(result.success, true)
  assert.equal(result.status, 'accepted')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, 'https://api.sendgrid.com/v3/marketing/contacts')
  assert.equal(calls[0].method, 'PUT')
  assert.deepEqual(calls[0].data, { list_ids: ['test-list'], contacts: [{ email: 'reader@example.test' }] })
  assert.equal(cleared(), true)
})

test('existing named signup remains compatible and blank names cannot erase an existing name', async () => {
  const { caller, calls } = router()
  await caller.signup({ email: 'reader@example.test', firstName: ' Reader ' })
  await caller.signup({ email: 'reader@example.test', firstName: '  ' })
  assert.deepEqual(calls[0].data.contacts, [{ email: 'reader@example.test', first_name: 'Reader' }])
  assert.deepEqual(calls[1].data.contacts, [{ email: 'reader@example.test' }])
})

test('invalid email and oversized names are rejected before contacting SendGrid', async () => {
  const { caller, calls } = router()
  for (const input of [
    { email: '' },
    { email: 'not-an-email' },
    { email: `${'a'.repeat(250)}@example.test` },
    { email: 'reader@example.test', firstName: 'a'.repeat(51) },
  ]) {
    await assert.rejects(caller.signup(input), error => error.code === 'BAD_REQUEST')
  }
  assert.equal(calls.length, 0)
})

test('only SendGrid 202 is accepted; provider/network/timeout failures return generic errors', async () => {
  for (const [options, expectedStatus] of [
    [{ status: 400 }, 400],
    [{ status: 200 }, 200],
    [{ fetchError: true }, 502],
    [{ timeout: true }, 504],
  ]) {
    const { caller, cleared } = router(options)
    const result = await caller.signup({ email: 'reader@example.test' })
    assert.equal(result.success, false)
    assert.equal(result.error.status, expectedStatus)
    assert.doesNotMatch(JSON.stringify(result), /reader@|test-token|Test network/)
    assert.equal(cleared(), true)
  }
})

test('missing server configuration fails safely without a network request', async () => {
  const { caller, calls } = router({ config: false })
  const result = await caller.signup({ email: 'reader@example.test' })
  assert.equal(result.success, false)
  assert.equal(result.error.status, 503)
  assert.equal(calls.length, 0)
})
