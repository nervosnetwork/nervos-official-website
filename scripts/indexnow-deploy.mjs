import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  INDEXNOW_MANIFEST_PATH,
  INDEXNOW_ORIGIN,
  INDEXNOW_RELEASE_PATH,
  INDEXNOW_REPOSITORY,
} from '../config/indexnow.mjs'
import { normalizeUrls, runIndexNow } from './indexnow.mjs'
import { planIndexNow, stableHash, validateManifest } from './indexnow-manifest.mjs'
import { createGitHubStateStore } from './indexnow-state.mjs'

const SHA = /^[a-f0-9]{40}$/
const DIGEST = /^[a-f0-9]{64}$/
const ID = /^\d+$/
const TIMEOUT = 15_000
const terminal = new Set(['accepted', 'empty'])

async function jsonResponse(response, description) {
  assert.equal(response.status, 200, `${description} returned HTTP ${response.status}`)
  assert(
    /^application\/json(?:\s*;|\s*$)/i.test(response.headers.get('content-type') || ''),
    `${description} must return JSON`,
  )
  const text = await response.text()
  assert(Buffer.byteLength(text) <= 12 * 1024 * 1024, `${description} is too large`)
  return JSON.parse(text)
}

export async function readProductionDeployment({
  repository = INDEXNOW_REPOSITORY,
  token,
  deploymentId,
  environment = 'Production',
  creator = 'vercel[bot]',
  fetchImpl = globalThis.fetch,
}) {
  assert.equal(repository, INDEXNOW_REPOSITORY, 'Only the approved website repository is allowed')
  assert(
    typeof environment === 'string' && environment.length > 0 && environment.length < 100,
    'Invalid production environment',
  )
  assert(typeof creator === 'string' && creator.length > 0, 'A trusted deployment creator is required')
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
  const get = async suffix =>
    jsonResponse(
      await fetchImpl(`https://api.github.com/repos/${repository}/${suffix}`, {
        headers,
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(TIMEOUT),
      }),
      'GitHub deployment metadata',
    )
  let deployment
  if (deploymentId) {
    assert(ID.test(String(deploymentId)), 'Deployment ID must contain only digits')
    deployment = await get(`deployments/${deploymentId}`)
    assert.equal(String(deployment.id), String(deploymentId), 'Deployment identity mismatch')
  } else {
    const candidates = await get(`deployments?environment=${encodeURIComponent(environment)}&per_page=20`)
    assert(Array.isArray(candidates), 'Invalid deployment list')
    deployment = candidates.find(item => item.environment === environment && item.creator?.login === creator)
    assert(deployment, 'No trusted production deployment found')
  }
  assert(ID.test(String(deployment.id)), 'Invalid deployment identity')
  assert.equal(deployment.environment, environment, 'Preview/non-production deployments cannot notify IndexNow')
  assert.equal(deployment.creator?.login, creator, 'Untrusted deployment creator')
  assert(SHA.test(deployment.sha), 'Deployment must identify a full Git revision')
  const statuses = await get(`deployments/${deployment.id}/statuses?per_page=1`)
  assert(
    Array.isArray(statuses) && statuses[0]?.state === 'success',
    'The latest production deployment status must be success',
  )
  assert.equal(statuses[0].creator?.login, creator, 'Untrusted deployment status creator')
  const target = new URL(statuses[0].environment_url)
  assert(
    target.protocol === 'https:' &&
      !target.username &&
      !target.password &&
      !target.port &&
      !target.search &&
      !target.hash,
    'Invalid deployment URL',
  )
  assert(
    target.origin === INDEXNOW_ORIGIN ||
      /^nervos-official-website-[a-z0-9-]+-ckba-team\.vercel\.app$/.test(target.hostname),
    'Unexpected deployment project/domain',
  )
  // Vercel creates deployments with SHA-only refs, so workflow GITHUB_REF may
  // be empty. Verify ancestry with GitHub instead of trusting checkout/ref text.
  const ancestry = await get(`compare/${deployment.sha}...main`)
  assert.equal(
    ancestry.base_commit?.sha,
    deployment.sha,
    'Production ancestry response does not match the deployed revision',
  )
  assert(
    ['ahead', 'identical'].includes(ancestry.status),
    'The deployed revision must already belong to approved main history',
  )
  return { id: String(deployment.id), revision: deployment.sha, environment, url: target.href }
}

