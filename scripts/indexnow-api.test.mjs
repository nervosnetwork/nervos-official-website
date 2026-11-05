import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../src/pages/api/indexnow/[document].page.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText
const repository = '/mock/indexnow-website'
const noNetwork = () => assert.fail('The public snapshot API must never make a network request')

function fixture({ content = '{"revision":"fixture"}\n', failure } = {}) {
  const reads = []
  const imports = {
    'node:path': path,
    'node:fs/promises': {
      readFile: async (filename, encoding) => {
        reads.push({ filename, encoding })
        if (failure) throw failure
        return content
      },
    },
  }
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'process', 'fetch', compiled)(
    name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected API dependency: ${name}`)
      return imports[name]
    },
    loaded,
    loaded.exports,
    { cwd: () => repository },
    noNetwork,
  )
  const calls = []
  const headers = new Headers()
  const response = {
    statusCode: undefined,
    setHeader(name, value) {
      headers.set(name, value)
      calls.push({ method: 'setHeader', name, value })
      return response
    },
    status(value) {
      response.statusCode = value
      calls.push({ method: 'status', value })
      return response
    },
    json(value) {
      calls.push({ method: 'json', value })
      return response
    },
    send(value) {
      calls.push({ method: 'send', value })
      return response
    },
    end() {
      calls.push({ method: 'end' })
      return response
    },
  }
  return {
    reads,
    calls,
    headers,
    response,
    invoke: (method, document) => loaded.exports.default({ method, query: { document } }, response),
  }
}

function assertHeaders(f) {
  for (const header of ['Cache-Control', 'CDN-Cache-Control', 'Vercel-CDN-Cache-Control']) {
    assert.equal(f.headers.get(header), 'no-store', `${header} prevents stale production markers`)
  }
  assert.equal(f.headers.get('Content-Type'), 'application/json; charset=utf-8')
  const firstStatus = f.calls.findIndex(call => call.method === 'status')
  assert(firstStatus >= 4, 'All no-store and JSON headers are set before any response is sent')
  assert.equal(f.calls.filter(call => ['send', 'json', 'end'].includes(call.method)).length, 1, 'Respond exactly once')
}

test('GET release/manifest reads only the corresponding literal build snapshot and returns exact JSON bytes', async () => {
  for (const document of ['release', 'manifest']) {
    const content = `${JSON.stringify({ document, schemaVersion: 1 })}\n`
    const f = fixture({ content })
    await f.invoke('GET', document)
    assert.equal(f.response.statusCode, 200)
    assert.deepEqual(f.reads, [
      { filename: path.join(repository, `public/indexnow-${document}.json`), encoding: 'utf8' },
    ])
    assert.deepEqual(f.calls.at(-1), { method: 'send', value: content })
    assert.equal(f.headers.has('Allow'), false)
    assertHeaders(f)
  }
})

test('HEAD release/manifest verifies the file exists but sends no response body', async () => {
  for (const document of ['release', 'manifest']) {
    const f = fixture()
    await f.invoke('HEAD', document)
    assert.equal(f.response.statusCode, 200)
    assert.equal(f.reads.length, 1)
    assert.equal(f.reads[0].filename, path.join(repository, `public/indexnow-${document}.json`))
    assert.deepEqual(f.calls.at(-1), { method: 'end' })
    assertHeaders(f)
  }
})

test('unsupported and missing methods return 405 with Allow, without reading a file', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'get', undefined, '']) {
    const f = fixture()
    await f.invoke(method, 'release')
    assert.equal(f.response.statusCode, 405)
    assert.equal(f.headers.get('Allow'), 'GET, HEAD')
    assert.deepEqual(f.calls.at(-1), { method: 'json', value: { error: 'Method not allowed' } })
    assert.deepEqual(f.reads, [])
    assertHeaders(f)
  }
})

test('unknown, missing, array and traversal-like document names return 404 without filesystem access', async () => {
  for (const document of [
    undefined,
    null,
    '',
    'Release',
    'other',
    'state',
    'release.json',
    '../manifest',
    '../../.env',
    '/release',
    '%2e%2e',
    ['release'],
    ['manifest', 'release'],
  ]) {
    const f = fixture()
    await f.invoke('GET', document)
    assert.equal(f.response.statusCode, 404)
    assert.deepEqual(f.calls.at(-1), { method: 'json', value: { error: 'Not found' } })
    assert.deepEqual(f.reads, [])
    assertHeaders(f)
  }
})

test('snapshot read failures return generic 503 without exposing filesystem paths, secrets or raw errors', async () => {
  for (const document of ['release', 'manifest']) {
    for (const failure of [
      Object.assign(new Error('ENOENT /private/secret/path TOKEN=do-not-print'), { code: 'ENOENT' }),
      Object.assign(new Error('EACCES private-data'), { code: 'EACCES' }),
      new Error('unexpected read failure'),
    ]) {
      const f = fixture({ failure })
      await f.invoke('GET', document)
      assert.equal(f.response.statusCode, 503)
      assert.deepEqual(f.calls.at(-1), { method: 'json', value: { error: 'Release snapshot unavailable' } })
      assert.equal(f.reads.length, 1)
      assert.doesNotMatch(JSON.stringify(f.calls.at(-1)), /TOKEN|secret|private|ENOENT|EACCES|unexpected read failure/)
      assertHeaders(f)
    }
  }
})

test('HEAD error responses also have no body and retain all three no-store headers', async () => {
  const missing = fixture()
  await missing.invoke('HEAD', 'unknown')
  assert.equal(missing.response.statusCode, 404)
  assert.deepEqual(missing.reads, [])
  assert.deepEqual(missing.calls.at(-1), { method: 'end' })
  assertHeaders(missing)
  const unavailable = fixture({ failure: new Error('private file error') })
  await unavailable.invoke('HEAD', 'release')
  assert.equal(unavailable.response.statusCode, 503)
  assert.equal(unavailable.reads.length, 1)
  assert.deepEqual(unavailable.calls.at(-1), { method: 'end' })
  assertHeaders(unavailable)
})
