import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import matter from 'gray-matter'

const repository = fileURLToPath(new URL('../', import.meta.url))
const release = '96b9571537e8077c3ae4c79721bbfe871c734c75'

test('daily English-only additions, an explicit Hub tag, edited SEO copy and new image references pass the real inventory suites', t => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-daily-inventory-'))
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }))
  // Isolate all mutations. Neither the actual article checkout nor its metadata
  // is changed by this integration test.
  for (const directory of ['src', 'scripts', 'config', 'public/locales']) {
    fs.cpSync(path.join(repository, directory), path.join(fixture, directory), { recursive: true })
  }
  fs.copyFileSync(path.join(repository, 'next-i18next.config.js'), path.join(fixture, 'next-i18next.config.js'))
  fs.copyFileSync(path.join(repository, 'package.json'), path.join(fixture, 'package.json'))
  fs.symlinkSync(path.join(repository, 'node_modules'), path.join(fixture, 'node_modules'), 'dir')
  const gitDir = cwd => execFileSync('git', ['-C', cwd, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8' }).trim()
  fs.writeFileSync(path.join(fixture, '.git'), `gitdir: ${gitDir(repository)}\n`)
  const contentRoot = path.join(fixture, 'public/education_hub_articles')
  fs.mkdirSync(contentRoot, { recursive: true })
  const sourceRoot = path.join(repository, 'public/education_hub_articles')
  const archive = path.join(fixture, 'approved-articles.tar')
  execFileSync('git', ['-C', sourceRoot, 'archive', '--format=tar', '--output', archive, release])
  execFileSync('tar', ['-xf', archive, '-C', contentRoot])
  fs.unlinkSync(archive)
  fs.writeFileSync(path.join(contentRoot, '.git'), `gitdir: ${gitDir(sourceRoot)}\n`)

  const before = JSON.parse(fs.readFileSync(path.join(contentRoot, 'metadata/catalog.json'), 'utf8'))
  const imported = JSON.parse(fs.readFileSync(path.join(contentRoot, 'metadata/description-import.json'), 'utf8'))
  const editedFile = path.join(contentRoot, imported.entries[0].sourceFile)
  const previous = matter(fs.readFileSync(editedFile, 'utf8'))
  const editedDescription = 'Updated editorial description for the same published article.'
  fs.writeFileSync(
    editedFile,
    matter.stringify(`${previous.content}\n\nA newly reviewed paragraph in an existing article.\n`, {
      ...previous.data,
      description: editedDescription,
    }),
  )
  // Three additions cross the original 216-article/page-9 boundary. They have
  // real images and normal frontmatter, but intentionally no Chinese files.
  for (let index = 1; index <= 3; index++) {
    const folder = path.join(contentRoot, `daily_content_${index}`)
    fs.mkdirSync(path.join(folder, 'images'), { recursive: true })
    fs.copyFileSync(
      path.join(contentRoot, 'quantum_resistance/images/image2.png'),
      path.join(folder, 'images/cover.png'),
    )
    const body = index === 1 ? '\n![Existing meaningful animation alt](images/animation.gif)\n' : '\nArticle body.\n'
    if (index === 1)
      fs.copyFileSync(
        path.join(contentRoot, 'nervosdao_withdrawal_process_explained/images/image6.gif'),
        path.join(folder, 'images/animation.gif'),
      )
    fs.writeFileSync(
      path.join(folder, 'index.md'),
      matter.stringify(body, {
        title: `Daily English-only article ${index}`,
        subtitle: 'An ordinary article added without uploading generated metadata.',
        description: 'A supplied English SEO description.',
        coverImage: 'images/cover.png',
        date: '2020-01-01T00:00:00.000Z',
        author: ['github:fixture_author'],
        ...(index === 1 ? { hub: 'quantum-computing-blockchain-security' } : {}),
      }),
    )
  }
  execFileSync(process.execPath, ['scripts/validate-kb-sources.mjs', contentRoot], {
    cwd: fixture,
    encoding: 'utf8',
  })
  execFileSync(process.execPath, ['scripts/prepare-kb-content.mjs', contentRoot], {
    cwd: fixture,
    encoding: 'utf8',
  })
  const generated = JSON.parse(fs.readFileSync(path.join(contentRoot, 'metadata/catalog.json'), 'utf8'))
  assert.equal(generated.articles.length, before.articles.length + 3)
  assert.equal(
    generated.articles.find(article => article.sourceFile === imported.entries[0].sourceFile).description,
    editedDescription,
  )
  for (let index = 1; index <= 3; index++) {
    const versions = generated.articles.filter(article => article.id === `daily_content_${index}`)
    assert.deepEqual(
      versions.map(article => article.language),
      ['en'],
      'Do not fabricate a translation',
    )
    assert.equal(
      versions[0].hub,
      index === 1 ? 'quantum-computing-blockchain-security' : null,
      'Only the explicit source tag assigns a Hub; untagged articles remain unclassified',
    )
    assert.deepEqual(versions[0].subjects, [], 'Do not guess a narrower Subject from the Hub tag')
  }
  assert.equal(
    generated.articles.filter(article => article.hub === 'quantum-computing-blockchain-security').length,
    before.articles.filter(article => article.hub === 'quantum-computing-blockchain-security').length + 1,
    'The tagged publication contributes to its Hub list and count',
  )
  assert.deepEqual(generated.featured, before.featured, 'A Hub tag does not change the home-page editorial selection')
  const suites = [
    'scripts/test-kb-content.mjs',
    'scripts/kb-slug-migration.test.mjs',
    'scripts/sitemap.test.mjs',
    'src/server/page-seo.test.mjs',
    'src/server/structured-data.test.mjs',
    'src/server/kb-images.test.mjs',
    'src/components/KnowledgeHub/article-image-alt.test.mjs',
  ]
  // A nested runner must not inherit Node's private child-test IPC context.
  // Otherwise it can exit successfully without scheduling the requested files.
  const environment = { ...process.env }
  delete environment.NODE_TEST_CONTEXT
  const checked = spawnSync(process.execPath, ['--test', '--test-concurrency=2', ...suites], {
    cwd: fixture,
    env: environment,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    timeout: 180_000,
  })
  assert.equal(checked.error, undefined, checked.error?.message)
  const output = checked.stdout.split('\n')
  const failures = output.flatMap((line, index) =>
    line.startsWith('not ok ') ? output.slice(Math.max(0, index - 1), index + 50) : [],
  )
  assert.equal(checked.status, 0, `${failures.join('\n') || checked.stdout}\n${checked.stderr}`)
  const executed = checked.stdout.match(/^# tests (\d+)$/m)
  assert.ok(executed && Number(executed[1]) >= 40, `The actual inventory suites must run:\n${checked.stdout}`)
  t.diagnostic(
    'Real inventory suites accept EN-only articles, a Hub tag without guessed Subjects, page 10, updated copy/body and another GIF.',
  )
})