export async function verifyLiveRelease({ revision, manifestDigest, fetchImpl = globalThis.fetch }) {
  assert(SHA.test(revision), 'A full production revision is required')
  const response = await fetchImpl(`${INDEXNOW_ORIGIN}${INDEXNOW_RELEASE_PATH}`, {
    method: 'GET',
    redirect: 'error',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT),
  })
  const release = await jsonResponse(response, 'Live production release marker')
  assert.deepEqual(
    Object.keys(release).sort(),
    ['schemaVersion', 'revision', 'manifestDigest'].sort(),
    'Unexpected release marker fields',
  )
  assert.equal(release.schemaVersion, 1, 'Unsupported release marker')
  assert.equal(
    release.revision,
    revision,
    'The deployment is not the revision currently serving on the production domain',
  )
  assert(DIGEST.test(release.manifestDigest), 'Invalid live manifest digest')
  if (manifestDigest)
    assert.equal(release.manifestDigest, manifestDigest, 'Production manifest changed during notification')
  return release
}

export async function loadLiveManifest({ revision, fetchImpl = globalThis.fetch }) {
  const release = await verifyLiveRelease({ revision, fetchImpl })
  const response = await fetchImpl(`${INDEXNOW_ORIGIN}${INDEXNOW_MANIFEST_PATH}`, {
    method: 'GET',
    redirect: 'error',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT),
  })
  const manifest = validateManifest(await jsonResponse(response, 'Live production manifest'))
  assert.equal(manifest.revision, revision, 'The live manifest belongs to a different release')
  assert.equal(manifest.digest, release.manifestDigest, 'Live marker/manifest mismatch')
  return manifest
}

function validateState(state) {
  if (state === null) return { schemaVersion: 1, baseline: null, journal: null }
  assert(state && typeof state === 'object' && state.schemaVersion === 1, 'Invalid saved IndexNow state')
  assert(Object.hasOwn(state, 'baseline') && Object.hasOwn(state, 'journal'), 'Incomplete saved IndexNow state')
  if (state.baseline !== null) {
    planIndexNow({ manifest: state.baseline.manifest, baseline: state.baseline, scope: state.baseline.scope })
  }
  if (state.journal !== null) {
    const journal = state.journal
    assert(
      journal && ID.test(journal.deploymentId) && DIGEST.test(journal.plan?.digest),
      'Invalid saved notification journal',
    )
    const { digest, ...payload } = journal.plan
    assert.equal(stableHash(payload), digest, 'Saved notification plan is corrupted')
    assert(Array.isArray(journal.plan.urls), 'Invalid saved notification URLs')
    normalizeUrls(journal.plan.urls)
    assert(
      ['prepared', 'submitting', 'accepted', 'empty', 'pending-validation', 'failed', 'superseded'].includes(
        journal.status,
      ),
      'Invalid saved notification status',
    )
    assert(Array.isArray(journal.acceptedUrls), 'Missing accepted-URL checkpoint')
    const accepted = normalizeUrls(journal.acceptedUrls)
    assert(
      accepted.length === journal.acceptedUrls.length && accepted.every(url => journal.plan.urls.includes(url)),
      'Invalid accepted-URL checkpoint',
    )
  }
  return structuredClone(state)
}

