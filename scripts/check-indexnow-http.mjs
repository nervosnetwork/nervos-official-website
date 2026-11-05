import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  INDEXNOW_BATCH_SIZE,
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  INDEXNOW_KEY_URL,
  INDEXNOW_MANIFEST_PATH,
  INDEXNOW_ORIGIN,
  INDEXNOW_RELEASE_PATH,
  INDEXNOW_REPOSITORY,
} from '../config/indexnow.mjs'
import { runDeploymentIndexNow } from './indexnow-deploy.mjs'
import { scopedEntries, validateManifest } from './indexnow-manifest.mjs'

// Real local HTTP acceptance only. The production hostname is an assertion:
// every public GET is rewritten to loopback; GitHub and IndexNow are mocked.
export async function checkIndexNowHTTP(localOrigin = 'http://localhost:3005') {
  const origin = new URL(localOrigin)
  assert.equal(origin.protocol, 'http:', 'Use an HTTP loopback validation server')
  assert.ok(['localhost', '127.0.0.1'].includes(origin.hostname), 'Only localhost/127.0.0.1 are allowed')
  assert.equal(origin.pathname, '/', 'Pass only the local server origin')
  assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash, 'Pass a plain local origin')
  const realFetch = globalThis.fetch
  const counts = { localGets: 0, mockedGitHubGets: 0, mockedIndexNowPosts: 0, stateWrites: 0 }
  const permittedPaths = new Set([INDEXNOW_RELEASE_PATH, INDEXNOW_MANIFEST_PATH, new URL(INDEXNOW_KEY_URL).pathname])

  async function getLocal(pathname, options = {}) {
    assert(permittedPaths.has(pathname), 'Only the three local IndexNow verification endpoints are allowed')
    assert.equal(options.method ?? 'GET', 'GET', 'Local HTTP acceptance cannot mutate the server')
    assert.equal(
      new Headers(options.headers).get('authorization'),
      null,
      'Never forward a GitHub token to the local server',
    )
    const target = new URL(origin)
    target.pathname = pathname
    assert.equal(target.origin, origin.origin)
    counts.localGets += 1
    return realFetch(target, {
      ...options,
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(45_000),
    })
  }

  async function readLocalJSON(pathname) {
    const response = await getLocal(pathname)
    assert.equal(response.status, 200, pathname)
    assert.match(response.headers.get('content-type') ?? '', /^application\/json(?:\s*;|$)/i, pathname)
    assert.match(response.headers.get('cache-control') ?? '', /(?:^|,)\s*no-store\s*(?:,|$)/i, `${pathname}: no-store`)
    return response.json()
  }

  const release = await readLocalJSON(INDEXNOW_RELEASE_PATH)
  assert.deepEqual(Object.keys(release).sort(), ['schemaVersion', 'revision', 'manifestDigest'].sort())
  assert.equal(release.schemaVersion, 1)
  assert.match(release.revision, /^[a-f0-9]{40}$/)
  assert.match(release.manifestDigest, /^[a-f0-9]{64}$/)
  const manifest = validateManifest(await readLocalJSON(INDEXNOW_MANIFEST_PATH))
  assert.equal(manifest.revision, release.revision, 'Local release/manifest identify the same build')
  assert.equal(manifest.digest, release.manifestDigest, 'Local release/manifest digest agrees')
  const expectedKB = scopedEntries(manifest, 'kb').map(entry => entry.url)
  assert(expectedKB.length > 0, 'The real generated manifest contains published KB pages')
  const keyResponse = await getLocal(new URL(INDEXNOW_KEY_URL).pathname)
  assert.equal(keyResponse.status, 200, 'Local key file is available')
  assert.match(keyResponse.headers.get('content-type') ?? '', /^text\/plain(?:\s*;|$)/i)
  assert.ok([INDEXNOW_KEY, `${INDEXNOW_KEY}\n`, `${INDEXNOW_KEY}\r\n`].includes(await keyResponse.text()))

  let saved = { version: null, state: null }
  const snapshots = []
  const store = {
    async read() {
      return structuredClone(saved)
    },
    async write({ expectedVersion, state }) {
      assert.equal(expectedVersion, saved.version, 'In-memory state store uses compare-and-swap')
      assert.equal(JSON.stringify(state).includes('local-simulation-not-a-real-token'), false, 'State has no token')
      counts.stateWrites += 1
      const version = counts.stateWrites.toString(16).padStart(40, '0')
      saved = { version, state: structuredClone(state) }
      snapshots.push(structuredClone(saved))
      return version
    },
  }
  const deploymentIds = ['9000000001', '9000000002']
  const githubRoot = `https://api.github.com/repos/${INDEXNOW_REPOSITORY}`
  const deployment = id => ({
    id: Number(id),
    sha: release.revision,
    environment: 'Production',
    production_environment: false,
    creator: { login: 'vercel[bot]' },
  })
  const mockedJSON = value =>
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  const posted = []
  const fetchImpl = async (input, options = {}) => {
    const value = String(input)
    const parsed = new URL(value)
    if (parsed.origin === INDEXNOW_ORIGIN) {
      assert.equal(parsed.search, '')
      assert.equal(parsed.hash, '')
      return getLocal(parsed.pathname, options)
    }
    if (value === INDEXNOW_ENDPOINT) {
      assert.equal(options.method, 'POST')
      const payload = JSON.parse(options.body)
      assert.deepEqual(Object.keys(payload).sort(), ['host', 'key', 'keyLocation', 'urlList'])
      assert.equal(payload.host, new URL(INDEXNOW_ORIGIN).host)
      assert.equal(payload.key, INDEXNOW_KEY)
      assert.equal(payload.keyLocation, INDEXNOW_KEY_URL)
      assert(payload.urlList.length > 0 && payload.urlList.length <= INDEXNOW_BATCH_SIZE)
      assert(
        payload.urlList.every(url => expectedKB.includes(url)),
        'Only real KB manifest URLs are simulated',
      )
      assert(
        saved.state?.journal && saved.state.journal.receipt?.batches.some(batch => batch.status === 'sending'),
        'Sending intent is durable before the mocked POST',
      )
      counts.mockedIndexNowPosts += 1
      posted.push(...payload.urlList)
      return new Response(null, { status: 200 })
    }
    assert.equal(options.method ?? 'GET', 'GET', 'GitHub metadata simulation is read-only')
    if (value === `${githubRoot}/compare/${release.revision}...main`) {
      counts.mockedGitHubGets += 1
      return mockedJSON({ status: 'identical', base_commit: { sha: release.revision } })
    }
    if (value === `${githubRoot}/deployments?environment=Production&per_page=20`) {
      counts.mockedGitHubGets += 1
      return mockedJSON([deployment(deploymentIds[0])])
    }
    for (const id of deploymentIds) {
      if (value === `${githubRoot}/deployments/${id}`) {
        counts.mockedGitHubGets += 1
        return mockedJSON(deployment(id))
      }
      if (value === `${githubRoot}/deployments/${id}/statuses?per_page=1`) {
        counts.mockedGitHubGets += 1
        return mockedJSON([
          { state: 'success', creator: { login: 'vercel[bot]' }, environment_url: `${INDEXNOW_ORIGIN}/` },
        ])
      }
    }
    assert.fail('Unknown integration-check request blocked; external HTTP is forbidden')
  }
  const common = { repository: INDEXNOW_REPOSITORY, store, fetchImpl, scope: 'kb' }
  const plan = await runDeploymentIndexNow({ ...common, mode: 'plan' })
  assert.equal(plan.status, 'planned')
  assert.equal(plan.plan.initial, true)
  assert.deepEqual(plan.plan.urls, expectedKB)
  assert.equal(counts.stateWrites, 0, 'Plan mode never writes state')
  assert.equal(counts.mockedIndexNowPosts, 0, 'Plan mode never sends even a simulated notification')

  const submission = {
    ...common,
    mode: 'submit',
    enabled: true,
    token: 'local-simulation-not-a-real-token',
    deploymentId: deploymentIds[0],
  }
  const accepted = await runDeploymentIndexNow({ ...submission, approvePlan: plan.plan.digest })
  assert.equal(accepted.status, 'accepted')
  assert.deepEqual(posted, expectedKB, 'Approved bootstrap covers every real KB canonical exactly once')
  assert.equal(counts.mockedIndexNowPosts, Math.ceil(expectedKB.length / INDEXNOW_BATCH_SIZE))
  assert.equal(saved.state.baseline.manifest.digest, manifest.digest)
  assert.equal(saved.state.baseline.deploymentId, deploymentIds[0])
  assert.equal(snapshots[0].state.baseline, null, 'Intent does not prematurely advance the baseline')
  assert.equal(snapshots.at(-2).state.baseline, null, 'Results are saved before baseline advancement')
  const previousPosts = counts.mockedIndexNowPosts
  const previousWrites = counts.stateWrites
  const replay = await runDeploymentIndexNow(submission)
  assert.equal(replay.status, 'already-notified')
  assert.equal(counts.mockedIndexNowPosts, previousPosts, 'Duplicate deployment does not notify again')
  assert.equal(counts.stateWrites, previousWrites, 'Duplicate deployment does not rewrite the baseline')

  const unchanged = await runDeploymentIndexNow({ ...submission, deploymentId: deploymentIds[1] })
  assert.equal(unchanged.status, 'empty')
  assert.deepEqual(unchanged.plan.urls, [])
  assert.equal(counts.mockedIndexNowPosts, previousPosts, 'An unchanged redeployment needs no notifications')
  assert.equal(
    saved.state.baseline.deploymentId,
    deploymentIds[1],
    'Verified empty redeployment still advances the baseline',
  )
  assert.equal(saved.state.baseline.manifest.digest, manifest.digest)
  return {
    localOrigin: origin.origin,
    revision: release.revision,
    manifestURLs: manifest.entries.length,
    approvedKBURLs: expectedKB.length,
    ...counts,
    checks: [
      'real-local-headers-key-manifest',
      'read-only-plan',
      'approved-bootstrap',
      'duplicate-replay',
      'unchanged-redeployment',
    ],
    safety: 'ALL IndexNow notifications and GitHub APIs are mocked. Real HTTP requests are loopback-only.',
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assert(process.argv.length <= 3, 'Usage: node scripts/check-indexnow-http.mjs [http://localhost:3005]')
  const result = await checkIndexNowHTTP(process.argv[2])
  console.log(JSON.stringify(result, null, 2))
}
