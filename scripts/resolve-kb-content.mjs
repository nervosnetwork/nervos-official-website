import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const ARTICLE_REMOTE = 'https://github.com/NervosEducationHub/EducationHubArticles.git'
export const ARTICLE_PATH = 'public/education_hub_articles'
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))
const SHA = /^[a-f0-9]{40}$/
const sourceFile = /^[^/]+\/index(?:[_-][a-z]{2})?\.md$/
const imageFile = /^[^/]+\/.+\.(?:avif|apng|bmp|gif|ico|jpe?g|png|svg|webp)$/i

function defaultGit(directory, args) {
  return execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', directory, ...args], {
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

export function deletedPublicationPaths(status) {
  const tokens = status.split('\0')
  const deleted = []
  while (tokens.length && tokens[0]) {
    const change = tokens.shift().replace(/^\n+/, '')
    const filename = tokens.shift()
    assert(filename && /^[AMD]$/.test(change), 'Unexpected content diff; do not infer URL migrations')
    if (change === 'D' && (sourceFile.test(filename) || imageFile.test(filename))) deleted.push(filename)
  }
  return deleted
}

function migrationRules(raw) {
  const data = JSON.parse(raw)
  assert(Array.isArray(data.renames), 'Missing reviewed URL migration rules')
  return data.renames.map(({ from, to }) => ({ from, to }))
}

/** Resolve once at build start, never on a reader request or halfway through rendering. */
export function resolveKBContent({ repository = repositoryRoot, env = process.env, git = defaultGit } = {}) {
  repository = path.resolve(repository)
  const root = path.join(repository, ARTICLE_PATH)
  const configured = git(repository, ['config', '-f', '.gitmodules', '--get', `submodule.${ARTICLE_PATH}.url`])
  assert.equal(
    configured.replace(/\.git$/, '').toLowerCase(),
    ARTICLE_REMOTE.replace(/\.git$/, '').toLowerCase(),
    'Unexpected article repository in .gitmodules',
  )
  assert(fs.existsSync(path.join(root, '.git')), 'Initialize the article submodule with yarn kb:sync first')
  const baseline = /^160000 commit ([a-f0-9]{40})\t/.exec(git(repository, ['ls-tree', 'HEAD', '--', ARTICLE_PATH]))?.[1]
  assert(baseline, 'The website must retain its reviewed article gitlink as the compatibility baseline')
  const requestedMode = env.KB_CONTENT_SOURCE || 'pin'
  assert(['pin', 'main'].includes(requestedMode), 'KB_CONTENT_SOURCE must be pin or main')
  const override = env.KB_ARTICLE_SHA || ''
  assert(!override || SHA.test(override), 'KB_ARTICLE_SHA must be a full lowercase 40-character commit SHA')
  const mode = override ? 'sha' : requestedMode
  const initialHead = git(root, ['rev-parse', 'HEAD'])
  const initialStatus = git(root, ['status', '--porcelain', '--untracked-files=all'])
  const production = env.VERCEL_ENV === 'production'
  if (production || mode !== 'pin')
    assert(!initialStatus, 'Refusing to replace a dirty article checkout; use a fresh build checkout')
  let articleSHA = baseline
  if (mode !== 'pin') {
    // Explicit URL: an article commit cannot change which remote gets fetched.
    const shallow = git(root, ['rev-parse', '--is-shallow-repository']) === 'true'
    git(root, ['fetch', '--no-tags', ...(shallow ? ['--unshallow'] : []), ARTICLE_REMOTE, 'main'])
    const main = git(root, ['rev-parse', 'FETCH_HEAD^{commit}'])
    assert(SHA.test(main), 'Official article main did not resolve to a commit')
    articleSHA = override || main
    assert.equal(
      git(root, ['rev-parse', `${articleSHA}^{commit}`]),
      articleSHA,
      'Article override is not an available commit',
    )
    // Both compatibility and an override must belong to the official main history.
    git(root, ['merge-base', '--is-ancestor', baseline, main])
    git(root, ['merge-base', '--is-ancestor', articleSHA, main])
    git(root, ['merge-base', '--is-ancestor', baseline, articleSHA])
    const deleted = deletedPublicationPaths(
      git(root, ['diff', '--name-status', '-z', '--no-renames', baseline, articleSHA]),
    )
    // First-parent history represents versions published on main, not temporary
    // file renames inside an unmerged contributor branch. Endpoint-only diffs
    // would miss an article first added and then deleted after the baseline.
    deleted.push(
      ...deletedPublicationPaths(
        git(root, [
          'log',
          '--first-parent',
          '--diff-merges=first-parent',
          '--format=',
          '--name-status',
          '-z',
          '--no-renames',
          '--diff-filter=D',
          `${baseline}..${articleSHA}`,
        ]),
      ),
    )
    assert(
      !deleted.length,
      `Article/asset deletion or rename needs a coordinated website release: ${deleted.join(', ')}`,
    )
    assert.deepEqual(
      migrationRules(git(root, ['show', `${articleSHA}:metadata/slug-migrations.json`])),
      migrationRules(git(root, ['show', `${baseline}:metadata/slug-migrations.json`])),
      'URL migration rule changes need a coordinated website release',
    )
    if (initialHead !== articleSHA) git(root, ['checkout', '--detach', articleSHA])
  } else {
    assert.equal(
      initialHead,
      baseline,
      'Article checkout differs from the reviewed pin; select KB_CONTENT_SOURCE=main explicitly for a live-content build',
    )
  }
  assert.equal(git(root, ['rev-parse', 'HEAD']), articleSHA, 'Article checkout changed while resolving the build')
  const websiteSHA = git(repository, ['rev-parse', 'HEAD'])
  assert(SHA.test(websiteSHA), 'A website commit is required for release provenance')
  if (env.VERCEL_GIT_COMMIT_SHA)
    assert.equal(
      env.VERCEL_GIT_COMMIT_SHA,
      websiteSHA,
      'Website checkout does not match the Vercel deployment revision',
    )
  const record = {
    schemaVersion: 1,
    websiteSHA,
    articleSHA,
    articleRepository: ARTICLE_REMOTE,
    articleBaselineSHA: baseline,
    contentSource: mode,
    workingTree: Boolean(initialStatus),
  }
  fs.writeFileSync(path.join(repository, 'public/kb-content-release.json'), `${JSON.stringify(record, null, 2)}\n`)
  return record
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    assert.equal(
      process.argv.length,
      2,
      'Usage: node scripts/resolve-kb-content.mjs (configuration uses environment variables)',
    )
    console.log(`KB content version: ${JSON.stringify(resolveKBContent())}`)
  } catch (error) {
    console.error(`KB content resolution failed: ${error.message}`)
    process.exitCode = 1
  }
}
