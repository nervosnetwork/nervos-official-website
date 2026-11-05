import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import matter from 'gray-matter'
import ts from 'typescript'
import { readSlugMigrations, rewriteKBUrl } from './migrate-kb-slugs.mjs'

const require = createRequire(import.meta.url)
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceCommit = '1234567890abcdef1234567890abcdef12345678'
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const compile = relative =>
  ts.transpileModule(fs.readFileSync(path.join(repository, relative), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
const preparation = compile('scripts/prepare-kb-content.mjs')
const loader = compile('src/server/kb-content.ts')
const body = '\n# Visible heading\n\nBody **copy** [link](/target).\n\n![Image alt](cover.png)\n'

function execute(code, imports, process) {
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'process', 'console', code)(
    name => (Object.hasOwn(imports, name) ? imports[name] : require(name)),
    loaded,
    loaded.exports,
    process,
    { log: () => undefined },
  )
  return loaded.exports
}

function fixture(t, entries) {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-descriptions-'))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const root = path.join(workspace, 'public/education_hub_articles')
  const metadata = path.join(root, 'metadata')
  fs.mkdirSync(metadata, { recursive: true })
  const sources = new Map()
  const candidates = []
  for (const { id, language = 'en', ...frontmatter } of entries) {
    const directory = path.join(root, id)
    fs.mkdirSync(directory, { recursive: true })
    const filename = `${id}/index${language === 'en' ? '' : `_${language}`}.md`
    const data = {
      title: `${language} article title`,
      subtitle: `${language} visible subtitle`,
      date: '2020-01-01T00:00:00.000Z',
      author: 'github:writer',
      ...frontmatter,
    }
    const raw = `---\n${Object.entries(data)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n')}\n---\n${body}`
    fs.writeFileSync(path.join(root, filename), raw)
    sources.set(filename, raw)
    candidates.push({
      key: id,
      language,
      url: `https://www.nervos.org${language === 'en' ? '' : `/${language}`}/knowledge-base/${id}`,
      hub: 'basics',
      subjects: ['fundamentals'],
      internalTags: ['fixture'],
    })
  }
  const handoffPath = path.join(metadata, 'handoff.json')
  const handoff = JSON.stringify({
    hubs: [{ id: 'basics', title: 'Basics' }],
    subjects: [{ id: 'fundamentals', hub: 'basics', title: 'Fundamentals' }],
    candidates,
    featured: [],
  })
  fs.writeFileSync(handoffPath, handoff)
  const catalogPath = path.join(metadata, 'catalog.json')
  return {
    root,
    sources,
    readCatalog: () => JSON.parse(fs.readFileSync(catalogPath, 'utf8')),
    writeCatalog: catalog => fs.writeFileSync(catalogPath, JSON.stringify(catalog)),
    prepare() {
      const before = new Map([...sources.keys()].map(file => [file, fs.readFileSync(path.join(root, file), 'utf8')]))
      const written = []
      execute(
        preparation,
        {
          'node:fs': {
            ...fs,
            writeFileSync(file, ...args) {
              assert.ok(
                [catalogPath, path.join(metadata, 'reconciliation.json')].includes(file),
                `Preparation must only write its two sidecar files: ${file}`,
              )
              written.push(file)
              return fs.writeFileSync(file, ...args)
            },
          },
          'node:child_process': {
            execFileSync(command, args) {
              assert.equal(command, 'git')
              assert.deepEqual(args, ['-C', root, 'rev-parse', 'HEAD'])
              return `${sourceCommit}\n`
            },
          },
          './migrate-kb-slugs.mjs': { readSlugMigrations, rewriteKBUrl },
        },
        { argv: ['node', 'prepare-kb-content.mjs', root] },
      )
      assert.deepEqual(written.sort(), [catalogPath, path.join(metadata, 'reconciliation.json')].sort())
      assert.equal(fs.readFileSync(handoffPath, 'utf8'), handoff)
      for (const [file, raw] of before) assert.equal(fs.readFileSync(path.join(root, file), 'utf8'), raw)
      return this.readCatalog()
    },
    load() {
      return execute(
        loader,
        { 'node:fs': { ...fs, writeFileSync: () => assert.fail('The content loader must not write files') } },
        { cwd: () => workspace },
      )
    },
  }
}

test('each locale carries its own SEO description while preserving visible subtitle, body and search text', t => {
  const descriptions = {
    en: 'Independent English search description.',
    zh: '独立的中文搜索描述，不替换页面副标题。',
    es: 'Descripción de búsqueda en español, independiente del subtítulo.',
  }
  const content = fixture(
    t,
    Object.entries(descriptions).map(([language, description]) => ({ id: 'localized', language, description })),
  )
  const manifest = content.prepare()
  assert.equal(manifest.sourceCommit, sourceCommit)
  assert.equal(manifest.articles.length, 3)
  const api = content.load()
  for (const [language, description] of Object.entries(descriptions)) {
    const stored = manifest.articles.find(article => article.language === language)
    const [article] = api.getKBCatalog(language, true).articles
    assert.equal(stored.description, description)
    assert.equal(article.description, description)
    assert.equal(article.subtitle, `${language} visible subtitle`)
    assert.equal(stored.subtitle, article.subtitle)
    assert.equal(article.text.trim(), 'Visible heading Body copy link.')
    assert.equal(api.getKBArticle('localized', language), body)
    assert.equal(stored.sourceSHA256, hash(content.sources.get(stored.sourceFile)))
    assert.equal(stored.bodySHA256, hash(body))
    assert.equal(Object.hasOwn(api.getKBCatalog(language).articles[0], 'text'), false)
    assert.equal(api.getKBCatalog(language).articles.length, 1)
  }
  assert.deepEqual(api.getKBCatalog('fr').articles, [])
})

test('missing, empty, whitespace-only and non-string descriptions remain absent in generated and loaded data', t => {
  const invalid = ['', ' \t\n ', null, false, 42, ['not prose'], { text: 'not prose' }]
  const content = fixture(t, [
    { id: 'missing' },
    ...invalid.map((description, index) => ({ id: `invalid_${index}`, description })),
  ])
  const manifest = content.prepare()
  for (const article of [...manifest.articles, ...content.load().getKBCatalog().articles]) {
    assert.equal(Object.hasOwn(article, 'description'), false, article.id)
    assert.equal(article.subtitle, 'en visible subtitle')
  }
})

test('the loader also rejects invalid optional values in an existing catalog without replacing subtitles', t => {
  const content = fixture(t, [{ id: 'existing' }])
  const manifest = content.prepare()
  for (const description of ['', ' \t\n ', null, true, 12, [], {}]) {
    manifest.articles[0].description = description
    content.writeCatalog(manifest)
    const [article] = content.load().getKBCatalog('en', true).articles
    assert.equal(Object.hasOwn(article, 'description'), false)
    assert.equal(article.subtitle, 'en visible subtitle')
    assert.equal(article.text.trim(), 'Visible heading Body copy link.')
  }
})

test('long descriptions retain full prose and internal whitespace without OpenGraph normalization', t => {
  const description = `  A **complete** description with <em>markup</em> and &amp; entities.\n${'Keep the full SEO source. '.repeat(20)}  `
  assert.ok(description.length > 160)
  const content = fixture(t, [{ id: 'long_description', description }])
  const manifest = content.prepare()
  assert.equal(manifest.articles[0].description, description.trim())
  assert.equal(content.load().getKBCatalog().articles[0].description, description.trim())
  assert.equal(content.prepare().articles[0].description, description.trim(), 'Regeneration retains the complete prose')
  manifest.articles[0].description = description
  content.writeCatalog(manifest)
  assert.equal(
    content.load().getKBCatalog().articles[0].description,
    description,
    'The loader passes valid values through',
  )
})

test('description presence does not change draft, unpublished or future-date filtering', t => {
  const content = fixture(
    t,
    [
      { id: 'published' },
      { id: 'draft', draft: true },
      { id: 'unpublished', published: false },
      { id: 'future', date: '2999-01-01T00:00:00.000Z' },
      { id: 'undated', date: null },
    ].map(entry => ({ ...entry, description: `SEO description for ${entry.id}` })),
  )
  const manifest = content.prepare()
  assert.equal(manifest.articles.length, 5)
  assert.deepEqual(
    manifest.articles.filter(article => article.draft).map(article => article.id),
    ['draft', 'unpublished'],
  )
  const api = content.load()
  assert.deepEqual(
    api.getKBCatalog().articles.map(article => article.id),
    ['published', 'undated'],
  )
  for (const id of ['draft', 'unpublished', 'future']) {
    assert.equal(api.getKBArticleStatus(id), 'unpublished')
    assert.equal(api.getKBArticle(id), null)
  }
  for (const id of ['published', 'undated']) {
    assert.equal(api.getKBArticleStatus(id), 'published')
    assert.equal(api.getKBArticle(id), body)
  }
  assert.equal(api.getKBArticleStatus('missing'), 'missing')
})

test('adding only a source description still requires fresh source hashes and preserves body hashes and editorial data', t => {
  const content = fixture(t, [{ id: 'hash_guard' }])
  const before = content.prepare().articles[0]
  const filename = path.join(content.root, before.sourceFile)
  const original = fs.readFileSync(filename, 'utf8')
  fs.writeFileSync(filename, original.replace('---\n', '---\ndescription: "Added SEO metadata"\n'))
  const api = content.load()
  assert.throws(() => api.getKBCatalog(), /KB metadata is stale: hash_guard\/index\.md/)
  assert.throws(() => api.getKBArticle('hash_guard'), /KB metadata is stale:/)
  const after = content.prepare().articles[0]
  assert.notEqual(after.sourceSHA256, before.sourceSHA256)
  assert.equal(after.sourceSHA256, hash(fs.readFileSync(filename)))
  assert.equal(after.bodySHA256, before.bodySHA256)
  const { description, sourceSHA256: afterHash, ...afterMetadata } = after
  const { sourceSHA256: beforeHash, ...beforeMetadata } = before
  assert.equal(description, 'Added SEO metadata')
  assert.deepEqual(afterMetadata, beforeMetadata)
  assert.equal(api.getKBCatalog().articles[0].description, description)
  assert.equal(api.getKBArticle('hash_guard'), body)
})

test('the checked-in catalog reflects source descriptions and retains valid source and body hashes without regeneration', () => {
  const root = path.join(repository, 'public/education_hub_articles')
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'metadata/catalog.json'), 'utf8'))
  assert.ok(catalog.articles.length > 0)
  for (const article of catalog.articles) {
    const raw = fs.readFileSync(path.join(root, article.sourceFile), 'utf8')
    const parsed = matter(raw)
    assert.equal(article.sourceSHA256, hash(raw), article.sourceFile)
    assert.equal(article.bodySHA256, hash(parsed.content), article.sourceFile)
    const description = parsed.data.description
    if (typeof description === 'string' && description.trim()) assert.equal(article.description, description.trim())
    else assert.equal(Object.hasOwn(article, 'description'), false, article.sourceFile)
    assert.equal(article.subtitle, typeof parsed.data.subtitle === 'string' ? parsed.data.subtitle.trim() : '')
  }
})
