import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ARTICLE_PATH, ARTICLE_REMOTE } from './resolve-kb-content.mjs'
import { verifyKBContentRelease } from './verify-kb-content-release.mjs'

function fixture(t) {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-build-verification-'))
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  fs.mkdirSync(path.join(repository, ARTICLE_PATH, 'metadata'), { recursive: true })
  const record = {
    schemaVersion: 1,
    websiteSHA: 'a'.repeat(40),
    articleSHA: 'b'.repeat(40),
    articleBaselineSHA: 'c'.repeat(40),
    articleRepository: ARTICLE_REMOTE,
    contentSource: 'main',
    workingTree: false,
  }
  const state = {
    head: record.articleSHA,
    website: record.websiteSHA,
    main: record.articleSHA,
    changed: 'metadata/catalog.json\0metadata/reconciliation.json\0',
    untracked: '',
  }
  const save = () => {
    fs.writeFileSync(path.join(repository, 'public/kb-content-release.json'), JSON.stringify(record))
    fs.writeFileSync(
      path.join(repository, ARTICLE_PATH, 'metadata/catalog.json'),
      JSON.stringify({ sourceCommit: record.articleSHA }),
    )
  }
  save()
  const git = (directory, args) => {
    if (args[0] === 'rev-parse') return directory === repository ? state.website : state.head
    if (args[0] === 'diff') return state.changed
    if (args[0] === 'ls-files') return state.untracked
    if (args[0] === 'ls-remote') {
      assert.deepEqual(args, ['ls-remote', ARTICLE_REMOTE, 'refs/heads/main'])
      return `${state.main}\trefs/heads/main`
    }
    throw new Error(`Unexpected Git operation: ${args[0]}`)
  }
  return { repository, record, state, save, verify: () => verifyKBContentRelease({ repository, git }) }
}

test('a successful live build requires the exact resolved revisions and current official main', t => {
  const f = fixture(t)
  assert.deepEqual(f.verify(), f.record)
})

test('an older long-running content build cannot finish successfully after main advances', t => {
  const f = fixture(t)
  f.state.main = 'd'.repeat(40)
  assert.throws(f.verify, /discard this stale build/)
})

test('explicit recovery and pinned previews do not accidentally fetch newer content', t => {
  for (const contentSource of ['sha', 'pin']) {
    const f = fixture(t)
    f.record.contentSource = contentSource
    f.state.main = 'd'.repeat(40)
    f.save()
    assert.deepEqual(f.verify(), f.record)
  }
})

test('changing code, article checkout, generated source revision, or source bytes aborts release', t => {
  for (const mutate of [
    f => {
      f.state.website = 'd'.repeat(40)
    },
    f => {
      f.state.head = 'd'.repeat(40)
    },
    f => {
      f.state.changed = 'article/index.md\0'
    },
    f => {
      f.state.untracked = 'new/index.md\0'
    },
    f =>
      fs.writeFileSync(
        path.join(f.repository, ARTICLE_PATH, 'metadata/catalog.json'),
        JSON.stringify({ sourceCommit: 'd'.repeat(40) }),
      ),
  ]) {
    const f = fixture(t)
    mutate(f)
    assert.throws(f.verify)
  }
})

test('provenance rejects malformed and foreign repository inputs', t => {
  for (const update of [
    { articleSHA: ['b'.repeat(40)] },
    { articleRepository: 'https://example.invalid/articles' },
    { contentSource: 'latest' },
  ]) {
    const f = fixture(t)
    Object.assign(f.record, update)
    f.save()
    assert.throws(f.verify)
  }
})
