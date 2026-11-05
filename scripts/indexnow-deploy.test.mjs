import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  INDEXNOW_KEY_URL,
  INDEXNOW_MANIFEST_PATH,
  INDEXNOW_ORIGIN,
  INDEXNOW_RELEASE_PATH,
  INDEXNOW_REPOSITORY,
} from '../config/indexnow.mjs'
import {
  loadLiveManifest,
  readProductionDeployment,
  runDeploymentIndexNow,
  verifyLiveRelease,
} from './indexnow-deploy.mjs'
import { planIndexNow, stableHash } from './indexnow-manifest.mjs'

const REVISION = 'a'.repeat(40)
const PREVIOUS_REVISION = 'b'.repeat(40)
const NEXT_REVISION = 'c'.repeat(40)
const TOKEN = 'offline-test-token-do-not-log'
const NOW = '2026-10-29T12:00:00.000Z'
const url = slug => `${INDEXNOW_ORIGIN}/knowledge-base/${slug}`
const json = (value, status = 200, contentType = 'application/json; charset=utf-8') =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': contentType } })
const markerFor = manifest => ({ schemaVersion: 1, revision: manifest.revision, manifestDigest: manifest.digest })
const forbiddenFetch = () => assert.fail('This operation must not perform any HTTP request')

function manifestFor(entries = [[url('example'), 'body']], revision = REVISION) {
  const payload = {
    schemaVersion: 1,
    origin: INDEXNOW_ORIGIN,
    revision,
    entries: entries
      .map(([url, content]) => ({ url, hash: stableHash({ content }) }))
      .sort((a, b) => (a.url < b.url ? -1 : 1)),
  }
  return { ...payload, digest: stableHash(payload) }
}

function baselineFor(manifest, scope = 'kb') {
  return { schemaVersion: 1, scope, manifest, deploymentId: '699', notifiedAt: NOW }
}

function memoryStore(initial = null) {
  let state = structuredClone(initial)
  let counter = initial === null ? 0 : 1
  let version = initial === null ? null : counter.toString(16).padStart(40, '0')
  return {
    reads: 0,
    attempts: 0,
    writes: [],
    failWrite: null,
    async read() {
      this.reads++
      return { version, state: structuredClone(state) }
    },
    async write(input) {
      this.attempts++
      assert.equal(input.expectedVersion, version, 'Compare-and-swap rejects stale state')
      if (this.failWrite) await this.failWrite(structuredClone(input), this.attempts)
      state = structuredClone(input.state)
      this.writes.push(structuredClone(input))
      version = (++counter).toString(16).padStart(40, '0')
      return version
    },
    snapshot() {
      return structuredClone(state)
    },
  }
}

