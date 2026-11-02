import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import {
  INDEXNOW_BATCH_SIZE,
  INDEXNOW_ENDPOINT,
  INDEXNOW_KEY,
  INDEXNOW_KEY_URL,
  INDEXNOW_ORIGIN,
} from '../config/indexnow.mjs'
import { createPayloads, normalizeUrls, runIndexNow } from './indexnow.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const sample = `${INDEXNOW_ORIGIN}/knowledge-base/example`
const urls = count => Array.from({ length: count }, (_, index) => `${INDEXNOW_ORIGIN}/knowledge-base/article-${index}`)
const forbiddenFetch = () => assert.fail('This operation must not perform any network request')
const keyResponse = (body = INDEXNOW_KEY, contentType = 'text/plain; charset=utf-8', status = 200) => {
  const response = new Response(status === 204 ? null : body, {
    status,
    headers: contentType === null ? {} : { 'Content-Type': contentType },
  })
  // Response supplies text/plain automatically for a string body; remove that
  // default explicitly when simulating a server with no Content-Type header.
  if (contentType === null) response.headers.delete('content-type')
  return response
}

function requestOptions(options, method) {
  assert.equal(options.method, method)
  assert.equal(options.redirect, 'error', 'Never follow an unverified redirect')
  assert.ok(options.signal instanceof AbortSignal, 'Every request has a timeout/abort signal')
  assert.equal(options.signal.aborted, false)
}

test('the supplied public verification file and exact Next header rule agree with the shared config', async () => {
  assert.equal(INDEXNOW_ORIGIN, 'https://www.nervos.org')
  assert.equal(INDEXNOW_ENDPOINT, 'https://api.indexnow.org/indexnow')
  assert.equal(INDEXNOW_BATCH_SIZE, 10_000)
  assert.match(INDEXNOW_KEY, /^[A-Za-z0-9-]{8,128}$/)
  assert.equal(INDEXNOW_KEY_URL, `${INDEXNOW_ORIGIN}/${INDEXNOW_KEY}.txt`)
  const keyFile = fs.readFileSync(path.join(root, 'public', `${INDEXNOW_KEY}.txt`), 'utf8')
  assert.ok([INDEXNOW_KEY, `${INDEXNOW_KEY}\n`, `${INDEXNOW_KEY}\r\n`].includes(keyFile))
  process.env.SKIP_ENV_VALIDATION = '1'
  const { default: config } = await import('../next.config.mjs')
  const rules = (await config.headers()).filter(rule => rule.source === `/${INDEXNOW_KEY}.txt`)
  assert.equal(rules.length, 1)
  assert.equal(rules[0].locale, false, 'The verification endpoint is at the unprefixed root')
  const headers = new Headers(rules[0].headers.map(({ key, value }) => [key, value]))
  assert.match(headers.get('content-type'), /^text\/plain;\s*charset=utf-8$/i)
  const commands = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).scripts
  assert.equal(commands.indexnow, 'node scripts/indexnow.mjs')
  for (const command of ['build', 'dev', 'start']) {
    assert.doesNotMatch(
      commands[command],
      /scripts\/indexnow(?:-deploy)?\.mjs\b/,
      `${command} must not submit notifications`,
    )
  }
})

test('normalization accepts only production URLs, preserves meaningful paths/queries and deduplicates without mutation', () => {
  const input = [
    sample,
    sample,
    'https://WWW.NERVOS.ORG:443/knowledge-base/example',
    `${INDEXNOW_ORIGIN}/zh/knowledge-base/中文`,
    `${INDEXNOW_ORIGIN}/knowledge-base/old%20article`,
    `${INDEXNOW_ORIGIN}/knowledge-base/articles?page=2&tag=one&tag=two`,
    `${INDEXNOW_ORIGIN}/knowledge-base/deleted_article`,
  ]
  const before = [...input]
  assert.deepEqual(normalizeUrls(input), [
    sample,
    `${INDEXNOW_ORIGIN}/zh/knowledge-base/%E4%B8%AD%E6%96%87`,
    `${INDEXNOW_ORIGIN}/knowledge-base/old%20article`,
    `${INDEXNOW_ORIGIN}/knowledge-base/articles?page=2&tag=one&tag=two`,
    `${INDEXNOW_ORIGIN}/knowledge-base/deleted_article`,
  ])
  assert.deepEqual(input, before)
  assert.deepEqual(normalizeUrls([]), [])
})