// Injected stores/fetch make all transition tests offline. No API token, raw
// deployment payload or response body is included in plans, journals or files.
export async function runDeploymentIndexNow({
  mode = 'plan',
  repository = INDEXNOW_REPOSITORY,
  token,
  deploymentId,
  environment = 'Production',
  creator = 'vercel[bot]',
  enabled = false,
  scope,
  approvePlan,
  retryIncomplete = false,
  fetchImpl = globalThis.fetch,
  store = createGitHubStateStore({ repository, token, fetchImpl }),
  now = () => new Date().toISOString(),
  onOutput = async () => undefined,
}) {
  assert(['plan', 'submit'].includes(mode), 'Mode must be plan or submit')
  assert(typeof retryIncomplete === 'boolean', 'Retry permission must be an explicit boolean')
  assert(!scope || ['kb', 'site'].includes(scope), 'Scope must be kb or site')
  assert(!approvePlan || DIGEST.test(approvePlan), 'Approval must be an exact plan SHA-256')
  if (mode === 'submit') {
    assert.equal(enabled, true, 'Production notifications are disabled; INDEXNOW_ENABLED must be true')
    assert(token, 'A scoped GitHub Actions token is required to save notification state')
    assert(ID.test(String(deploymentId ?? '')), 'Submit requires an explicit production deployment ID')
  }
  const deployment = await readProductionDeployment({
    repository,
    token,
    deploymentId,
    environment,
    creator,
    fetchImpl,
  })
  const manifest = await loadLiveManifest({ revision: deployment.revision, fetchImpl })
  let { version, state: saved } = await store.read()
  const state = validateState(saved)
  const previousBaseline = structuredClone(state.baseline)
  const selectedScope = scope ?? state.baseline?.scope ?? 'kb'
  const plan = planIndexNow({ manifest, baseline: state.baseline, scope: selectedScope })
  const output = { mode, status: 'planned', deployment, plan, receipt: null }
  await onOutput(structuredClone(output))
  if (mode === 'plan') return output

  const previous = state.journal
  if (previous && !terminal.has(previous.status)) {
    assert(
      retryIncomplete,
      'A prior notification is incomplete; inspect its saved receipt and explicitly approve retry',
    )
    assert.equal(approvePlan, plan.digest, 'Retry requires review and approval of the current plan')
  }
  // Replaying a completed event cannot send another POST or rewind the baseline.
  if (state.baseline?.deploymentId === deployment.id && state.baseline.manifest.digest === manifest.digest) {
    output.status = 'already-notified'
    await onOutput(structuredClone(output))
    return output
  }
  if (approvePlan)
    assert.equal(approvePlan, plan.digest, 'The approved plan is stale; review the new plan before submitting')
  if (!state.baseline)
    assert.equal(approvePlan, plan.digest, 'First submission requires review and approval of this exact initial plan')
  const samePlan = previous?.deploymentId === deployment.id && previous.plan.digest === plan.digest
  const accepted = new Set(samePlan ? previous.acceptedUrls : [])
  const journal = {
    deploymentId: deployment.id,
    revision: deployment.revision,
    plan,
    status: 'prepared',
    acceptedUrls: [...accepted],
    receipt: null,
    startedAt: now(),
    updatedAt: now(),
  }
  const persist = async () => {
    journal.updatedAt = now()
    state.journal = journal
    version = await store.write({ expectedVersion: version, state: structuredClone(state) })
  }
  // Claim durable intent before the key GET or any notification POST. The
  // state store's compare-and-swap also rejects competing/late writers.
  await verifyLiveRelease({ revision: deployment.revision, manifestDigest: manifest.digest, fetchImpl })
  await persist()
  let baselineCommitted = false
  try {
    const receipt = await runIndexNow({
      urls: plan.urls.filter(url => !accepted.has(url)),
      submit: true,
      productionDeployed: true,
      fetchImpl,
      beforeBatch: () =>
        verifyLiveRelease({ revision: deployment.revision, manifestDigest: manifest.digest, fetchImpl }),
      onProgress: async receipt => {
        for (const batch of receipt.batches) {
          if (batch.status === 'accepted') for (const url of batch.urls) accepted.add(url)
        }
        journal.acceptedUrls = [...accepted].sort()
        journal.status = receipt.status
        journal.receipt = receipt
        output.status = receipt.status
        output.receipt = receipt
        await persist()
        await onOutput(structuredClone(output))
      },
    })
    output.receipt = receipt
    output.status = receipt.status
    journal.receipt = receipt
    journal.status = receipt.status
    if (terminal.has(receipt.status)) {
      assert(
        plan.urls.every(url => accepted.has(url)),
        'The full reviewed plan has not been accepted',
      )
      await verifyLiveRelease({ revision: deployment.revision, manifestDigest: manifest.digest, fetchImpl })
      state.baseline = {
        schemaVersion: 1,
        scope: selectedScope,
        manifest,
        deploymentId: deployment.id,
        notifiedAt: now(),
      }
    }
    await persist()
    baselineCommitted = terminal.has(receipt.status)
    await onOutput(structuredClone(output))
    return output
  } catch (error) {
    if (baselineCommitted) throw error
    state.baseline = previousBaseline
    journal.status = 'failed'
    output.status = 'failed'
    if (error.receipt) journal.receipt = output.receipt = error.receipt
    // If storage itself failed, never proceed, advance baseline or hide failure.
    // The previously saved sending intent remains available for explicit recovery.
    try {
      await persist()
    } catch {
      /* The durable prior state is authoritative. */
    }
    await onOutput(structuredClone(output))
    throw error
  }
}

