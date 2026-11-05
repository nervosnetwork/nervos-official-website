import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import ts from 'typescript'

const compiled = ts.transpileModule(fs.readFileSync('src/pages/api/kb/release.page.ts', 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText
const valid = {
  schemaVersion: 1,
  websiteSHA: 'a'.repeat(40),
  articleSHA: 'b'.repeat(40),
  articleBaselineSHA: 'c'.repeat(40),
  articleRepository: 'https://github.com/NervosEducationHub/EducationHubArticles.git',
  contentSource: 'main',
  workingTree: false,
}
async function invoke({ method = 'GET', record = valid, unavailable = false } = {}) {
  const loaded = { exports: {} }
  const require = name => {
    if (name === 'node:path') return path
    if (name === 'node:fs/promises')
      return {
        readFile: async () => {
          if (unavailable) throw new Error('A private filesystem error that must not be exposed')
          return JSON.stringify(record)
        },
      }
    throw new Error(`Unexpected dependency ${name}`)
  }
  new Function('require', 'module', 'exports', compiled)(require, loaded, loaded.exports)
  const response = {
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value
    },
    status(code) {
      this.code = code
      return this
    },
    json(value) {
      this.body = value
    },
    end() {
      this.ended = true
    },
  }
  await loaded.exports.default({ method }, response)
  return response
}

test('release API exposes only whitelisted provenance with no browser/CDN caching', async () => {
  const response = await invoke({ record: { ...valid, privateToken: 'must-not-be-exposed' } })
  assert.equal(response.code, 200)
  assert.deepEqual(response.body, valid)
  for (const name of ['Cache-Control', 'CDN-Cache-Control', 'Vercel-CDN-Cache-Control'])
    assert.match(response.headers[name], /no-store/)
})

test('HEAD has the same success/failure status but no response body', async () => {
  for (const unavailable of [false, true]) {
    const response = await invoke({ method: 'HEAD', unavailable })
    assert.equal(response.code, unavailable ? 503 : 200)
    assert.equal(response.body, undefined)
    assert.equal(response.ended, true)
  }
})

test('missing or malformed release files fail closed without exposing private errors', async () => {
  for (const options of [
    { unavailable: true },
    { record: { ...valid, articleSHA: ['b'.repeat(40)] } },
    { record: { ...valid, contentSource: 'latest' } },
  ]) {
    const response = await invoke(options)
    assert.equal(response.code, 503)
    assert.deepEqual(response.body, { error: 'Release provenance is unavailable' })
  }
})

test('only GET and HEAD are supported', async () => {
  const response = await invoke({ method: 'POST' })
  assert.equal(response.code, 405)
  assert.equal(response.headers.Allow, 'GET, HEAD')
})