test('invalid inputs cannot be repaired silently into production submissions', () => {
  for (const input of [undefined, null, {}, sample, 1, true]) assert.throws(() => normalizeUrls(input))
  for (const sparse of [new Array(1), Object.assign(new Array(2), { 1: sample })]) {
    assert.throws(() => normalizeUrls(sparse), /Each URL must be absolute HTTPS/, 'Empty array slots are not URLs')
    assert.throws(() => createPayloads(sparse), /Each URL must be absolute HTTPS/)
  }
  for (const value of [
    null,
    {},
    42,
    true,
    '',
    '/knowledge-base/example',
    '//www.nervos.org/example',
    'http://www.nervos.org/example',
    'https:/www.nervos.org/example',
    'https:www.nervos.org/example',
    'https://nervos.org/example',
    'https://preview.vercel.app/example',
    'https://localhost/example',
    'https://www.nervos.org.evil.test/example',
    'https://evil.test/www.nervos.org/example',
    'https://www.nervos.org./example',
    'https://www.nervos.org:8443/example',
    'https://www.nervos.org:80/example',
    'https://user@www.nervos.org/example',
    'https://user:password@www.nervos.org/example',
    `${sample}#section`,
    `${sample}#`,
    ` ${sample}`,
    `${sample}\n`,
    `${sample}\t`,
    `${sample}\u00a0`,
    `${INDEXNOW_ORIGIN}/two words`,
    'https://www.nervos.org\\example',
  ]) {
    assert.throws(() => normalizeUrls([sample, value]), `Reject ${JSON.stringify(value)}`)
    assert.throws(() => createPayloads([sample, value]), 'Payload generation validates the entire input')
  }
})

test('payloads have the protocol fields and never exceed 10,000 unique URLs', () => {
  for (const count of [0, 1, 9999, 10_000, 10_001, 20_001]) {
    const input = urls(count)
    const payloads = createPayloads([...input, ...input.slice(0, 2)])
    assert.equal(payloads.length, Math.ceil(count / INDEXNOW_BATCH_SIZE))
    assert.deepEqual(
      payloads.flatMap(payload => payload.urlList),
      input,
    )
    for (const payload of payloads) {
      assert.deepEqual(Object.keys(payload).sort(), ['host', 'key', 'keyLocation', 'urlList'])
      assert.equal(payload.host, 'www.nervos.org')
      assert.equal(payload.key, INDEXNOW_KEY)
      assert.equal(payload.keyLocation, INDEXNOW_KEY_URL)
      assert.ok(payload.urlList.length > 0 && payload.urlList.length <= 10_000)
    }
  }
})

test('dry-run and empty batches are entirely offline', async () => {
  const receipt = await runIndexNow({ urls: [sample, sample], fetchImpl: forbiddenFetch })
  assert.deepEqual(receipt, {
    mode: 'dry-run',
    status: 'dry-run',
    urlCount: 1,
    batches: [{ urls: [sample], status: 'planned' }],
  })
  for (const submit of [false, true]) {
    assert.deepEqual(await runIndexNow({ urls: [], submit, productionDeployed: true, fetchImpl: forbiddenFetch }), {
      mode: submit ? 'submit' : 'dry-run',
      status: 'empty',
      urlCount: 0,
      batches: [],
    })
  }
  const confirmationOnly = await runIndexNow({ urls: [sample], productionDeployed: true, fetchImpl: forbiddenFetch })
  assert.equal(confirmationOnly.mode, 'dry-run', 'Production confirmation alone does not authorize submission')
  await assert.rejects(
    runIndexNow({
      urls: [sample, 'https://evil.test/'],
      submit: true,
      productionDeployed: true,
      fetchImpl: forbiddenFetch,
    }),
    /Only https:\/\/www\.nervos\.org/,
    'A bad URL later in the array must fail before even the verification GET',
  )
})

