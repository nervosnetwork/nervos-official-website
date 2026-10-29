import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  INDEXNOW_BATCH_SIZE,
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  INDEXNOW_KEY_URL,
  INDEXNOW_ORIGIN,
} from '../config/indexnow.mjs'

const REQUEST_TIMEOUT_MS = 15_000

export function normalizeUrls(urls) {
  if (!Array.isArray(urls)) throw new Error('Expected a JSON array of changed production URLs')
  return [
    ...new Set(
      Array.from(urls, value => {
        if (typeof value !== 'string' || !/^https:\/\//.test(value) || /[\s\\#]/u.test(value)) {
          throw new Error('Each URL must be absolute HTTPS, without whitespace, backslashes or fragments')
        }
        const url = new URL(value)
        if (url.origin !== INDEXNOW_ORIGIN || url.username || url.password) {
          throw new Error(`Only ${INDEXNOW_ORIGIN} URLs without credentials are allowed`)
        }
        return url.href
      }),
    ),
  ]
}

export function createPayloads(urls) {
  const uniqueUrls = normalizeUrls(urls)
  const payloads = []
  for (let start = 0; start < uniqueUrls.length; start += INDEXNOW_BATCH_SIZE) {
    payloads.push({
      host: new URL(INDEXNOW_ORIGIN).host,
      key: INDEXNOW_KEY,
      keyLocation: INDEXNOW_KEY_URL,
      urlList: uniqueUrls.slice(start, start + INDEXNOW_BATCH_SIZE),
    })
  }
  return payloads
}

export class IndexNowError extends Error {
  constructor(message, receipt) {
    super(message)
    this.name = 'IndexNowError'
    this.receipt = receipt
  }
}

// No network requests unless both explicit production flags are set. The caller
// must verify that the intended release is serving on the production domain.
// Input may include deleted URLs: do not filter it against the current sitemap.
export async function runIndexNow({ urls, submit = false, productionDeployed = false, fetchImpl = globalThis.fetch }) {
  if (typeof submit !== 'boolean' || typeof productionDeployed !== 'boolean') {
    throw new Error('Submission and production confirmation must be explicit booleans')
  }
  const payloads = createPayloads(urls)
  const receipt = {
    mode: submit ? 'submit' : 'dry-run',
    status: payloads.length ? 'dry-run' : 'empty',
    urlCount: payloads.reduce((count, payload) => count + payload.urlList.length, 0),
    batches: payloads.map(payload => ({ urls: payload.urlList, status: 'planned' })),
  }
  if (submit && !productionDeployed) {
    throw new IndexNowError('Submission requires --production-deployed after verifying the live release', receipt)
  }
  if (!submit || !payloads.length) return receipt

  receipt.status = 'failed'
  try {
    const verification = await fetchImpl(INDEXNOW_KEY_URL, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (verification.status !== 200) throw new Error(`Key file returned HTTP ${verification.status}; expected 200`)
    if (!/^text\/plain(?:\s*;|\s*$)/i.test(verification.headers.get('content-type') || '')) {
      throw new Error('Key file must return text/plain')
    }
    // A conventional final LF/CRLF is harmless; HTML, BOM and extra text are not.
    const keyBody = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await verification.arrayBuffer())
    if (![INDEXNOW_KEY, `${INDEXNOW_KEY}\n`, `${INDEXNOW_KEY}\r\n`].includes(keyBody)) {
      throw new Error('Key file does not contain only the expected verification key')
    }
  } catch (error) {
    throw new IndexNowError(`Production key verification failed: ${error.message}`, receipt)
  }

  for (const [index, payload] of payloads.entries()) {
    const batch = receipt.batches[index]
    try {
      const response = await fetchImpl(INDEXNOW_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
      batch.httpStatus = response.status
      if (response.status !== 200 && response.status !== 202) {
        throw new Error(`IndexNow returned HTTP ${response.status}`)
      }
      batch.status = response.status === 202 ? 'pending-validation' : 'accepted'
      // The protocol uses the status code; don't retain unused response streams.
      await response.body?.cancel()
    } catch (error) {
      batch.status = 'failed'
      throw new IndexNowError(`Batch ${index + 1} failed: ${error.message}`, receipt)
    }
  }
  receipt.status = receipt.batches.some(batch => batch.status === 'pending-validation')
    ? 'pending-validation'
    : 'accepted'
  return receipt
}

const USAGE = `Usage: node scripts/indexnow.mjs --urls <changed-urls.json> [--submit --production-deployed]

Default: offline dry-run. Input: JSON array of absolute https://www.nervos.org URLs.
--submit --production-deployed: explicitly confirm the intended production release
is live, verify the public key and send batches of at most 10,000 URLs.
200 means received; 202 means key validation pending. Neither means indexed.
Failed requests are not retried automatically; preserve the JSON receipt.
See docs/kb-indexnow.md for deployment integration and retry requirements.`

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(`${USAGE}\n`)
    return
  }
  const seen = new Set()
  let file
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!['--urls', '--submit', '--production-deployed'].includes(arg) || seen.has(arg)) {
      throw new Error(`Unknown or duplicate option: ${arg}`)
    }
    seen.add(arg)
    if (arg === '--urls') {
      file = args[++index]
      if (!file || file.startsWith('--')) throw new Error('--urls requires a JSON file path')
    }
  }
  if (!file) throw new Error(USAGE)
  const urls = JSON.parse(await readFile(file, 'utf8'))
  const receipt = await runIndexNow({
    urls,
    submit: seen.has('--submit'),
    productionDeployed: seen.has('--production-deployed'),
  })
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write(`${JSON.stringify({ error: error.message, receipt: error.receipt }, null, 2)}\n`)
    process.exitCode = 1
  })
}
