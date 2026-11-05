import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import test from 'node:test'
import { ARTICLE_PATH, ARTICLE_REMOTE, deletedPublicationPaths, resolveKBContent } from './resolve-kb-content.mjs'

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-live-content-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const website = path.join(directory, 'website')
  const source = path.join(directory, 'articles')
  fs.mkdirSync(website)
  fs.mkdirSync(source)
  const git = (cwd, args) =>
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', cwd, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Publishing test',
        GIT_AUTHOR_EMAIL: 'test@example.invalid',
        GIT_COMMITTER_NAME: 'Publishing test',
        GIT_COMMITTER_EMAIL: 'test@example.invalid',
      },
    }).trim()
  const write = (root, file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), value)
  }
  git(source, ['init', '-b', 'main'])
  write(source, 'first_article/index.md', '---\ntitle: First article\n---\nOriginal body.\n')
  write(source, 'first_article/images/cover.png', 'image fixture')
  write(source, 'metadata/slug-migrations.json', JSON.stringify({ renames: [] }))
  git(source, ['add', '.'])
  git(source, ['commit', '-m', 'Reviewed initial content'])
  const baseline = git(source, ['rev-parse', 'HEAD'])
  git(website, ['init', '-b', 'main'])
  fs.mkdirSync(path.join(website, 'public'))
  git(website, ['clone', '--no-hardlinks', source, ARTICLE_PATH])
  write(
    website,
    '.gitmodules',
    `[submodule "${ARTICLE_PATH}"]\npath = ${ARTICLE_PATH}\nurl = ${ARTICLE_REMOTE}\nbranch = main\n`,
  )
  git(website, ['add', '.gitmodules', ARTICLE_PATH])
  git(website, ['commit', '-m', 'Reviewed website'])
  const calls = []
  const execute = (cwd, args) => {
    calls.push({ cwd, args: [...args] })
    return git(
      cwd,
      args.map(arg => (arg === ARTICLE_REMOTE ? source : arg)),
    )
  }
  return {
    website,
    source,
    baseline,
    calls,
    git,
    write,
    resolve: env => resolveKBContent({ repository: website, env: env ?? {}, git: execute }),
    commit() {
      git(source, ['add', '.'])
      git(source, ['commit', '-m', 'Reviewed content update'])
      return git(source, ['rev-parse', 'HEAD'])
    },
  }
}

test('default local/preview build stays pinned and records both versions without network', t => {
  const f = fixture(t)
  f.write(f.source, 'new_article/index.md', 'A new article')
  f.commit()
  const record = f.resolve()
  assert.equal(record.articleSHA, f.baseline)
  assert.equal(record.contentSource, 'pin')
  assert.equal(record.workingTree, false)
  assert.equal(f.calls.filter(call => call.args[0] === 'fetch').length, 0)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.website, 'public/kb-content-release.json'))), record)
  assert.deepEqual(f.resolve(), record, 'The same inputs produce the same provenance')
})

test('live-content build freezes one official main SHA without changing the website gitlink', t => {
  const f = fixture(t)
  f.write(f.source, 'new_article/index.md', 'An English-first article')
  const next = f.commit()
  const record = f.resolve({ KB_CONTENT_SOURCE: 'main', VERCEL_ENV: 'production' })
  assert.equal(record.articleSHA, next)
  assert.equal(record.articleBaselineSHA, f.baseline)
  assert.equal(record.contentSource, 'main')
  assert.equal(f.calls.filter(call => call.args[0] === 'fetch').length, 1)
  assert(f.git(f.website, ['ls-tree', 'HEAD', ARTICLE_PATH]).includes(f.baseline))
  assert.equal(f.git(path.join(f.website, ARTICLE_PATH), ['rev-parse', 'HEAD']), next)
})

test('a full explicit article SHA supports reproducible recovery, not an implicit latest rebuild', t => {
  const f = fixture(t)
  f.write(f.source, 'first_article/index.md', 'New main body')
  f.commit()
  const record = f.resolve({ KB_CONTENT_SOURCE: 'main', KB_ARTICLE_SHA: f.baseline })
  assert.equal(record.articleSHA, f.baseline)
  assert.equal(record.contentSource, 'sha')
})

