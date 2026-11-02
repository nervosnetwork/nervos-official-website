// Durable notification state lives on its own branch. Every successful write
// creates a commit, retaining prior inputs/receipts without touching site code.
const STATE_FILE = 'state.json'
const SHA_PATTERN = /^[a-f0-9]{40}$/
const MAX_STATE_BYTES = 16 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 15_000

export class IndexNowStateError extends Error {
  constructor(message, code = 'STATE_STORE_ERROR') {
    super(message)
    this.name = 'IndexNowStateError'
    this.code = code
  }
}

function fail(message, code) {
  throw new IndexNowStateError(message, code)
}

function validSha(value) {
  return typeof value === 'string' && SHA_PATTERN.test(value)
}

function jsonObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function serializeState(state) {
  if (!jsonObject(state)) fail('IndexNow state must be a JSON object')
  const ancestors = new Set()
  function validate(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return
    if (typeof value === 'number' && Number.isFinite(value)) return
    if (typeof value !== 'object') fail('IndexNow state must contain only JSON values')
    if (ancestors.has(value)) fail('IndexNow state must not contain cycles')
    const prototype = Object.getPrototypeOf(value)
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
      fail('IndexNow state must contain only plain JSON objects')
    }
    if (Object.getOwnPropertySymbols(value).length) fail('IndexNow state must contain only JSON values')
    ancestors.add(value)
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) fail('IndexNow state must not contain sparse arrays')
        validate(value[index])
      }
    } else {
      for (const item of Object.values(value)) validate(item)
    }
    ancestors.delete(value)
  }
  validate(state)
  let content
  try {
    content = `${JSON.stringify(state, null, 2)}\n`
  } catch {
    fail('IndexNow state could not be serialized')
  }
  if (Buffer.byteLength(content, 'utf8') > MAX_STATE_BYTES) fail('IndexNow state exceeds the size limit')
  return content
}