test('submission requires literal production confirmation before any request', async () => {
  for (const productionDeployed of [undefined, false]) {
    await assert.rejects(
      runIndexNow({ urls: [sample], submit: true, productionDeployed, fetchImpl: forbiddenFetch }),
      error => {
        assert.equal(error.name, 'IndexNowError')
        assert.equal(error.receipt.urlCount, 1)
        assert.ok(error.receipt.batches.every(batch => batch.status === 'planned'))
        return true
      },
    )
  }
  for (const invalid of [null, '', 'false', 'true', 1]) {
    await assert.rejects(
      runIndexNow({ urls: [sample], submit: true, productionDeployed: invalid, fetchImpl: forbiddenFetch }),
      /explicit booleans/,
    )
    await assert.rejects(
      runIndexNow({ urls: [sample], submit: invalid, productionDeployed: true, fetchImpl: forbiddenFetch }),
      /explicit booleans/,
    )
  }
})

test('key preflight permits only the exact key with an optional single LF or CRLF', async () => {
  for (const body of [INDEXNOW_KEY, `${INDEXNOW_KEY}\n`, `${INDEXNOW_KEY}\r\n`]) {
    const calls = []
    const receipt = await runIndexNow({
      urls: [sample],
      submit: true,
      productionDeployed: true,
      fetchImpl: async (url, options) => {
        calls.push(url)
        requestOptions(options, calls.length === 1 ? 'GET' : 'POST')
        if (calls.length === 1) return keyResponse(body, 'Text/Plain; charset=UTF-8')
        assert.equal(url, INDEXNOW_ENDPOINT)
        assert.match(new Headers(options.headers).get('content-type'), /^application\/json;\s*charset=utf-8$/i)
        assert.deepEqual(JSON.parse(options.body), createPayloads([sample])[0])
        return new Response(null, { status: 200 })
      },
    })
    assert.deepEqual(calls, [INDEXNOW_KEY_URL, INDEXNOW_ENDPOINT])
    assert.equal(receipt.mode, 'submit')
    assert.equal(receipt.status, 'accepted')
    assert.deepEqual(receipt.batches, [{ urls: [sample], status: 'accepted', httpStatus: 200 }])
  }
})

test('bad key status, MIME, bytes or transport prevent every POST', async () => {
  const cases = [
    () => keyResponse(INDEXNOW_KEY, 'text/plain', 301),
    () => keyResponse(INDEXNOW_KEY, 'text/plain', 404),
    () => keyResponse(INDEXNOW_KEY, 'text/plain', 503),
    ...['text/html', 'application/json', 'text/plainx', null].map(type => () => keyResponse(INDEXNOW_KEY, type)),
    () => keyResponse(new Uint8Array([0xff, 0xfe])),
    ...[
      '',
      'wrong-key',
      ` ${INDEXNOW_KEY}`,
      `${INDEXNOW_KEY} `,
      `${INDEXNOW_KEY}\n\n`,
      `${INDEXNOW_KEY}\r`,
      `\uFEFF${INDEXNOW_KEY}`,
      `<html>${INDEXNOW_KEY}</html>`,
    ].map(body => () => keyResponse(body)),
    () => {
      throw new DOMException('timed out', 'TimeoutError')
    },
  ]
  for (const response of cases) {
    let calls = 0
    await assert.rejects(
      runIndexNow({
        urls: [sample],
        submit: true,
        productionDeployed: true,
        fetchImpl: async (url, options) => {
          calls += 1
          assert.equal(url, INDEXNOW_KEY_URL)
          requestOptions(options, 'GET')
          return response()
        },
      }),
      error => {
        assert.equal(error.name, 'IndexNowError')
        assert.equal(error.receipt.status, 'failed')
        assert.deepEqual(error.receipt.batches, [{ urls: [sample], status: 'planned' }])
        return true
      },
    )
    assert.equal(calls, 1, 'No retry and no POST after failed verification')
  }
})

test('batches are sequential and any HTTP 202 remains pending validation rather than indexed', async () => {
  const input = urls(20_001)
  let postCount = 0
  let inFlight = false
  const posted = []
  const receipt = await runIndexNow({
    urls: input,
    submit: true,
    productionDeployed: true,
    fetchImpl: async (url, options) => {
      if (url === INDEXNOW_KEY_URL) return keyResponse()
      assert.equal(url, INDEXNOW_ENDPOINT)
      requestOptions(options, 'POST')
      assert.equal(inFlight, false, 'The preceding POST must finish before the next starts')
      inFlight = true
      posted.push(JSON.parse(options.body).urlList)
      await new Promise(resolve => setImmediate(resolve))
      inFlight = false
      return new Response(null, { status: postCount++ === 1 ? 202 : 200 })
    },
  })
  assert.deepEqual(
    posted.map(batch => batch.length),
    [10_000, 10_000, 1],
  )
  assert.deepEqual(posted.flat(), input)
  assert.equal(receipt.urlCount, input.length)
  assert.equal(receipt.status, 'pending-validation')
  assert.deepEqual(
    receipt.batches.map(batch => batch.status),
    ['accepted', 'pending-validation', 'accepted'],
  )
  assert.deepEqual(
    receipt.batches.map(batch => batch.httpStatus),
    [200, 202, 200],
  )
  assert.doesNotMatch(JSON.stringify(receipt), /indexed/)
})