const USAGE =
  'node scripts/indexnow-deploy.mjs --mode plan|submit [--deployment-id ID] [--scope kb|site] [--approve-plan SHA256] [--retry-incomplete] [--output DIR]'

export async function main(args = process.argv.slice(2), env = process.env) {
  if (args.length === 1 && args[0] === '--help') {
    console.log(USAGE)
    return
  }
  const values = new Map()
  for (let index = 0; index < args.length; index++) {
    const option = args[index]
    assert(
      ['--mode', '--deployment-id', '--scope', '--approve-plan', '--retry-incomplete', '--output'].includes(option) &&
        !values.has(option),
      'Unknown or duplicate option',
    )
    if (option === '--retry-incomplete') values.set(option, true)
    else {
      const value = args[++index]
      assert(value && !value.startsWith('--'), `${option} requires a value`)
      values.set(option, value)
    }
  }
  const directory = path.resolve(values.get('--output') ?? 'indexnow-output')
  const filename = path.join(directory, 'result.json')
  await fs.mkdir(directory, { recursive: true })
  const onOutput = async result => {
    const temporary = `${filename}.tmp`
    await fs.writeFile(temporary, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 })
    await fs.rename(temporary, filename)
  }
  const result = await runDeploymentIndexNow({
    mode: values.get('--mode') ?? 'plan',
    repository: env.GITHUB_REPOSITORY ?? INDEXNOW_REPOSITORY,
    token: env.GITHUB_TOKEN,
    deploymentId: values.get('--deployment-id'),
    environment: env.INDEXNOW_ENVIRONMENT ?? 'Production',
    creator: env.INDEXNOW_ALLOWED_CREATOR ?? 'vercel[bot]',
    enabled: env.INDEXNOW_ENABLED === 'true',
    scope: values.get('--scope'),
    approvePlan: values.get('--approve-plan'),
    retryIncomplete: values.has('--retry-incomplete'),
    store: createGitHubStateStore({
      repository: env.GITHUB_REPOSITORY ?? INDEXNOW_REPOSITORY,
      token: env.GITHUB_TOKEN,
      branch: env.INDEXNOW_STATE_BRANCH ?? 'indexnow-state',
    }),
    onOutput,
  })
  console.log(JSON.stringify(result, null, 2))
  if (result.status === 'pending-validation') process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    // Detailed public plan/progress is in result.json. Avoid logging network
    // exceptions containing authorization or arbitrary remote response bodies.
    const reason = ['AssertionError', 'IndexNowStateError'].includes(error.name)
      ? error.message.split('\n')[0].slice(0, 300)
      : 'Review the saved plan/receipt and workflow prerequisites.'
    console.error(`IndexNow automation stopped safely: ${reason}`)
    process.exitCode = 1
  })
}