export function createGitHubStateStore({
  repository,
  token,
  branch = 'indexnow-state',
  fetchImpl = globalThis.fetch,
  apiOrigin = 'https://api.github.com',
} = {}) {
  if (
    typeof repository !== 'string' ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/.test(repository) ||
    ['.', '..'].includes(repository.split('/')[1])
  )
    fail('A valid owner/repository is required for IndexNow state')
  if (
    typeof branch !== 'string' ||
    branch.length > 100 ||
    !/^indexnow-state(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(branch)
  )
    fail('IndexNow state must use its dedicated indexnow-state branch')
  if (token !== undefined && (typeof token !== 'string' || !token || /\s/u.test(token))) {
    fail('The IndexNow state token is invalid')
  }
  if (typeof fetchImpl !== 'function') fail('A fetch implementation is required')
  let api
  try {
    api = new URL(apiOrigin)
  } catch {
    fail('An HTTPS GitHub API origin is required')
  }
  if (api.protocol !== 'https:' || api.username || api.password || api.search || api.hash || api.pathname !== '/') {
    fail('An HTTPS GitHub API origin is required')
  }
  const prefix = `${api.origin}/repos/${repository}`
  const refName = `refs/heads/${branch}`
  const encodedBranch = encodeURIComponent(branch)

  async function discard(response) {
    try {
      await response.body?.cancel()
    } catch {
      // Discard failures must not expose remote/network error details either.
    }
  }

  async function request(path, { method = 'GET', body, allowMissing = false, conflictCode } = {}) {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }
    if (token) headers.Authorization = `Bearer ${token}`
    if (body !== undefined) headers['Content-Type'] = 'application/json'
    let response
    try {
      response = await fetchImpl(`${prefix}${path}`, {
        method,
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch {
      // Never propagate response bodies, request headers or token-bearing errors.
      fail('GitHub IndexNow state request failed')
    }
    if (allowMissing && response.status === 404) {
      await discard(response)
      return null
    }
    if (conflictCode && [409, 422].includes(response.status)) {
      await discard(response)
      fail('IndexNow state changed concurrently; reload state before retrying', conflictCode)
    }
    const accepted = method === 'GET' ? response.status === 200 : [200, 201].includes(response.status)
    if (!accepted) {
      await discard(response)
      fail(`GitHub IndexNow state request returned HTTP ${response.status}`)
    }
    try {
      return await response.json()
    } catch {
      fail('GitHub IndexNow state response was not valid JSON')
    }
  }

  async function currentVersion() {
    const reference = await request(`/git/ref/heads/${encodedBranch}`, { allowMissing: true })
    if (reference === null) {
      // GitHub also returns 404 for inaccessible repositories. Verify access and
      // an exact missing ref before ever treating this as a first deployment.
      const repo = await request('')
      if (
        !jsonObject(repo) ||
        typeof repo.full_name !== 'string' ||
        repo.full_name.toLowerCase() !== repository.toLowerCase()
      ) {
        fail('GitHub IndexNow state repository could not be verified')
      }
      const matches = await request(`/git/matching-refs/heads/${encodedBranch}`)
      if (!Array.isArray(matches) || matches.some(item => !jsonObject(item) || typeof item.ref !== 'string')) {
        fail('GitHub IndexNow state branch response was invalid')
      }
      if (matches.some(item => item.ref === refName)) {
        fail('GitHub IndexNow state branch could not be read')
      }
      return null
    }
    if (
      !jsonObject(reference) ||
      reference.ref !== refName ||
      reference.object?.type !== 'commit' ||
      !validSha(reference.object?.sha)
    ) {
      fail('GitHub IndexNow state branch response was invalid')
    }
    return reference.object.sha
  }

  async function read() {
    const version = await currentVersion()
    if (version === null) return { version: null, state: null }
    const commit = await request(`/git/commits/${version}`)
    if (!jsonObject(commit) || commit.sha !== version || !validSha(commit.tree?.sha))
      fail('GitHub IndexNow state commit was invalid')
    const tree = await request(`/git/trees/${commit.tree.sha}`)
    if (
      !jsonObject(tree) ||
      tree.sha !== commit.tree.sha ||
      tree.truncated !== false ||
      !Array.isArray(tree.tree) ||
      tree.tree.length !== 1 ||
      !jsonObject(tree.tree[0]) ||
      tree.tree[0].path !== STATE_FILE ||
      tree.tree[0].type !== 'blob' ||
      tree.tree[0].mode !== '100644' ||
      !validSha(tree.tree[0].sha)
    )
      fail('GitHub IndexNow state branch must contain only state.json')
    const blob = await request(`/git/blobs/${tree.tree[0].sha}`)
    if (
      !jsonObject(blob) ||
      blob.sha !== tree.tree[0].sha ||
      blob.encoding !== 'base64' ||
      typeof blob.content !== 'string' ||
      !Number.isSafeInteger(blob.size) ||
      blob.size < 0 ||
      blob.size > MAX_STATE_BYTES
    )
      fail('GitHub IndexNow state file was invalid')
    if (blob.content.length > Math.ceil(MAX_STATE_BYTES / 3) * 4 * 1.1) {
      fail('GitHub IndexNow state file exceeds the encoded size limit')
    }
    const encoded = blob.content.replace(/\n/g, '')
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
      fail('GitHub IndexNow state file encoding was invalid')
    }
    const bytes = Buffer.from(encoded, 'base64')
    if (bytes.length !== blob.size || bytes.length > MAX_STATE_BYTES)
      fail('GitHub IndexNow state file size was invalid')
    let state
    try {
      const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      state = JSON.parse(content)
    } catch {
      fail('GitHub IndexNow state file was not valid UTF-8 JSON')
    }
    if (!jsonObject(state)) fail('GitHub IndexNow state must be a JSON object')
    return { version, state }
  }

  async function write({ expectedVersion, state } = {}) {
    if (!token) fail('A GitHub token is required to persist IndexNow state')
    if (expectedVersion !== null && !validSha(expectedVersion)) fail('An explicit IndexNow state version is required')
    const content = serializeState(state)
    // Reading the full state also fails closed if a branch/file was corrupted.
    const previous = await read()
    if (previous.version !== expectedVersion) fail('IndexNow state changed; reload state before writing', 'STALE_STATE')
    const blob = await request('/git/blobs', {
      method: 'POST',
      body: { content: Buffer.from(content, 'utf8').toString('base64'), encoding: 'base64' },
    })
    if (!jsonObject(blob) || !validSha(blob.sha)) fail('GitHub did not return an IndexNow state blob')
    const tree = await request('/git/trees', {
      method: 'POST',
      body: { tree: [{ path: STATE_FILE, mode: '100644', type: 'blob', sha: blob.sha }] },
    })
    if (!jsonObject(tree) || !validSha(tree.sha)) fail('GitHub did not return an IndexNow state tree')
    const commit = await request('/git/commits', {
      method: 'POST',
      body: {
        message: 'Record IndexNow notification state',
        tree: tree.sha,
        parents: expectedVersion === null ? [] : [expectedVersion],
      },
    })
    if (!jsonObject(commit) || !validSha(commit.sha)) fail('GitHub did not return an IndexNow state commit')
    // Never force a ref: a concurrent writer produces a sibling commit and
    // GitHub rejects this update instead of overwriting the winning receipt.
    const reference =
      expectedVersion === null
        ? await request('/git/refs', {
            method: 'POST',
            body: { ref: refName, sha: commit.sha },
            conflictCode: 'STALE_STATE',
          })
        : await request(`/git/refs/heads/${encodedBranch}`, {
            method: 'PATCH',
            body: { sha: commit.sha, force: false },
            conflictCode: 'STALE_STATE',
          })
    if (
      !jsonObject(reference) ||
      reference.ref !== refName ||
      reference.object?.type !== 'commit' ||
      reference.object.sha !== commit.sha
    ) {
      fail('GitHub did not confirm the IndexNow state reference')
    }
    return commit.sha
  }

  return { read, write }
}