test('all non-200/202 POST responses fail once and keep the batch receipt', async () => {
  for (const status of [204, 301, 400, 403, 422, 429, 500, 503]) {
    let posts = 0
    await assert.rejects(
      runIndexNow({
        urls: [sample],
        submit: true,
        productionDeployed: true,
        fetchImpl: async url => {
          if (url === INDEXNOW_KEY_URL) return keyResponse()
          posts += 1
          return new Response(null, { status })
        },
      }),
      error => {
        assert.equal(error.name, 'IndexNowError')
        assert.equal(error.receipt.status, 'failed')
        assert.deepEqual(error.receipt.batches, [{ urls: [sample], status: 'failed', httpStatus: status }])
        return true
      },
    )
    assert.equal(posts, 1, `No automatic retry for HTTP ${status}`)
  }
})

test('partial failure retains earlier accepted/pending batches and leaves later batches unsent', async () => {
  const input = urls(20_001)
  for (const firstStatus of [200, 202]) {
    let posts = 0
    await assert.rejects(
      runIndexNow({
        urls: input,
        submit: true,
        productionDeployed: true,
        fetchImpl: async url => {
          if (url === INDEXNOW_KEY_URL) return keyResponse()
          return new Response(null, { status: posts++ === 0 ? firstStatus : 503 })
        },
      }),
      error => {
        assert.equal(error.name, 'IndexNowError')
        assert.equal(error.receipt.mode, 'submit')
        assert.equal(error.receipt.status, 'failed')
        assert.equal(error.receipt.urlCount, input.length)
        assert.deepEqual(error.receipt.batches, [
          {
            urls: input.slice(0, 10_000),
            status: firstStatus === 200 ? 'accepted' : 'pending-validation',
            httpStatus: firstStatus,
          },
          { urls: input.slice(10_000, 20_000), status: 'failed', httpStatus: 503 },
          { urls: input.slice(20_000), status: 'planned' },
        ])
        return true
      },
    )
    assert.equal(posts, 2)
  }
})

test('POST transport failures keep an explicit failed batch without inventing an HTTP result', async () => {
  let posts = 0
  await assert.rejects(
    runIndexNow({
      urls: [sample],
      submit: true,
      productionDeployed: true,
      fetchImpl: async url => {
        if (url === INDEXNOW_KEY_URL) return keyResponse()
        posts += 1
        throw new DOMException('timed out', 'TimeoutError')
      },
    }),
    error => {
      assert.equal(error.name, 'IndexNowError')
      assert.deepEqual(error.receipt.batches, [{ urls: [sample], status: 'failed' }])
      return true
    },
  )
  assert.equal(posts, 1)
})

function cli(args) {
  const filename = path.join(root, 'scripts/indexnow.mjs')
  const script = `
    let requests = 0;
    globalThis.fetch = async () => { requests++; throw new Error('TEST_NETWORK_FORBIDDEN'); };
    process.on('exit', () => { if (requests) process.exitCode = 97; });
    process.argv = [process.execPath, ${JSON.stringify(filename)}, ...${JSON.stringify(args)}];
    await import(${JSON.stringify(pathToFileURL(filename).href)});
  `
  return spawnSync(process.execPath, ['--input-type=module', '--eval', script], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5000,
  })
}

