import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import matter from 'gray-matter'
import { sourceFieldHash, validateKBSources } from './validate-kb-sources.mjs'

const repository = fileURLToPath(new URL('../', import.meta.url))
const preparation = path.join(repository, 'scripts/prepare-kb-content.mjs')
const validator = path.join(repository, 'scripts/validate-kb-sources.mjs')
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7XcAAAAASUVORK5CYII=',
  'base64',
)
const editorial = {
  hub: 'curated',
  subjects: ['curated_subject'],
  internalTags: ['do-not-guess'],
  librarySection: 'hub',
  relatedArticleIds: ['selected_related'],
  excludedFromRecommendations: true,
  reviewStatus: 'approved',
  matchMethod: 'human-reviewed',
  candidateKeys: ['preserved-evidence'],
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-publishing-metadata-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'metadata'))
  const writeJSON = (name, value) =>
    fs.writeFileSync(path.join(root, 'metadata', name), `${JSON.stringify(value, null, 2)}\n`)
  const featured = [
    { language: 'en', articleId: 'alpha', url: 'https://www.nervos.org/knowledge-base/alpha', order: 4 },
  ]
  writeJSON('handoff.json', {
    hubs: [{ id: 'historical' }],
    subjects: [{ id: 'historical_subject', hub: 'historical' }],
    candidates: [
      {
        key: 'alpha',
        language: 'en',
        url: 'https://www.nervos.org/knowledge-base/alpha',
        hub: 'historical',
        subjects: ['historical_subject'],
        internalTags: ['stale'],
      },
    ],
    featured: [],
  })
  writeJSON('catalog.json', {
    schemaVersion: 1,
    sourceCommit: 'a'.repeat(40),
    articles: [{ id: 'alpha', language: 'en', ...editorial }],
    hubs: [{ id: 'curated', name: 'Current reviewed hub' }],
    subjects: [{ id: 'curated_subject', hub: 'curated' }],
    featured,
  })
  function article({ id = 'alpha', language = 'en', fields = {}, body = 'Existing article body.\n', omit = [] } = {}) {
    const directory = path.join(root, id)
    fs.mkdirSync(path.join(directory, 'images'), { recursive: true })
    fs.writeFileSync(path.join(directory, 'images/cover.png'), png)
    fs.writeFileSync(path.join(directory, 'images/body.png'), png)
    const data = {
      title: `${language} title`,
      subtitle: `${language} subtitle`,
      description: `${language} description`,
      author: ['github:writer'],
      date: '2020-01-01T00:00:00.000Z',
      coverImage: 'images/cover.png',
      ...fields,
    }
    const raw = `---\n${Object.entries(data)
      .filter(([key]) => !omit.includes(key))
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n')}\n---\n${body}`
    const sourceFile = `${id}/index${language === 'en' ? '' : `_${language}`}.md`
    fs.writeFileSync(path.join(root, sourceFile), raw)
    return { raw, sourceFile }
  }
  article()
  execFileSync('git', ['init', '-q', root])
  execFileSync('git', ['-C', root, 'add', '.'])
  execFileSync(
    'git',
    [
      '-C',
      root,
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'user.name=Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'Fixture source',
    ],
    { env: { ...process.env, GIT_AUTHOR_DATE: '2020-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2020-01-01T00:00:00Z' } },
  )
  return {
    root,
    featured,
    article,
    readCatalog: () => JSON.parse(fs.readFileSync(path.join(root, 'metadata/catalog.json'), 'utf8')),
    prepare() {
      execFileSync(process.execPath, [preparation, root], { cwd: repository, encoding: 'utf8' })
      return this.readCatalog()
    },
  }
}

function snapshotSources(root) {
  const result = new Map()
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === '.git' || (directory === root && entry.name === 'metadata')) continue
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(filename)
      else result.set(path.relative(root, filename), hash(fs.readFileSync(filename)))
    }
  }
  visit(root)
  return result
}

