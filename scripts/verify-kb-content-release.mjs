import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ARTICLE_PATH, ARTICLE_REMOTE } from './resolve-kb-content.mjs'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const SHA = /^[a-f0-9]{40}$/
const generated = new Set(['metadata/catalog.json', 'metadata/reconciliation.json'])
function defaultGit(directory, args) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', directory, ...args], {
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

export function verifyKBContentRelease({ repository = repositoryRoot, git = defaultGit } = {}) {
  const root = path.join(repository, ARTICLE_PATH)
  const record = JSON.parse(fs.readFileSync(path.join(repository, 'public/kb-content-release.json'), 'utf8'))
  assert.equal(record.schemaVersion, 1, 'Missing build content provenance')
  for (const field of ['articleSHA', 'websiteSHA', 'articleBaselineSHA'])
    assert(typeof record[field] === 'string' && SHA.test(record[field]), `Invalid ${field}`)
  assert.equal(record.articleRepository, ARTICLE_REMOTE, 'Unexpected article repository')
  assert.equal(typeof record.workingTree, 'boolean', 'Invalid working-tree provenance')
  assert(['main', 'pin', 'sha'].includes(record.contentSource), 'Unexpected content source')
  assert.equal(git(repository, ['rev-parse', 'HEAD']), record.websiteSHA, 'Website revision changed during the build')
  assert.equal(git(root, ['rev-parse', 'HEAD']), record.articleSHA, 'Article revision changed during the build')
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'metadata/catalog.json'), 'utf8'))
  assert.equal(catalog.sourceCommit, record.articleSHA, 'Generated metadata does not belong to this content version')
  // A pinned local build can deliberately include local article edits. Live
  // production inputs must not change after they have been resolved.
  if (record.contentSource !== 'pin' || !record.workingTree) {
    const changed = git(root, ['diff', '--name-only', '-z', 'HEAD']).split('\0').filter(Boolean)
    assert(
      changed.every(filename => generated.has(filename)),
      'Article sources changed during the build',
    )
    const untracked = git(root, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean)
    assert.equal(untracked.length, 0, 'Untracked article sources appeared during the build')
  }
  if (record.contentSource === 'main') {
    const remote = git(root, ['ls-remote', ARTICLE_REMOTE, 'refs/heads/main'])
    assert.equal(
      /^([a-f0-9]{40})\trefs\/heads\/main$/.exec(remote)?.[1],
      record.articleSHA,
      'Article main changed during this build; discard this stale build and publish the newer content instead',
    )
  }
  return record
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    assert.equal(process.argv.length, 2, 'Usage: node scripts/verify-kb-content-release.mjs')
    const record = verifyKBContentRelease()
    console.log(
      `KB build verified: website ${record.websiteSHA}; articles ${record.articleSHA}; source ${record.contentSource}`,
    )
  } catch (error) {
    console.error(`KB build verification failed: ${error.message}`)
    process.exitCode = 1
  }
}
