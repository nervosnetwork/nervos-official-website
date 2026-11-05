import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { planIndexNow, stableHash } from './indexnow-manifest.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const ORIGIN = 'https://www.nervos.org'
const url = name => `${ORIGIN}/knowledge-base/${name}`

function manifest(entries, revision = 'a'.repeat(40)) {
  const payload = {
    schemaVersion: 1,
    origin: ORIGIN,
    revision,
    entries: entries
      .map(([entryUrl, letter]) => ({ url: entryUrl, hash: letter.repeat(64) }))
      .sort((a, b) => a.url.localeCompare(b.url)),
  }
  return { ...payload, digest: stableHash(payload) }
}

function fixture(t) {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-indexnow-plan-')))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const write = (name, contents) => {
    const filename = path.join(directory, name)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, typeof contents === 'string' ? contents : JSON.stringify(contents))
    return filename
  }
  return { directory, write }
}

function cli(args, cwd) {
  const filename = path.join(root, 'scripts/indexnow-plan.mjs')
  const source = `
    let requests = 0;
    globalThis.fetch = async () => { requests++; throw new Error('TEST_NETWORK_FORBIDDEN'); };
    process.on('exit', () => { if (requests) process.exitCode = 97; });
    process.argv = [process.execPath, ${JSON.stringify(filename)}, ...${JSON.stringify(args)}];
    await import(${JSON.stringify(pathToFileURL(filename).href)});
  `
  return spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    cwd,
    encoding: 'utf8',
    timeout: 5000,
  })
}

test('offline planner defaults to local generated manifest and KB-only scope', t => {
  const f = fixture(t)
  const current = manifest([
    [ORIGIN + '/', '1'],
    [ORIGIN + '/knowledge-base', '2'],
    [url('one'), '3'],
  ])
  f.write('public/indexnow-manifest.json', current)
  const result = cli([], f.directory)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '')
  const summary = JSON.parse(result.stdout)
  assert.equal(summary.mode, 'offline-plan')
  assert.equal(summary.initial, true)
  assert.equal(summary.scope, 'kb')
  assert.equal(summary.urlCount, 2)
  assert.deepEqual(summary.changes, { added: 2, updated: 0, deleted: 0 })
  const output = path.join(f.directory, 'indexnow-output/plan.json')
  assert.equal(summary.output, output)
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), planIndexNow({ manifest: current }))
  assert.equal(fs.existsSync(`${output}.tmp`), false, 'The finished output is atomically renamed')
})

test('offline planner includes reviewed site scope and existing language URLs only', t => {
  const f = fixture(t)
  const current = manifest([
    [ORIGIN + '/', '1'],
    [url('one'), '2'],
    [ORIGIN + '/zh/knowledge-base/one', '3'],
  ])
  const input = f.write('manifest.json', current)
  const output = path.join(f.directory, 'review/site-plan.json')
  const result = cli(['--manifest', input, '--scope', 'site', '--output', output], f.directory)
  assert.equal(result.status, 0, result.stderr)
  const summary = JSON.parse(result.stdout)
  assert.equal(summary.scope, 'site')
  assert.equal(summary.urlCount, 3)
  const plan = JSON.parse(fs.readFileSync(output, 'utf8'))
  assert.deepEqual(
    plan.urls,
    current.entries.map(entry => entry.url),
  )
  assert.equal(plan.digest, summary.digest)
  assert.equal(
    plan.urls.some(value => value.includes('/es/')),
    false,
  )
})

test('offline planner compares the saved baseline, retaining deleted URLs and excluding unchanged pages', t => {
  const f = fixture(t)
  const before = manifest([
    [url('deleted'), '1'],
    [url('same'), '2'],
    [url('updated'), '3'],
  ])
  const current = manifest(
    [
      [url('added'), '4'],
      [url('same'), '2'],
      [url('updated'), '5'],
    ],
    'b'.repeat(40),
  )
  const baseline = {
    schemaVersion: 1,
    scope: 'kb',
    manifest: before,
    deploymentId: '123',
    notifiedAt: '2026-10-29T01:00:00.000Z',
  }
  const input = f.write('manifest.json', current)
  const previous = f.write('baseline.json', baseline)
  const output = path.join(f.directory, 'plan.json')
  const result = cli(['--manifest', input, '--baseline', previous, '--output', output], f.directory)
  assert.equal(result.status, 0, result.stderr)
  const summary = JSON.parse(result.stdout)
  assert.equal(summary.initial, false)
  assert.deepEqual(summary.changes, { added: 1, updated: 1, deleted: 1 })
  const plan = JSON.parse(fs.readFileSync(output, 'utf8'))
  assert.deepEqual(plan.changes, { added: [url('added')], updated: [url('updated')], deleted: [url('deleted')] })
  assert.equal(plan.urls.includes(url('same')), false)
  assert.deepEqual(JSON.parse(fs.readFileSync(previous, 'utf8')), baseline, 'Reviewing never advances a baseline')
})

test('planner help needs no local manifests, creates no outputs and never fetches', t => {
  const f = fixture(t)
  const result = cli(['--help'], f.directory)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /--manifest FILE/)
  assert.deepEqual(fs.readdirSync(f.directory), [])
})

test('planner rejects submission flags, unknown/duplicate options and malformed inputs without replacing a reviewed plan', t => {
  const f = fixture(t)
  const valid = f.write('manifest.json', manifest([[url('one'), '1']]))
  const malformed = f.write('invalid.json', 'not JSON')
  const corrupted = manifest([[url('one'), '1']])
  corrupted.digest = 'f'.repeat(64)
  const badDigest = f.write('bad-digest.json', corrupted)
  const invalidBaseline = f.write('bad-baseline.json', {})
  const output = f.write('reviewed.json', 'previously-reviewed-plan')
  for (const args of [
    ['--submit'],
    ['--production-deployed'],
    ['--scope', 'unknown'],
    ['--scope', 'kb', '--scope', 'site'],
    ['--manifest'],
    ['--manifest', '--scope'],
    ['--manifest', malformed],
    ['--manifest', badDigest],
    ['--manifest', valid, '--manifest', valid],
    ['--baseline', invalidBaseline],
  ]) {
    const inputArgs = args.includes('--manifest') ? args : ['--manifest', valid, ...args]
    const result = cli(['--output', output, ...inputArgs], f.directory)
    assert.equal(result.status, 1, `${JSON.stringify(args)}: ${result.stderr}`)
    assert.equal(result.stdout, '')
    assert.doesNotMatch(result.stderr, /TEST_NETWORK_FORBIDDEN/)
    assert.equal(fs.readFileSync(output, 'utf8'), 'previously-reviewed-plan')
    assert.equal(fs.existsSync(`${output}.tmp`), false)
  }
})
