import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createGitHubStateStore, IndexNowStateError } from './indexnow-state.mjs'

const repository = 'example/site'
const branch = 'indexnow-state'
const prefix = `https://api.github.com/repos/${repository}`
const token = 'test-token-never-print'
const previous = '1'.repeat(40)
const previousTree = '2'.repeat(40)
const previousBlob = '3'.repeat(40)
const nextBlob = '4'.repeat(40)
const nextTree = '5'.repeat(40)
const nextVersion = '6'.repeat(40)
const ref = (sha = previous, name = branch) => ({
  ref: `refs/heads/${name}`,
  object: { type: 'commit', sha },
})

function sequence(steps, config = {}) {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    const step = steps[calls.length - 1]
    assert.ok(step, `Unexpected request ${options.method} ${url}`)
    assert.equal(url, `${config.apiOrigin || 'https://api.github.com'}/repos/${repository}${step.path}`)
    assert.equal(options.method, step.method || 'GET')
    assert.equal(options.redirect, 'error')
    assert.ok(options.signal instanceof AbortSignal)
    assert.equal(options.signal.aborted, false)
    assert.equal(options.headers.Accept, 'application/vnd.github+json')
    assert.equal(options.headers['X-GitHub-Api-Version'], '2022-11-28')
    assert.equal(options.headers.Authorization, config.anonymous ? undefined : `Bearer ${token}`)
    if (step.body !== undefined) assert.deepEqual(JSON.parse(options.body), step.body)
    if (step.inspect) step.inspect(options)
    if (step.error) throw step.error
    return new Response(step.raw === undefined ? JSON.stringify(step.value ?? {}) : step.raw, {
      status: step.status || ((step.method || 'GET') === 'POST' ? 201 : 200),
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const store = createGitHubStateStore({
    repository,
    token: config.anonymous ? undefined : token,
    fetchImpl,
    ...(config.apiOrigin ? { apiOrigin: config.apiOrigin } : {}),
    ...(config.branch ? { branch: config.branch } : {}),
  })
  return { store, calls, done: () => assert.equal(calls.length, steps.length) }
}

function missingSteps(name = branch) {
  return [
    { path: `/git/ref/heads/${name}`, status: 404 },
    { path: '', value: { full_name: repository } },
    { path: `/git/matching-refs/heads/${name}`, value: [] },
  ]
}

function readSteps(state = { baseline: null, journal: [] }, name = branch) {
  const content = Buffer.from(`${JSON.stringify(state)}\n`, 'utf8')
  return [
    { path: `/git/ref/heads/${name}`, value: ref(previous, name) },
    { path: `/git/commits/${previous}`, value: { sha: previous, tree: { sha: previousTree } } },
    {
      path: `/git/trees/${previousTree}`,
      value: {
        sha: previousTree,
        truncated: false,
        tree: [{ path: 'state.json', mode: '100644', type: 'blob', sha: previousBlob }],
      },
    },
    {
      path: `/git/blobs/${previousBlob}`,
      value: { sha: previousBlob, encoding: 'base64', size: content.length, content: content.toString('base64') },
    },
  ]
}

function writeSteps(state, expectedVersion = previous, name = branch) {
  return [
    {
      path: '/git/blobs',
      method: 'POST',
      value: { sha: nextBlob },
      body: { encoding: 'base64', content: Buffer.from(`${JSON.stringify(state, null, 2)}\n`).toString('base64') },
    },
    {
      path: '/git/trees',
      method: 'POST',
      value: { sha: nextTree },
      body: { tree: [{ path: 'state.json', mode: '100644', type: 'blob', sha: nextBlob }] },
    },
    {
      path: '/git/commits',
      method: 'POST',
      value: { sha: nextVersion },
      body: {
        message: 'Record IndexNow notification state',
        tree: nextTree,
        parents: expectedVersion ? [expectedVersion] : [],
      },
    },
    expectedVersion
      ? {
          path: `/git/refs/heads/${name}`,
          method: 'PATCH',
          value: ref(nextVersion, name),
          body: { sha: nextVersion, force: false },
        }
      : {
          path: '/git/refs',
          method: 'POST',
          value: ref(nextVersion, name),
          body: { ref: `refs/heads/${name}`, sha: nextVersion },
        },
  ]
}

test('missing branch is empty only after repository access and exact-ref absence are verified', async () => {
  const { store, calls, done } = sequence(missingSteps())
  assert.deepEqual(await store.read(), { version: null, state: null })
  assert.ok(
    calls.every(({ options }) => options.method === 'GET'),
    'Read must never initialize a branch',
  )
  done()
})

test('an existing state is read from an immutable commit/tree/blob chain, without mutations', async () => {
  const state = {
    baseline: { urls: ['https://www.nervos.org/knowledge-base/中文'] },
    receipts: [{ status: 'accepted' }],
  }
  const { store, calls, done } = sequence(readSteps(state))
  assert.deepEqual(await store.read(), { version: previous, state })
  assert.ok(calls.every(({ options }) => options.method === 'GET'))
  done()
})

test('public state reads may be anonymous; writes always require an explicit token', async () => {
  const { store, calls, done } = sequence(readSteps(), { anonymous: true })
  assert.equal((await store.read()).version, previous)
  const count = calls.length
  await assert.rejects(store.write({ expectedVersion: previous, state: {} }), /token is required/)
  assert.equal(calls.length, count)
  done()
})

test('initialization creates an orphan state-only branch, not a commit on main', async () => {
  const state = { baseline: null, journal: [{ status: 'planned' }] }
  const { store, calls, done } = sequence([...missingSteps(), ...writeSteps(state, null)])
  assert.equal(await store.write({ expectedVersion: null, state }), nextVersion)
  for (const { url, options } of calls) {
    assert.doesNotMatch(url, /\/heads\/(?:main|master)(?:$|\/)/)
    if (options.body) assert.doesNotMatch(options.body, /refs\/heads\/(?:main|master)/)
  }
  done()
})

test('subsequent writes retain commit history and update the dedicated ref without force', async () => {
  const state = { baseline: { revision: 'release' }, receipt: { status: 'accepted' } }
  const { store, done } = sequence([...readSteps(), ...writeSteps(state)])
  assert.equal(await store.write({ expectedVersion: previous, state }), nextVersion)
  done()
})

test('a stale expected version fails before creating any git objects', async () => {
  const { store, calls, done } = sequence(readSteps())
  await assert.rejects(store.write({ expectedVersion: 'a'.repeat(40), state: {} }), error => {
    assert.ok(error instanceof IndexNowStateError)
    assert.equal(error.code, 'STALE_STATE')
    return true
  })
  assert.ok(calls.every(({ options }) => options.method === 'GET'))
  done()
})

test('null expected version cannot overwrite an existing branch or reset a baseline', async () => {
  const { store, done } = sequence(readSteps())
  await assert.rejects(store.write({ expectedVersion: null, state: {} }), error => error.code === 'STALE_STATE')
  done()
})

test('an expected existing version cannot silently reinitialize a deleted state branch', async () => {
  const { store, done } = sequence(missingSteps())
  await assert.rejects(store.write({ expectedVersion: previous, state: {} }), error => error.code === 'STALE_STATE')
  done()
})

test('concurrent ref updates are rejected rather than retried with force', async () => {
  for (const status of [409, 422]) {
    const steps = [...readSteps(), ...writeSteps({ status: 'accepted' })]
    steps.at(-1).status = status
    const { store, calls, done } = sequence(steps)
    await assert.rejects(
      store.write({ expectedVersion: previous, state: { status: 'accepted' } }),
      error => error.code === 'STALE_STATE',
    )
    assert.equal(calls.at(-1).options.method, 'PATCH')
    assert.equal(JSON.parse(calls.at(-1).options.body).force, false)
    done()
  }
})

test('concurrent first-branch creation cannot replace the winning branch', async () => {
  const steps = [...missingSteps(), ...writeSteps({ status: 'planned' }, null)]
  steps.at(-1).status = 422
  const { store, calls, done } = sequence(steps)
  await assert.rejects(
    store.write({ expectedVersion: null, state: { status: 'planned' } }),
    error => error.code === 'STALE_STATE',
  )
  assert.equal(calls.at(-1).options.method, 'POST')
  assert.equal(calls.at(-1).url, `${prefix}/git/refs`)
  done()
})

test('unauthorized, rate-limited and server responses never look like first deployment', async () => {
  for (const status of [401, 403, 429, 500, 502]) {
    const { store, done } = sequence([{ path: `/git/ref/heads/${branch}`, status }])
    await assert.rejects(store.read(), new RegExp(`HTTP ${status}`))
    done()
  }
})

test('404 from an inaccessible repository is fatal rather than an empty baseline', async () => {
  for (const status of [401, 403, 404]) {
    const { store, done } = sequence([
      { path: `/git/ref/heads/${branch}`, status: 404 },
      { path: '', status },
    ])
    await assert.rejects(store.read(), new RegExp(`HTTP ${status}`))
    done()
  }
})

test('missing or inaccessible commit/tree/state.json objects fail closed', async () => {
  for (const index of [1, 2, 3]) {
    const steps = readSteps().slice(0, index + 1)
    steps.at(-1).status = 404
    const { store, done } = sequence(steps)
    await assert.rejects(store.read(), /HTTP 404/)
    done()
  }
})

test('a branch-ref 404 is not trusted if exact ref still exists or discovery fails', async () => {
  for (const value of [[ref()], {}, [{ ref: 42 }]]) {
    const steps = missingSteps()
    steps.at(-1).value = value
    const { store, done } = sequence(steps)
    await assert.rejects(store.read(), /branch/)
    done()
  }
  const steps = missingSteps()
  steps.at(-1).status = 404
  const { store, done } = sequence(steps)
  await assert.rejects(store.read(), /HTTP 404/)
  done()
})

test('similarly named state branches do not count as this exact branch', async () => {
  const steps = missingSteps()
  steps.at(-1).value = [ref(previous, 'indexnow-state-other')]
  const { store, done } = sequence(steps)
  assert.deepEqual(await store.read(), { version: null, state: null })
  done()
})

test('malformed references, commits and state-only trees are rejected', async () => {
  const cases = [
    [0, { ...ref(), ref: 'refs/heads/main' }],
    [0, { ...ref(), object: { type: 'tag', sha: previous } }],
    [1, { sha: 'a'.repeat(40), tree: { sha: previousTree } }],
    [1, { sha: previous, tree: { sha: 'not-a-sha' } }],
    [2, { sha: previousTree, truncated: true, tree: [] }],
    [2, { sha: previousTree, truncated: false, tree: [] }],
    [
      2,
      {
        sha: previousTree,
        truncated: false,
        tree: [{ path: 'other.json', mode: '100644', type: 'blob', sha: previousBlob }],
      },
    ],
    [
      2,
      {
        sha: previousTree,
        truncated: false,
        tree: [{ path: 'state.json', mode: '120000', type: 'blob', sha: previousBlob }],
      },
    ],
    [2, { sha: previousTree, truncated: false, tree: readSteps()[2].value.tree.concat({ path: 'site.js' }) }],
  ]
  for (const [index, value] of cases) {
    const steps = readSteps().slice(0, index + 1)
    steps[index].value = value
    const { store, done } = sequence(steps)
    await assert.rejects(store.read(), IndexNowStateError)
    done()
  }
})

test('corrupt JSON, UTF-8, encoding and mismatched blob sizes are rejected', async () => {
  const cases = [
    { encoding: 'utf8' },
    { sha: nextBlob },
    { size: 999 },
    { content: '!not-base64!' },
    { content: Buffer.from('{invalid').toString('base64'), size: 8 },
    { content: Buffer.from('[]').toString('base64'), size: 2 },
    { content: Buffer.from('null').toString('base64'), size: 4 },
    { content: Buffer.from([0xff, 0xfe]).toString('base64'), size: 2 },
    { size: 17 * 1024 * 1024 },
  ]
  for (const overrides of cases) {
    const steps = readSteps()
    Object.assign(steps.at(-1).value, overrides)
    const { store, done } = sequence(steps)
    await assert.rejects(store.read(), IndexNowStateError)
    done()
  }
})

test('wrapped base64 content from GitHub is decoded correctly', async () => {
  const steps = readSteps()
  steps.at(-1).value.content =
    steps
      .at(-1)
      .value.content.match(/.{1,12}/g)
      .join('\n') + '\n'
  const { store, done } = sequence(steps)
  assert.deepEqual((await store.read()).state, { baseline: null, journal: [] })
  done()
})

test('state writes require an explicit version and lossless JSON object before network requests', async () => {
  const cycle = {}
  cycle.self = cycle
  const { store, calls } = sequence([])
  for (const expectedVersion of [undefined, '', 'main', 42]) {
    await assert.rejects(store.write({ expectedVersion, state: {} }), /version is required/)
  }
  for (const state of [
    undefined,
    null,
    [],
    'text',
    { n: NaN },
    { n: Infinity },
    { n: 1n },
    { n: undefined },
    { n: () => undefined },
    { n: new Date() },
    { n: new Array(1) },
    cycle,
  ]) {
    await assert.rejects(store.write({ expectedVersion: null, state }), IndexNowStateError)
  }
  assert.equal(calls.length, 0)
})

test('invalid repository, unsafe API origin and any non-state branch are rejected offline', () => {
  const forbiddenFetch = () => assert.fail('Validation must not make requests')
  for (const invalid of [
    '',
    'site',
    'owner/site/more',
    '../site',
    'owner/..',
    'owner/.',
    'owner/site?token=x',
    'owner/site%2Fmain',
    '/owner/site',
  ]) {
    assert.throws(() => createGitHubStateStore({ repository: invalid, fetchImpl: forbiddenFetch }), /owner\/repository/)
  }
  for (const invalid of [
    'main',
    'master',
    'feat/knowledge-base-redesign',
    'indexnow-state/main',
    'indexnow-state..x',
    'indexnow-state-',
    'indexnow-state--test',
    'indexnow-state_test',
    'indexnow-state\n',
  ]) {
    assert.throws(() => createGitHubStateStore({ repository, branch: invalid, fetchImpl: forbiddenFetch }), /dedicated/)
  }
  for (const apiOrigin of [
    'http://api.github.com',
    'https://user:pass@api.github.com',
    'https://api.github.com/path',
    'https://api.github.com?x=1',
    'https://api.github.com#fragment',
    'invalid',
  ]) {
    assert.throws(() => createGitHubStateStore({ repository, apiOrigin, fetchImpl: forbiddenFetch }), /HTTPS/)
  }
  for (const invalid of ['', null, 42, 'with space', 'line\nbreak']) {
    assert.throws(() => createGitHubStateStore({ repository, token: invalid, fetchImpl: forbiddenFetch }), /token/)
  }
})

test('a custom dedicated state branch and injected HTTPS API origin are supported', async () => {
  const name = 'indexnow-state-test'
  const { store, done } = sequence(missingSteps(name), { branch: name, apiOrigin: 'https://github-api.example.test' })
  assert.deepEqual(await store.read(), { version: null, state: null })
  done()
})

test('failures never expose token, remote response body or thrown network detail', async () => {
  for (const step of [
    { status: 403, value: { message: token } },
    { error: new Error(`Failed request Authorization: Bearer ${token}`) },
    { raw: token },
  ]) {
    const { store, done } = sequence([{ path: `/git/ref/heads/${branch}`, ...step }])
    await assert.rejects(store.read(), error => {
      assert.ok(error instanceof IndexNowStateError)
      assert.ok(!error.message.includes(token))
      return true
    })
    done()
  }
})

test('failed initialization never falls back to updating an existing or default branch', async () => {
  for (const stopAt of [0, 1, 2, 3]) {
    const mutations = writeSteps({}, null).slice(0, stopAt + 1)
    mutations.at(-1).status = 403
    const { store, calls, done } = sequence([...missingSteps(), ...mutations])
    await assert.rejects(store.write({ expectedVersion: null, state: {} }), /HTTP 403/)
    assert.ok(calls.every(({ options }) => options.method !== 'PATCH'))
    done()
  }
})

test('a successful write requires confirmation of the exact new ref SHA', async () => {
  const steps = [...missingSteps(), ...writeSteps({}, null)]
  steps.at(-1).value = ref(previous)
  const { store, done } = sequence(steps)
  await assert.rejects(store.write({ expectedVersion: null, state: {} }), /confirm/)
  done()
})