test('malformed refs and unknown modes fail before fetch or checkout', t => {
  for (const env of [
    { KB_CONTENT_SOURCE: 'latest' },
    { KB_ARTICLE_SHA: 'main' },
    { KB_ARTICLE_SHA: '--upload-pack=bad' },
  ]) {
    const f = fixture(t)
    assert.throws(() => f.resolve(env))
    assert.equal(f.calls.filter(call => ['fetch', 'checkout'].includes(call.args[0])).length, 0)
  }
})

test('live fetching refuses local edits instead of overwriting them', t => {
  const f = fixture(t)
  const file = path.join(f.website, ARTICLE_PATH, 'first_article/index.md')
  fs.writeFileSync(file, 'Local edits must survive')
  assert.throws(() => f.resolve({ KB_CONTENT_SOURCE: 'main' }), /dirty article checkout/)
  assert.equal(fs.readFileSync(file, 'utf8'), 'Local edits must survive')
  assert.equal(f.calls.filter(call => call.args[0] === 'fetch').length, 0)
  assert.equal(f.resolve().workingTree, true, 'Pinned local editing remains available and is labelled')
  assert.throws(() => f.resolve({ VERCEL_ENV: 'production' }), /dirty article checkout/)
})

test('a changed .gitmodules URL is not a publishing input', t => {
  const f = fixture(t)
  f.write(f.website, '.gitmodules', `[submodule "${ARTICLE_PATH}"]\nurl = https://example.invalid/articles.git\n`)
  assert.throws(() => f.resolve({ KB_CONTENT_SOURCE: 'main' }), /Unexpected article repository/)
  assert.equal(f.calls.filter(call => call.args[0] === 'fetch').length, 0)
})

test('article and image deletion/rename needs a coordinated migration release', t => {
  for (const filename of ['first_article/index.md', 'first_article/images/cover.png']) {
    const f = fixture(t)
    fs.unlinkSync(path.join(f.source, filename))
    f.commit()
    assert.throws(
      () => f.resolve({ KB_CONTENT_SOURCE: 'main' }),
      /deletion or rename needs a coordinated website release/,
    )
    assert.equal(f.git(path.join(f.website, ARTICLE_PATH), ['rev-parse', 'HEAD']), f.baseline)
  }
})

test('new redirect mappings cannot be smuggled in as a routine content-only release', t => {
  const f = fixture(t)
  f.write(f.source, 'metadata/slug-migrations.json', JSON.stringify({ renames: [{ from: 'old', to: 'new' }] }))
  f.commit()
  assert.throws(() => f.resolve({ KB_CONTENT_SOURCE: 'main' }), /URL migration rule changes/)
})

test('deleting an article that was first published after the website baseline is also blocked', t => {
  const f = fixture(t)
  f.write(f.source, 'new_article/index.md', 'Published after the website code release')
  f.commit()
  fs.unlinkSync(path.join(f.source, 'new_article/index.md'))
  f.commit()
  assert.throws(() => f.resolve({ KB_CONTENT_SOURCE: 'main' }), /new_article\/index.md/)
  assert.equal(f.git(path.join(f.website, ARTICLE_PATH), ['rev-parse', 'HEAD']), f.baseline)
})

test('an override from a feature branch is not considered published main content', t => {
  const f = fixture(t)
  f.git(f.source, ['switch', '-c', 'unreviewed'])
  f.write(f.source, 'first_article/index.md', 'Unreviewed branch body')
  const feature = f.commit()
  f.git(f.source, ['switch', 'main'])
  assert.throws(() => f.resolve({ KB_ARTICLE_SHA: feature }))
  assert.equal(f.git(path.join(f.website, ARTICLE_PATH), ['rev-parse', 'HEAD']), f.baseline)
})

test('production provenance cannot claim a different website revision', t => {
  const f = fixture(t)
  assert.throws(() => f.resolve({ VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40) }), /does not match/)
})

test('NUL-separated deletion policy is exact and does not invent rename mappings', () => {
  assert.deepEqual(deletedPublicationPaths('M\0article/index.md\0A\0new/index.md\0D\0README.md\0'), [])
  assert.deepEqual(deletedPublicationPaths('D\0article/index_zh.md\0D\0article/images/with space.png\0'), [
    'article/index_zh.md',
    'article/images/with space.png',
  ])
  assert.throws(() => deletedPublicationPaths('R100\0old/index.md\0new/index.md\0'), /Unexpected/)
})