test('the real CLI is offline by default and rejects malformed/duplicate options and non-JSON input', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-indexnow-test-'))
  const valid = path.join(directory, 'changed.json')
  const invalid = path.join(directory, 'invalid.json')
  const nonArray = path.join(directory, 'non-array.json')
  fs.writeFileSync(valid, JSON.stringify([sample, sample]))
  fs.writeFileSync(invalid, 'not JSON')
  fs.writeFileSync(nonArray, JSON.stringify({ urls: [sample] }))
  t.after(() => {
    for (const filename of [valid, invalid, nonArray]) fs.unlinkSync(filename)
    fs.rmdirSync(directory)
  })
  for (const flags of [[], ['--production-deployed']]) {
    const result = cli(['--urls', valid, ...flags])
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stderr, '')
    assert.deepEqual(JSON.parse(result.stdout), {
      mode: 'dry-run',
      status: 'dry-run',
      urlCount: 1,
      batches: [{ urls: [sample], status: 'planned' }],
    })
  }
  for (const args of [
    [],
    ['--urls'],
    ['--urls', '--submit'],
    ['--urls', invalid],
    ['--urls', nonArray],
    ['--urls', valid, '--submit'],
    ['--urls', valid, '--unknown'],
    ['--urls', valid, '--submit=true'],
    ['--urls', valid, '--urls', valid],
    ['--urls', valid, '--submit', '--submit'],
    ['--urls', valid, '--production-deployed', '--production-deployed'],
  ]) {
    const result = cli(args)
    assert.equal(result.status, 1, `${JSON.stringify(args)}: ${result.stderr}`)
    assert.equal(result.stdout, '')
    assert.equal(typeof JSON.parse(result.stderr).error, 'string')
    assert.doesNotMatch(result.stderr, /TEST_NETWORK_FORBIDDEN/)
  }
})

test('submission waits for durable initial and per-batch sending intent before network POST', async () => {
  let releaseInitial
  let releaseIntent
  let initialStarted = false
  let intentStarted = false
  let requests = 0
  let posts = 0
  const initialSaved = new Promise(resolve => {
    releaseInitial = resolve
  })
  const intentSaved = new Promise(resolve => {
    releaseIntent = resolve
  })
  const pending = runIndexNow({
    urls: [sample],
    submit: true,
    productionDeployed: true,
    onProgress: async receipt => {
      if (receipt.batches[0].status === 'planned') {
        initialStarted = true
        await initialSaved
      }
      if (receipt.batches[0].status === 'sending') {
        intentStarted = true
        await intentSaved
      }
    },
    fetchImpl: async url => {
      requests += 1
      if (url === INDEXNOW_KEY_URL) return keyResponse()
      posts += 1
      return new Response(null, { status: 200 })
    },
  })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(initialStarted, true)
  assert.equal(requests, 0, 'Even the verification GET waits for saved initial intent')
  releaseInitial()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(intentStarted, true)
  assert.equal(requests, 1)
  assert.equal(posts, 0, 'POST waits until sending intent is durable')
  releaseIntent()
  assert.equal((await pending).status, 'accepted')
  assert.equal(posts, 1)
})

test('failure to persist initial or sending intent prevents the external notification', async () => {
  for (const failOn of ['planned', 'sending']) {
    let requests = 0
    let posts = 0
    await assert.rejects(
      runIndexNow({
        urls: [sample],
        submit: true,
        productionDeployed: true,
        onProgress: async receipt => {
          if (receipt.batches[0].status === failOn) throw new Error('PRIVATE_STORAGE_ERROR')
        },
        fetchImpl: async url => {
          requests += 1
          if (url === INDEXNOW_KEY_URL) return keyResponse()
          posts += 1
          return new Response(null, { status: 200 })
        },
      }),
      error => {
        assert.equal(error.name, 'IndexNowError')
        assert.match(error.message, /persist notification progress/)
        assert.doesNotMatch(error.message, /PRIVATE_STORAGE_ERROR/)
        return true
      },
    )
    assert.equal(requests, failOn === 'planned' ? 0 : 1)
    assert.equal(posts, 0)
  }
})

test('a later production gate failure retains earlier acceptance and leaves remaining batches unsent', async () => {
  const input = urls(20_001)
  const snapshots = []
  let gates = 0
  let posts = 0
  await assert.rejects(
    runIndexNow({
      urls: input,
      submit: true,
      productionDeployed: true,
      beforeBatch: async () => {
        gates += 1
        if (gates === 2) throw new Error('Production revision changed')
      },
      onProgress: async receipt => {
        snapshots.push(receipt)
      },
      fetchImpl: async url => {
        if (url === INDEXNOW_KEY_URL) return keyResponse()
        posts += 1
        return new Response(null, { status: 200 })
      },
    }),
    error => {
      assert.equal(error.receipt.status, 'failed')
      assert.deepEqual(
        error.receipt.batches.map(batch => batch.status),
        ['accepted', 'failed', 'planned'],
      )
      assert.equal(error.receipt.batches[0].httpStatus, 200)
      assert.equal(error.receipt.batches[1].httpStatus, undefined)
      return true
    },
  )
  assert.equal(posts, 1)
  assert.equal(gates, 2)
  assert.deepEqual(
    snapshots.at(-1).batches.map(batch => batch.status),
    ['accepted', 'failed', 'planned'],
  )
})