test('EN-only publication regenerates deterministic metadata while preserving every curated choice and source byte', t => {
  const f = fixture(t)
  const added = f.article({ id: 'new_english_only' })
  assert.equal(validateKBSources(f.root).sources.length, 2)
  const protectedFiles = snapshotSources(f.root)
  const catalog = f.prepare()
  assert.equal(catalog.articles.length, 2)
  assert.equal(catalog.articles.find(article => article.id === 'new_english_only').hub, null)
  assert.equal(catalog.articles.find(article => article.id === 'new_english_only').reviewStatus, 'pending-editorial')
  assert.equal(catalog.articles.find(article => article.id === 'new_english_only').sourceSHA256, hash(added.raw))
  const existing = catalog.articles.find(article => article.id === 'alpha')
  for (const [field, value] of Object.entries(editorial)) assert.deepEqual(existing[field], value, field)
  assert.deepEqual(catalog.hubs, [{ id: 'curated', name: 'Current reviewed hub' }])
  assert.deepEqual(catalog.subjects, [{ id: 'curated_subject', hub: 'curated' }])
  assert.deepEqual(catalog.featured, f.featured)
  assert.equal(
    catalog.sourceCommit,
    execFileSync('git', ['-C', f.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  )
  const first = fs.readFileSync(path.join(f.root, 'metadata/catalog.json'), 'utf8')
  const report = fs.readFileSync(path.join(f.root, 'metadata/reconciliation.json'), 'utf8')
  f.prepare()
  assert.equal(fs.readFileSync(path.join(f.root, 'metadata/catalog.json'), 'utf8'), first)
  assert.equal(fs.readFileSync(path.join(f.root, 'metadata/reconciliation.json'), 'utf8'), report)
  assert.deepEqual(snapshotSources(f.root), protectedFiles)
})

test('a newly uploaded Chinese file uses its own copy and inherits only existing English structure, never approval', t => {
  const f = fixture(t)
  f.article({ language: 'zh', fields: { title: '自己的中文标题', description: '自己的中文描述', author: '中文作者' } })
  assert.equal(validateKBSources(f.root).sources.length, 2)
  const chinese = f.prepare().articles.find(article => article.language === 'zh')
  for (const field of [
    'hub',
    'subjects',
    'internalTags',
    'librarySection',
    'relatedArticleIds',
    'excludedFromRecommendations',
  ])
    assert.deepEqual(chinese[field], editorial[field], field)
  assert.equal(chinese.title, '自己的中文标题')
  assert.equal(chinese.description, '自己的中文描述')
  assert.deepEqual(chinese.authors, ['中文作者'])
  assert.equal(chinese.canonicalPath, '/zh/knowledge-base/alpha')
  assert.equal(chinese.reviewStatus, 'pending-editorial')
  assert.equal(chinese.matchMethod, 'current-english-translation')
})

test('editing a description/body refreshes derived metadata without a hand-edited catalog or source rewrite', t => {
  const f = fixture(t)
  const first = f.prepare().articles[0]
  const changed = f.article({
    fields: { description: 'Updated editorial SEO copy.' },
    body: 'Updated body and ![body](images/body.png).\n<img src="images/body.png" alt="HTML image">\n',
  })
  validateKBSources(f.root)
  const second = f.prepare().articles[0]
  assert.equal(second.description, 'Updated editorial SEO copy.')
  assert.notEqual(second.sourceSHA256, first.sourceSHA256)
  assert.notEqual(second.bodySHA256, first.bodySHA256)
  assert.equal(second.sourceSHA256, hash(changed.raw))
  assert.equal(fs.readFileSync(path.join(f.root, changed.sourceFile), 'utf8'), changed.raw)
  assert.equal(second.hub, editorial.hub)
})

test('invalid, timezone-less and rollover dates are rejected, while a real future timestamp stays scheduled', t => {
  const f = fixture(t)
  for (const date of [
    'not a date',
    '2026-11-05',
    '2026-11-05T12:00:00',
    '2026-02-29T12:00:00Z',
    '2026-13-01T12:00:00Z',
    '2026-11-05T24:00:00Z',
    '2026-11-05T12:00:00+24:00',
  ]) {
    f.article({ fields: { date } })
    assert.throws(() => validateKBSources(f.root), /real ISO timestamp/, date)
  }
  f.article({ fields: { date: '2999-01-01T00:00:00+08:00', draft: true, published: false } })
  validateKBSources(f.root)
  const article = f.prepare().articles[0]
  assert.equal(article.date, '2998-12-31T16:00:00.000Z')
  assert.equal(article.draft, true)
})

test('YAML implicit timestamp conversion cannot erase a missing timezone; proper timestamps may retain comments', t => {
  const f = fixture(t)
  const { raw, sourceFile } = f.article()
  for (const date of ['2026-11-05T12:00:00', '2026-11-05 12:00:00']) {
    fs.writeFileSync(path.join(f.root, sourceFile), raw.replace(/date: ".*"/, `date: ${date}`))
    assert.throws(() => validateKBSources(f.root), /real ISO timestamp/)
  }
  fs.writeFileSync(
    path.join(f.root, sourceFile),
    raw.replace(/date: ".*"/, 'date: 2026-11-05T12:00:00Z # reviewed publication time'),
  )
  validateKBSources(f.root)
})

test('quoted booleans, empty title/author, malformed optional copy and invalid cover references fail closed', t => {
  const f = fixture(t)
  for (const fields of [
    { draft: 'true' },
    { published: 'false' },
    { title: '  ' },
    { author: [] },
    { author: 4 },
    { author: 'github:' },
    { author: { name: { toString: 'not callable' }, github: 'writer' } },
    { author: { name: 42, github: 'writer' } },
    { author: { name: ' ', github: 'writer' } },
    { author: { name: 'Writer', github: null } },
    { description: 9 },
    { subtitle: null },
    { coverImage: '../metadata/catalog.json' },
    { coverImage: 'images/not-there.png' },
    { coverImage: 'index.md' },
  ]) {
    f.article({ fields })
    assert.throws(() => validateKBSources(f.root), /KB source validation failed/, JSON.stringify(fields))
  }
})

test('new sources cannot borrow legacy missing-field exceptions or authorize themselves through catalog hashes', t => {
  const f = fixture(t)
  const old = f.article({ omit: ['author'] })
  const { data } = matter(old.raw)
  const baseline = {
    schemaVersion: 1,
    sourceCommit: 'a'.repeat(40),
    issues: [
      {
        sourceFile: old.sourceFile,
        field: 'author',
        valueSHA256: sourceFieldHash(data, 'author', old.raw),
        sourceSHA256: hash(old.raw),
      },
    ],
  }
  assert.equal(validateKBSources(f.root, { baseline }).legacyIssues.length, 1)
  f.article({ omit: ['author'], body: 'An ordinary body correction leaves the known missing author unchanged.' })
  validateKBSources(f.root, { baseline })
  f.article({ fields: { author: ' ' } })
  assert.throws(() => validateKBSources(f.root, { baseline }), /author must contain/)
  f.article()
  f.article({ id: 'new_without_author', omit: ['author'] })
  assert.throws(() => validateKBSources(f.root, { baseline }), /new_without_author/)
})

test('translation-only, unsupported, duplicate-alias and mixed-case filenames are actionable errors, never silent omissions', t => {
  for (const scenario of ['translation-only', 'unknown', 'duplicate', 'case', 'english-alias', 'folder']) {
    const f = fixture(t)
    if (scenario === 'translation-only') {
      f.article({ id: 'only_translation', language: 'zh' })
    } else if (scenario === 'unknown') {
      f.article({ language: 'ru' })
    } else if (scenario === 'duplicate') {
      f.article({ language: 'zh' })
      fs.copyFileSync(path.join(f.root, 'alpha/index_zh.md'), path.join(f.root, 'alpha/index-zh.md'))
    } else if (scenario === 'case') {
      fs.renameSync(path.join(f.root, 'alpha/index.md'), path.join(f.root, 'alpha/Index.md'))
    } else if (scenario === 'english-alias') {
      fs.copyFileSync(path.join(f.root, 'alpha/index.md'), path.join(f.root, 'alpha/index_en.md'))
    } else {
      f.article({ id: 'Not_Canonical' })
    }
    assert.throws(() => validateKBSources(f.root), /KB source validation failed/, scenario)
  }
})

test('Markdown and raw HTML images must exist, stay inside public content and contain real image bytes', t => {
  const f = fixture(t)
  for (const body of [
    '![missing](images/missing.png)',
    '<img src="images/missing.png" alt="missing">',
    '![escape](../../outside.png)',
    '![bad](index.md)',
    '![bad](images/%ZZ.png)',
    '![absolute missing](https://www.nervos.org/education_hub_articles/alpha/images/missing.png)',
    '![bad remote](https://)',
    '![credentials](https://user:password@example.invalid/image.png)',
  ]) {
    f.article({ body })
    assert.throws(() => validateKBSources(f.root), /image/, body)
  }
  f.article({
    body: '![valid](images/body.png)\n<img src="images/body.png">\n![external](https://example.invalid/image.png)',
  })
  validateKBSources(f.root)
  fs.symlinkSync(path.join(f.root, 'alpha/images/body.png'), path.join(f.root, 'alpha/images/linked.png'))
  f.article({ body: '![symlink](images/linked.png)' })
  assert.throws(() => validateKBSources(f.root), /unsafe image/)
})

test('reviewed legacy exceptions are frozen website-owned evidence, not a regenerated article upload artifact', () => {
  const raw = fs.readFileSync(path.join(repository, 'config/kb-legacy-source-baseline.json'))
  const baseline = JSON.parse(raw)
  assert.equal(baseline.sourceCommit, '96b9571537e8077c3ae4c79721bbfe871c734c75')
  assert.equal(baseline.issues.length, 122)
  assert.equal(hash(raw), '44e736aae884ceb7cfbde3bbcb8dbf28b72be14e780c1a2071ca67a217ffe888')
})

test('the validator can inspect a separate checkout from any cwd without executing its scripts or modifying files', t => {
  const f = fixture(t)
  fs.mkdirSync(path.join(f.root, 'scripts'))
  fs.writeFileSync(
    path.join(f.root, 'scripts/check-slugs.mjs'),
    'throw new Error("UNTRUSTED ARTICLE SCRIPT EXECUTED")\n',
  )
  const before = snapshotSources(f.root)
  const metadata = fs.readFileSync(path.join(f.root, 'metadata/catalog.json'), 'utf8')
  const result = spawnSync(process.execPath, [validator, f.root], { cwd: os.tmpdir(), encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /1 renditions/)
  assert.deepEqual(snapshotSources(f.root), before)
  assert.equal(fs.readFileSync(path.join(f.root, 'metadata/catalog.json'), 'utf8'), metadata)
  const bad = spawnSync(process.execPath, [validator, '--accept-invalid'], { encoding: 'utf8' })
  assert.notEqual(bad.status, 0)
  assert.match(bad.stderr, /Usage:/)
})

test('untrusted Markdown cannot select a JavaScript frontmatter engine before validation', t => {
  const f = fixture(t)
  const marker = path.join(f.root, 'frontmatter-executed')
  fs.writeFileSync(
    path.join(f.root, 'alpha/index.md'),
    `---javascript\n(() => { require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unsafe'); return {}; })()\n---\nBody\n`,
  )
  const result = spawnSync(process.execPath, [validator, f.root], { encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /only standard YAML frontmatter/)
  assert.equal(fs.existsSync(marker), false)
  const lowLevel = spawnSync(process.execPath, [preparation, f.root], { cwd: repository, encoding: 'utf8' })
  assert.notEqual(lowLevel.status, 0)
  assert.match(lowLevel.stderr, /only standard YAML frontmatter/)
  assert.equal(fs.existsSync(marker), false)
})

test('all publishing entrypoints validate and regenerate metadata before consumers, without executing article-owned code', () => {
  const { scripts } = JSON.parse(fs.readFileSync(path.join(repository, 'package.json'), 'utf8'))
  for (const name of ['build', 'dev', 'kb:build:prepare', 'kb:prepare', 'kb:validate', 'sitemap:generate']) {
    const script = scripts[name]
    const validate = script.indexOf('node scripts/validate-kb-sources.mjs')
    const prepare = script.indexOf('node scripts/prepare-kb-content.mjs')
    assert(validate >= 0 && prepare > validate, name)
    for (const consumer of [
      'test-kb-content.mjs',
      'generate-articles.mjs',
      'generate-sitemap.mjs',
      'indexnow-manifest.mjs',
      'next build',
      'next dev',
    ]) {
      const position = script.indexOf(consumer)
      if (position >= 0) assert(position > prepare, `${name}: ${consumer}`)
    }
    assert(!script.includes('public/education_hub_articles/scripts/'), name)
  }
  for (const name of ['build', 'dev', 'kb:build:prepare'])
    assert(scripts[name].startsWith('node scripts/resolve-kb-content.mjs && '), name)
})