function fixture({ manifest = manifestFor(), baseline = null, state, postStatuses = [200] } = {}) {
  const f = {
    manifest,
    deployment: {
      id: 700,
      sha: manifest.revision,
      environment: 'Production',
      production_environment: false,
      creator: { login: 'vercel[bot]' },
    },
    status: {
      state: 'success',
      creator: { login: 'vercel[bot]' },
      environment_url: 'https://nervos-official-website-example-ckba-team.vercel.app',
    },
    store: memoryStore(state ?? (baseline ? { schemaVersion: 1, baseline, journal: null } : null)),
    calls: [],
    posts: [],
    outputs: [],
    markerReads: 0,
    postStatuses: [...postStatuses],
    overrideFetch: null,
    onPost: null,
    marker: null,
    comparison: null,
  }
  f.fetchImpl = async (address, options = {}) => {
    const requestUrl = String(address)
    const method = options.method || 'GET'
    f.calls.push({ url: requestUrl, method })
    assert.equal(options.redirect, 'error', 'Never follow a redirect to an unverified endpoint')
    assert(options.signal instanceof AbortSignal, 'Every request must have a timeout')
    if (requestUrl.startsWith('https://api.github.com/')) {
      assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`)
    } else {
      assert(
        !Object.hasOwn(options.headers || {}, 'Authorization'),
        'Do not expose the GitHub token to public endpoints',
      )
    }
    const custom = await f.overrideFetch?.(requestUrl, options)
    if (custom !== undefined) return custom
    const prefix = `https://api.github.com/repos/${INDEXNOW_REPOSITORY}/deployments`
    if (requestUrl === `${prefix}?environment=Production&per_page=20`) return json([f.deployment])
    if (requestUrl === `${prefix}/700`) return json(f.deployment)
    if (requestUrl === `${prefix}/700/statuses?per_page=1`) return json([f.status])
    if (requestUrl === `https://api.github.com/repos/${INDEXNOW_REPOSITORY}/compare/${f.deployment.sha}...main`) {
      return json(f.comparison ?? { status: 'ahead', base_commit: { sha: f.deployment.sha } })
    }
    if (requestUrl === `${INDEXNOW_ORIGIN}${INDEXNOW_RELEASE_PATH}`) {
      f.markerReads++
      return json(typeof f.marker === 'function' ? f.marker(f.markerReads) : (f.marker ?? markerFor(f.manifest)))
    }
    if (requestUrl === `${INDEXNOW_ORIGIN}${INDEXNOW_MANIFEST_PATH}`) return json(f.manifest)
    if (requestUrl === INDEXNOW_KEY_URL)
      return new Response(INDEXNOW_KEY, { headers: { 'Content-Type': 'text/plain' } })
    if (requestUrl === INDEXNOW_ENDPOINT) {
      assert.equal(method, 'POST')
      const payload = JSON.parse(options.body)
      f.posts.push(payload)
      await f.onPost?.(payload, f.posts.length)
      const status = f.postStatuses.shift() ?? 200
      if (status instanceof Error) throw status
      return new Response('', { status })
    }
    assert.fail(`Unexpected HTTP request: ${method} ${requestUrl}`)
  }
  f.run = (overrides = {}) =>
    runDeploymentIndexNow({
      mode: 'submit',
      token: TOKEN,
      deploymentId: '700',
      enabled: true,
      fetchImpl: f.fetchImpl,
      store: f.store,
      now: () => NOW,
      onOutput: async output => {
        f.outputs.push(structuredClone(output))
      },
      ...overrides,
    })
  f.approval = () =>
    planIndexNow({
      manifest: f.manifest,
      baseline: f.store.snapshot()?.baseline ?? null,
      scope: f.store.snapshot()?.baseline?.scope ?? 'kb',
    }).digest
  return f
}

test('disabled submit, missing token, and missing explicit deployment ID fail before HTTP or state access', async () => {
  for (const overrides of [
    { enabled: false },
    { enabled: 'true' },
    { token: undefined },
    { deploymentId: undefined },
  ]) {
    const f = fixture()
    await assert.rejects(f.run({ ...overrides, fetchImpl: forbiddenFetch }))
    assert.equal(f.store.reads, 0)
    assert.equal(f.store.attempts, 0)
  }
})

test('plan selects the latest trusted production deployment, reads state, and never writes or notifies', async () => {
  const f = fixture()
  const result = await f.run({ mode: 'plan', deploymentId: undefined, enabled: false })
  assert.equal(result.mode, 'plan')
  assert.equal(result.status, 'planned')
  assert.equal(result.plan.initial, true)
  assert.deepEqual(result.plan.urls, [url('example')])
  assert.equal(f.store.reads, 1)
  assert.equal(f.store.attempts, 0)
  assert.equal(f.posts.length, 0)
  assert(f.calls.every(call => call.method === 'GET'))
  assert(!f.calls.some(call => call.url === INDEXNOW_KEY_URL))
  assert(!JSON.stringify(result).includes(TOKEN))
})

test('Production is accepted even when the Vercel production_environment flag is false', async () => {
  const f = fixture()
  const deployment = await readProductionDeployment({ deploymentId: '700', token: TOKEN, fetchImpl: f.fetchImpl })
  assert.equal(f.deployment.production_environment, false)
  assert.equal(deployment.environment, 'Production')
  assert.equal(deployment.revision, REVISION)
})

test('SHA-only deployments must independently prove ancestry on main rather than trusting an event branch', async () => {
  for (const status of ['ahead', 'identical']) {
    const f = fixture()
    f.deployment.ref = REVISION
    f.comparison = { status, base_commit: { sha: REVISION } }
    const result = await f.run({ mode: 'plan' })
    assert.equal(result.deployment.revision, REVISION)
    assert(f.calls.some(call => call.url.endsWith(`/compare/${REVISION}...main`)))
    assert.equal(f.posts.length, 0)
  }
})

test('unmerged, diverged, unknown, or wrong-SHA ancestry responses fail before state access or notification', async t => {
  const cases = [
    ['unmerged head', { status: 'behind', base_commit: { sha: REVISION } }],
    ['diverged', { status: 'diverged', base_commit: { sha: REVISION } }],
    ['unknown', { status: 'unknown', base_commit: { sha: REVISION } }],
    ['missing status', { base_commit: { sha: REVISION } }],
    ['wrong base SHA', { status: 'ahead', base_commit: { sha: NEXT_REVISION } }],
    ['missing base SHA', { status: 'identical', base_commit: {} }],
  ]
  for (const [name, comparison] of cases)
    await t.test(name, async () => {
      const f = fixture()
      f.comparison = comparison
      await assert.rejects(f.run({ approvePlan: f.approval() }))
      assert.equal(f.store.reads, 0)
      assert.equal(f.store.attempts, 0)
      assert.equal(f.posts.length, 0)
      assert(!f.calls.some(call => call.url === `${INDEXNOW_ORIGIN}${INDEXNOW_RELEASE_PATH}`))
    })
})

test('deployment identity, trusted creator, environment, and successful latest status are mandatory', async t => {
  const cases = [
    ['fork repository', () => undefined, { repository: 'someone/website' }],
    [
      'untrusted creator',
      f => {
        f.deployment.creator.login = 'attacker'
      },
    ],
    [
      'Preview',
      f => {
        f.deployment.environment = 'Preview'
      },
    ],
    [
      'wrong ID',
      f => {
        f.deployment.id = 701
      },
    ],
    [
      'abbreviated revision',
      f => {
        f.deployment.sha = 'abc123'
      },
    ],
    [
      'untrusted status creator',
      f => {
        f.status.creator.login = 'attacker'
      },
    ],
    ...['pending', 'failure', 'error', 'inactive', 'in_progress'].map(state => [
      state,
      f => {
        f.status.state = state
      },
    ]),
  ]
  for (const [name, mutate, options] of cases)
    await t.test(name, async () => {
      const f = fixture()
      mutate(f)
      await assert.rejects(
        readProductionDeployment({ deploymentId: '700', token: TOKEN, fetchImpl: f.fetchImpl, ...options }),
      )
      assert.equal(f.posts.length, 0)
    })
})

test('deployment URLs reject other projects, credentials, query tokens, fragments, and non-HTTPS ports', async t => {
  for (const address of [
    'https://evil.test',
    'https://other-project-example-ckba-team.vercel.app',
    'http://www.nervos.org',
    'https://user:password@www.nervos.org',
    'https://www.nervos.org:8443',
    'https://nervos-official-website-example-ckba-team.vercel.app?token=private',
    'https://nervos-official-website-example-ckba-team.vercel.app#private',
    'https://nervos-official-website-example-ckba-team.vercel.app:8443',
    'https://www.nervos.org.evil.test',
  ])
    await t.test(address, async () => {
      const f = fixture()
      f.status.environment_url = address
      await assert.rejects(readProductionDeployment({ deploymentId: '700', token: TOKEN, fetchImpl: f.fetchImpl }))
    })
})

test('live release and manifest must match the production deployment SHA and each other', async () => {
  const f = fixture()
  assert.deepEqual(
    await verifyLiveRelease({ revision: REVISION, token: TOKEN, fetchImpl: f.fetchImpl }),
    markerFor(f.manifest),
  )
  assert.deepEqual(await loadLiveManifest({ revision: REVISION, fetchImpl: f.fetchImpl }), f.manifest)
  await assert.rejects(verifyLiveRelease({ revision: NEXT_REVISION, fetchImpl: f.fetchImpl }), /currently serving/)
  await assert.rejects(
    verifyLiveRelease({ revision: REVISION, manifestDigest: 'f'.repeat(64), fetchImpl: f.fetchImpl }),
    /changed/,
  )
  f.marker = { ...markerFor(f.manifest), manifestDigest: 'f'.repeat(64) }
  await assert.rejects(loadLiveManifest({ revision: REVISION, fetchImpl: f.fetchImpl }), /mismatch/)
  f.marker = markerFor(manifestFor([[url('example'), 'other']], REVISION))
  f.manifest = manifestFor([[url('example'), 'other']], NEXT_REVISION)
  await assert.rejects(loadLiveManifest({ revision: REVISION, fetchImpl: f.fetchImpl }), /different release/)
})

test('HTML challenges, redirects, non-JSON MIME, malformed markers, and corrupted manifests fail closed', async t => {
  const cases = [
    [
      'WAF challenge',
      () => new Response('<html>challenge</html>', { status: 429, headers: { 'Content-Type': 'text/html' } }),
      INDEXNOW_RELEASE_PATH,
    ],
    [
      'redirect',
      () => new Response(null, { status: 308, headers: { Location: '/knowledge-base' } }),
      INDEXNOW_RELEASE_PATH,
    ],
    ['HTML MIME', () => json(markerFor(manifestFor()), 200, 'text/html'), INDEXNOW_RELEASE_PATH],
    ['wrong marker version', () => json({ ...markerFor(manifestFor()), schemaVersion: 2 }), INDEXNOW_RELEASE_PATH],
    ['extra marker data', () => json({ ...markerFor(manifestFor()), token: 'should-not-pass' }), INDEXNOW_RELEASE_PATH],
    ['bad digest', () => json({ ...markerFor(manifestFor()), manifestDigest: 'bad' }), INDEXNOW_RELEASE_PATH],
    ['corrupted manifest', () => json({ ...manifestFor(), digest: 'e'.repeat(64) }), INDEXNOW_MANIFEST_PATH],
    ['wrong manifest origin', () => json({ ...manifestFor(), origin: 'https://evil.test' }), INDEXNOW_MANIFEST_PATH],
    ['manifest HTML', () => json(manifestFor(), 200, 'text/html'), INDEXNOW_MANIFEST_PATH],
  ]
  for (const [name, response, suffix] of cases)
    await t.test(name, async () => {
      const f = fixture()
      f.overrideFetch = address => (address === `${INDEXNOW_ORIGIN}${suffix}` ? response() : undefined)
      await assert.rejects(f.run({ approvePlan: f.approval() }))
      assert.equal(f.posts.length, 0)
      assert.equal(f.store.attempts, 0)
    })
})

test('first submission cannot bootstrap automatically and only the exact current initial plan grants approval', async () => {
  for (const approvePlan of [undefined, 'd'.repeat(64)]) {
    const f = fixture()
    await assert.rejects(f.run({ approvePlan }), /First submission|stale/)
    assert.equal(f.posts.length, 0)
    assert.equal(f.store.attempts, 0)
    assert.equal(f.outputs[0].plan.initial, true, 'The review plan remains available without a POST')
  }
  const f = fixture()
  const oldDigest = f.approval()
  f.manifest = manifestFor([[url('example'), 'updated after review']])
  await assert.rejects(f.run({ approvePlan: oldDigest }), /stale/)
  assert.equal(f.posts.length, 0)
})

test('accepted notifications advance the baseline once; replay of the completed deployment sends nothing', async () => {
  const f = fixture()
  const result = await f.run({ approvePlan: f.approval() })
  assert.equal(result.status, 'accepted')
  assert.deepEqual(
    f.posts.flatMap(payload => payload.urlList),
    [url('example')],
  )
  assert.equal(f.store.snapshot().baseline.deploymentId, '700')
  assert.deepEqual(f.store.snapshot().baseline.manifest, f.manifest)
  assert.equal(f.store.snapshot().journal.status, 'accepted')
  const before = f.store.writes.length
  const replay = await f.run()
  assert.equal(replay.status, 'already-notified')
  assert.equal(f.posts.length, 1)
  assert.equal(f.store.writes.length, before)
})

test('new, changed, and deleted URLs are notified; unchanged URLs and non-KB pages are not', async () => {
  const old = manifestFor(
    [
      [url('unchanged'), 'same'],
      [url('changed'), 'before'],
      [url('deleted'), 'gone'],
      [`${INDEXNOW_ORIGIN}/`, 'before'],
    ],
    PREVIOUS_REVISION,
  )
  const current = manifestFor([
    [url('unchanged'), 'same'],
    [url('changed'), 'after'],
    [url('added'), 'new'],
    [`${INDEXNOW_ORIGIN}/`, 'after'],
  ])
  const f = fixture({ manifest: current, baseline: baselineFor(old) })
  const result = await f.run()
  assert.deepEqual(result.plan.changes, { added: [url('added')], updated: [url('changed')], deleted: [url('deleted')] })
  assert.deepEqual(
    f.posts.flatMap(payload => payload.urlList),
    [url('added'), url('changed'), url('deleted')],
  )
  assert.equal(f.store.snapshot().baseline.scope, 'kb')
})

test('automatic notifications inherit an approved site scope rather than silently resetting to KB', async () => {
  const old = manifestFor(
    [
      [url('example'), 'same'],
      [`${INDEXNOW_ORIGIN}/`, 'before'],
    ],
    PREVIOUS_REVISION,
  )
  const current = manifestFor([
    [url('example'), 'same'],
    [`${INDEXNOW_ORIGIN}/`, 'after'],
  ])
  const f = fixture({ manifest: current, baseline: baselineFor(old, 'site') })
  const result = await f.run()
  assert.equal(result.plan.scope, 'site')
  assert.deepEqual(f.posts[0].urlList, [`${INDEXNOW_ORIGIN}/`])
  assert.equal(f.store.snapshot().baseline.scope, 'site')
})

test('unchanged content advances the successful release baseline without an unnecessary IndexNow POST', async () => {
  const old = manifestFor([[url('example'), 'body']], PREVIOUS_REVISION)
  const f = fixture({ baseline: baselineFor(old) })
  const result = await f.run()
  assert.equal(result.status, 'empty')
  assert.equal(f.posts.length, 0)
  assert.equal(f.store.snapshot().baseline.deploymentId, '700')
  assert(!f.calls.some(call => call.url === INDEXNOW_KEY_URL))
})

test('HTTP 202 records pending validation without advancing and requires exact approval for an explicit retry', async () => {
  const f = fixture({ postStatuses: [202, 200] })
  const approval = f.approval()
  const result = await f.run({ approvePlan: approval })
  assert.equal(result.status, 'pending-validation')
  assert.equal(f.store.snapshot().baseline, null)
  assert.equal(f.store.snapshot().journal.status, 'pending-validation')
  await assert.rejects(f.run(), /incomplete/)
  await assert.rejects(f.run({ retryIncomplete: true }), /approval/)
  await assert.rejects(f.run({ retryIncomplete: true, approvePlan: 'f'.repeat(64) }), /approval/)
  assert.equal(f.posts.length, 1)
  const retry = await f.run({ retryIncomplete: true, approvePlan: approval })
  assert.equal(retry.status, 'accepted')
  assert.equal(f.posts.length, 2)
  assert.equal(f.store.snapshot().baseline.deploymentId, '700')
})

test('failed requests preserve the prior baseline and do not automatically retry', async () => {
  const old = manifestFor([[url('example'), 'old']], PREVIOUS_REVISION)
  for (const status of [400, 403, 429, 500, new Error('offline timeout')]) {
    const f = fixture({ baseline: baselineFor(old), postStatuses: [status] })
    await assert.rejects(f.run())
    assert.deepEqual(f.store.snapshot().baseline, baselineFor(old))
    assert.equal(f.store.snapshot().journal.status, 'failed')
    await assert.rejects(f.run(), /incomplete/)
    assert.equal(f.posts.length, 1)
  }
})

test('partial success checkpoints accepted URLs and approved retry sends only the unfinished batch', async () => {
  const entries = Array.from({ length: 10_001 }, (_, i) => [url(`article-${String(i).padStart(5, '0')}`), 'content'])
  const f = fixture({ manifest: manifestFor(entries), postStatuses: [200, 500, 200] })
  const approval = f.approval()
  await assert.rejects(f.run({ approvePlan: approval }))
  assert.equal(f.store.snapshot().baseline, null)
  assert.equal(f.store.snapshot().journal.acceptedUrls.length, 10_000)
  assert.equal(f.posts.length, 2)
  await assert.rejects(f.run(), /incomplete/)
  const result = await f.run({ retryIncomplete: true, approvePlan: approval })
  assert.equal(result.status, 'accepted')
  assert.equal(f.posts.length, 3)
  assert.deepEqual(f.posts[2].urlList, [entries.at(-1)[0]])
  assert.equal(f.store.snapshot().journal.acceptedUrls.length, 10_001)
  assert.equal(f.store.snapshot().baseline.deploymentId, '700')
})

test('a different release becoming live between batches stops further POSTs and preserves the baseline', async () => {
  const entries = Array.from({ length: 10_001 }, (_, i) => [url(`article-${String(i).padStart(5, '0')}`), 'content'])
  const f = fixture({ manifest: manifestFor(entries) })
  f.onPost = () => {
    f.marker = { ...markerFor(f.manifest), revision: NEXT_REVISION }
  }
  await assert.rejects(f.run({ approvePlan: f.approval() }), /currently serving/)
  assert.equal(f.posts.length, 1)
  assert.equal(f.store.snapshot().baseline, null)
  assert.equal(f.store.snapshot().journal.acceptedUrls.length, 10_000)
})

test('a different release after the final accepted batch still prevents baseline promotion', async () => {
  const f = fixture()
  f.onPost = () => {
    f.marker = { ...markerFor(f.manifest), revision: NEXT_REVISION }
  }
  await assert.rejects(f.run({ approvePlan: f.approval() }), /currently serving/)
  assert.equal(f.posts.length, 1)
  assert.equal(f.store.snapshot().baseline, null)
  assert.equal(f.store.snapshot().journal.status, 'failed')
  assert.deepEqual(f.store.snapshot().journal.acceptedUrls, [url('example')])
})

test('compare-and-swap or intent persistence failures occur before any notification request', async () => {
  for (const failAt of [1, 2, 3]) {
    const f = fixture()
    f.store.failWrite = (_input, attempt) => {
      if (attempt === failAt) throw new Error('STATE_STORE_CONFLICT')
    }
    await assert.rejects(f.run({ approvePlan: f.approval() }))
    assert.equal(f.posts.length, 0, `Persistence attempt ${failAt} must precede the POST`)
    assert.equal(f.store.snapshot()?.baseline ?? null, null)
  }
})

test('permanent progress-store failure after a POST leaves a durable uncertain intent, never an advanced baseline', async () => {
  const old = manifestFor([[url('example'), 'old']], PREVIOUS_REVISION)
  const f = fixture({ baseline: baselineFor(old) })
  f.store.failWrite = (_input, attempt) => {
    if (attempt >= 4) throw new Error('PROGRESS_STORE_UNAVAILABLE')
  }
  await assert.rejects(f.run(), /persist notification progress/)
  assert.equal(f.posts.length, 1)
  assert.deepEqual(f.store.snapshot().baseline, baselineFor(old))
  assert.equal(f.store.snapshot().journal.status, 'submitting')
  assert.equal(f.store.snapshot().journal.receipt.batches[0].status, 'sending')
  assert.deepEqual(f.store.snapshot().journal.acceptedUrls, [])
  await assert.rejects(f.run(), /incomplete/)
  assert.equal(f.posts.length, 1)
})

test('a failed baseline commit never advances baseline, even when failure recovery can write again', async () => {
  const old = manifestFor([[url('example'), 'old']], PREVIOUS_REVISION)
  const f = fixture({ baseline: baselineFor(old) })
  let failed = false
  f.store.failWrite = input => {
    if (!failed && input.state.baseline?.deploymentId === '700') {
      failed = true
      throw new Error('BASELINE_WRITE_FAILED')
    }
  }
  await assert.rejects(f.run(), /BASELINE_WRITE_FAILED/)
  assert.equal(f.posts.length, 1)
  assert(failed)
  assert.deepEqual(f.store.snapshot().baseline, baselineFor(old))
  assert.equal(f.store.snapshot().journal.status, 'failed')
  assert.deepEqual(f.store.snapshot().journal.acceptedUrls, [url('example')])
})

test('an artifact failure after a committed baseline cannot roll the durable baseline backward', async () => {
  const f = fixture()
  await assert.rejects(
    f.run({
      approvePlan: f.approval(),
      onOutput: async () => {
        if (f.store.snapshot()?.baseline?.deploymentId === '700') throw new Error('ARTIFACT_WRITE_FAILED')
      },
    }),
    /ARTIFACT_WRITE_FAILED/,
  )
  assert.equal(f.store.snapshot().baseline.deploymentId, '700')
  assert.equal(f.store.snapshot().journal.status, 'accepted')
})

test('corrupted stored plans or accepted checkpoints stop before state writes and notifications', async () => {
  const initial = fixture()
  await initial.run({ approvePlan: initial.approval() })
  for (const mutate of [
    state => {
      state.journal.plan.urls = [url('injected')]
    },
    state => {
      state.journal.acceptedUrls.push('https://evil.test/injected')
    },
    state => {
      state.journal.acceptedUrls.push(url('not-in-plan'))
    },
    state => {
      state.journal.status = 'invented'
    },
    state => {
      delete state.baseline
    },
  ]) {
    const state = initial.store.snapshot()
    mutate(state)
    const f = fixture({ state })
    await assert.rejects(f.run())
    assert.equal(f.posts.length, 0)
    assert.equal(f.store.attempts, 0)
  }
})

test('CLI errors are generic and cannot leak tokens, arbitrary option values, or remote details', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'indexnow-cli-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const script = fileURLToPath(new URL('./indexnow-deploy.mjs', import.meta.url))
  for (const args of [
    ['--invalid-secret-option', TOKEN],
    ['--mode', 'submit', '--deployment-id', '700', '--output', directory],
    ['--mode', 'submit', '--mode', 'submit'],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: directory,
      env: {
        PATH: process.env.PATH,
        GITHUB_REPOSITORY: INDEXNOW_REPOSITORY,
        GITHUB_TOKEN: TOKEN,
        INDEXNOW_ENABLED: 'false',
      },
      encoding: 'utf8',
      timeout: 10_000,
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /IndexNow automation stopped safely/)
    assert(!result.stderr.includes(TOKEN))
    assert(!result.stderr.includes('invalid-secret-option'))
    assert.equal(result.stdout, '')
  }
})