test('progress hooks receive detached snapshots and cannot mutate payloads or live receipts', async () => {
  const snapshots = []
  const expected = [sample]
  const receipt = await runIndexNow({
    urls: expected,
    submit: true,
    productionDeployed: true,
    onProgress: async snapshot => {
      snapshots.push(structuredClone(snapshot))
      snapshot.status = 'MUTATED'
      snapshot.batches[0].status = 'MUTATED'
      snapshot.batches[0].urls[0] = 'https://evil.test/'
      snapshot.batches.push({ urls: [], status: 'MUTATED' })
    },
    fetchImpl: async (url, options) => {
      if (url === INDEXNOW_KEY_URL) return keyResponse()
      assert.deepEqual(JSON.parse(options.body).urlList, expected)
      return new Response(null, { status: 200 })
    },
  })
  assert.equal(receipt.status, 'accepted')
  assert.deepEqual(receipt.batches, [{ urls: expected, status: 'accepted', httpStatus: 200 }])
  assert.deepEqual(
    snapshots.map(snapshot => snapshot.batches[0].status),
    ['planned', 'sending', 'accepted', 'accepted'],
  )
  assert.equal(snapshots[0].status, 'submitting')
  assert.equal(snapshots[0].batches[0].httpStatus, undefined, 'An earlier snapshot must stay unchanged')
})

test('failure to persist an accepted receipt stops later batches without erasing acceptance', async () => {
  const input = urls(20_001)
  let posts = 0
  let savedSending = false
  await assert.rejects(
    runIndexNow({
      urls: input,
      submit: true,
      productionDeployed: true,
      onProgress: async receipt => {
        if (receipt.batches[0].status === 'sending') savedSending = true
        if (receipt.batches[0].status === 'accepted') throw new Error('Persist result failed')
      },
      fetchImpl: async url => {
        if (url === INDEXNOW_KEY_URL) return keyResponse()
        posts += 1
        return new Response(null, { status: 200 })
      },
    }),
    error => {
      assert.match(error.message, /persist notification progress/)
      assert.deepEqual(
        error.receipt.batches.map(batch => batch.status),
        ['accepted', 'planned', 'planned'],
      )
      assert.equal(error.receipt.batches[0].httpStatus, 200)
      return true
    },
  )
  assert.equal(posts, 1)
  assert.equal(savedSending, true)
})

test('failure to persist terminal receipt is reported even after all batches were accepted', async () => {
  let posts = 0
  await assert.rejects(
    runIndexNow({
      urls: [sample],
      submit: true,
      productionDeployed: true,
      onProgress: async receipt => {
        if (receipt.status === 'accepted') throw new Error('Terminal receipt failed')
      },
      fetchImpl: async url => {
        if (url === INDEXNOW_KEY_URL) return keyResponse()
        posts += 1
        return new Response(null, { status: 200 })
      },
    }),
    error => {
      assert.match(error.message, /persist notification progress/)
      assert.equal(error.receipt.status, 'accepted')
      assert.equal(error.receipt.batches[0].status, 'accepted')
      return true
    },
  )
  assert.equal(posts, 1)
})

test('dry-run and empty notifications never call persistence or production hooks', async () => {
  const forbiddenHook = async () => assert.fail('Offline/empty operation must not call a hook')
  for (const settings of [
    { urls: [sample], submit: false },
    { urls: [], submit: false },
    { urls: [], submit: true, productionDeployed: true },
  ]) {
    const receipt = await runIndexNow({
      ...settings,
      onProgress: forbiddenHook,
      beforeBatch: forbiddenHook,
      fetchImpl: forbiddenFetch,
    })
    assert.ok(['dry-run', 'empty'].includes(receipt.status))
  }
  for (const field of ['onProgress', 'beforeBatch']) {
    await assert.rejects(runIndexNow({ urls: [sample], [field]: null, fetchImpl: forbiddenFetch }), /must be functions/)
  }
})
