import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import ts from 'typescript'
import matter from 'gray-matter'
import { readSlugMigrations, rewriteKBUrl } from './migrate-kb-slugs.mjs'

const require = createRequire(import.meta.url)
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const preparation = ts.transpileModule(
  fs.readFileSync(path.join(repository, 'scripts/prepare-kb-content.mjs'), 'utf8'),
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  },
).outputText
const sourceCommit = '1234567890abcdef1234567890abcdef12345678'
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const fields = ['hub', 'subjects', 'internalTags', 'librarySection', 'relatedArticleIds', 'excludedFromRecommendations']
const english = (extra = {}) => ({
  id: 'alpha',
  language: 'en',
  hub: 'current',
  subjects: ['current-subject'],
  internalTags: ['current-tag'],
  librarySection: 'hub',
  relatedArticleIds: ['related'],
  excludedFromRecommendations: true,
  reviewStatus: 'pending-editorial',
  matchMethod: 'existing-classification',
  candidateKeys: ['old-evidence'],
  ...extra,
})
const proposal = (extra = {}) => ({
  key: 'alpha',
  language: 'en',
  url: 'https://www.nervos.org/knowledge-base/alpha',
  hub: 'historical',
  subjects: ['historical-subject'],
  internalTags: ['historical-tag'],
  ...extra,
})

function fixture(
  t,
  {
    previous = [english()],
    candidates = [proposal()],
    migrations,
    files = [{ language: 'en' }, { language: 'zh' }],
  } = {},
) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-translation-metadata-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const metadata = path.join(root, 'metadata')
  fs.mkdirSync(metadata, { recursive: true })
  const handoff = {
    hubs: [{ id: 'current' }, { id: 'historical' }],
    subjects: [
      { id: 'current-subject', hub: 'current' },
      { id: 'historical-subject', hub: 'historical' },
    ],
    candidates,
    featured: [],
  }
  const protectedFiles = new Map()
  const write = (name, value) => {
    const filename = path.join(root, name)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    const content = typeof value === 'string' ? value : JSON.stringify(value)
    fs.writeFileSync(filename, content)
    protectedFiles.set(filename, content)
  }
  write('metadata/handoff.json', handoff)
  if (migrations) write('metadata/slug-migrations.json', { renames: migrations })
  const sources = new Map()
  for (const { id = 'alpha', language = 'en', body = `\n${language} body.\n`, ...extra } of files) {
    const sourceFile = `${id}/index${language === 'en' ? '' : `_${language}`}.md`
    const data = {
      title: `${language} own title`,
      subtitle: `${language} own subtitle`,
      description: `${language} own description`,
      author: `github:${language}-writer`,
      date: '2020-01-01T00:00:00.000Z',
      coverImage: `${language}.png`,
      ...extra,
    }
    const raw = `---\n${Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join('\n')}\n---\n${body}`
    write(sourceFile, raw)
    write(`${id}/${language}.png`, `${language} image bytes`)
    sources.set(sourceFile, raw)
  }
  const catalogPath = path.join(metadata, 'catalog.json')
  if (previous !== null)
    fs.writeFileSync(catalogPath, JSON.stringify({ schemaVersion: 1, articles: previous, featured: [] }))
  return {
    root,
    sources,
    prepare() {
      const written = []
      const loadedModule = { exports: {} }
      const imports = {
        'node:fs': {
          ...fs,
          writeFileSync(filename, ...args) {
            assert(
              [catalogPath, path.join(metadata, 'reconciliation.json')].includes(filename),
              'Only sidecar files may change',
            )
            written.push(filename)
            return fs.writeFileSync(filename, ...args)
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
      }
      new Function('require', 'module', 'exports', 'process', 'console', preparation)(
        name => (Object.hasOwn(imports, name) ? imports[name] : require(name)),
        loadedModule,
        loadedModule.exports,
        { argv: ['node', 'prepare-kb-content.mjs', root] },
        { log: () => undefined },
      )
      assert.deepEqual(written.sort(), [catalogPath, path.join(metadata, 'reconciliation.json')].sort())
      for (const [filename, content] of protectedFiles) assert.equal(fs.readFileSync(filename, 'utf8'), content)
      return JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
    },
  }
}

test('new translations inherit current English structure before historical translation or English proposals', t => {
  const source = english()
  const f = fixture(t, {
    previous: [source],
    candidates: [proposal(), proposal({ language: 'zh', url: 'https://www.nervos.org/zh/knowledge-base/alpha' })],
  })
  const result = f.prepare()
  const translated = result.articles.find(article => article.language === 'zh')
  for (const field of fields) assert.deepEqual(translated[field], source[field], field)
  assert.equal(translated.matchMethod, 'current-english-translation')
  assert.deepEqual(
    translated.candidateKeys,
    [],
    'Do not mislabel historical evidence as the inherited classification source',
  )
  assert.equal(translated.reviewStatus, 'pending-editorial')
  assert.deepEqual(
    f.prepare().articles,
    result.articles,
    'Regeneration preserves the chosen translated structure and provenance',
  )
})

test('pending English classifications can supply structure without claiming translated copy has editorial approval', t => {
  for (const reviewStatus of ['pending-editorial', 'approved', 'content-approved', undefined]) {
    const source = english({ reviewStatus })
    const f = fixture(t, { previous: [source] })
    const translated = f.prepare().articles.find(article => article.language === 'zh')
    assert.equal(translated.hub, 'current')
    assert.equal(translated.reviewStatus, 'pending-editorial', String(reviewStatus))
    assert.notEqual(translated.matchMethod, source.matchMethod)
  }
})

test('null classification, explicit false, and empty structural lists are intentional, not fallback triggers', t => {
  const source = english({
    hub: null,
    subjects: [],
    internalTags: [],
    librarySection: 'general',
    relatedArticleIds: [],
    excludedFromRecommendations: false,
  })
  const f = fixture(t, { previous: [source] })
  const translated = f.prepare().articles.find(article => article.language === 'zh')
  for (const field of fields) assert.deepEqual(translated[field], source[field], field)
})

test('existing translations keep their independent classification, recommendation choices, review and evidence', t => {
  const source = english()
  const translation = english({
    language: 'zh',
    hub: null,
    subjects: [],
    internalTags: ['translation-only'],
    librarySection: 'general',
    relatedArticleIds: [],
    excludedFromRecommendations: false,
    reviewStatus: 'translated-review-complete',
    matchMethod: 'translation-manual',
    candidateKeys: ['translation-evidence'],
  })
  const f = fixture(t, { previous: [source, translation] })
  const translated = f.prepare().articles.find(article => article.language === 'zh')
  for (const field of [...fields, 'reviewStatus', 'matchMethod', 'candidateKeys'])
    assert.deepEqual(translated[field], translation[field], field)
})

test('translated text, authors, dates, images, publication flags and hashes always come from that translation', t => {
  const f = fixture(t, {
    previous: [
      english({
        title: 'DO NOT COPY',
        subtitle: 'DO NOT COPY',
        description: 'DO NOT COPY',
        authors: ['wrong-author'],
        date: '1990-01-01T00:00:00.000Z',
        draft: false,
      }),
    ],
    files: [
      { language: 'en' },
      {
        language: 'zh',
        title: '自己的中文标题',
        subtitle: '中文摘要',
        description: '自己的中文描述',
        date: '2035-01-01T00:00:00.000Z',
        author: 'github:translator',
        draft: true,
      },
    ],
  })
  const translated = f.prepare().articles.find(article => article.language === 'zh')
  assert.equal(translated.title, '自己的中文标题')
  assert.equal(translated.subtitle, '中文摘要')
  assert.equal(translated.description, '自己的中文描述')
  assert.deepEqual(translated.authors, ['translator'])
  assert.equal(translated.date, '2035-01-01T00:00:00.000Z')
  assert.equal(translated.draft, true)
  assert.equal(translated.coverImage, '/education_hub_articles/alpha/zh.png')
  assert.equal(translated.canonicalPath, '/zh/knowledge-base/alpha')
  const raw = f.sources.get('alpha/index_zh.md')
  assert.equal(translated.sourceSHA256, hash(raw))
  assert.equal(translated.bodySHA256, hash(matter(raw).content))
})

test('missing or blank translated descriptions never inherit English SEO copy', t => {
  for (const description of [undefined, '', '   ', null, 42]) {
    const f = fixture(t, { files: [{ language: 'en' }, { language: 'zh', description }] })
    const translated = f.prepare().articles.find(article => article.language === 'zh')
    assert.equal(Object.hasOwn(translated, 'description'), false)
    assert.equal(translated.title, 'zh own title')
    assert.equal(translated.subtitle, 'zh own subtitle')
  }
})

test('new non-Chinese renditions inherit only structure, and missing translated fields stay missing', t => {
  const f = fixture(t, {
    previous: [
      english({
        title: 'English title',
        subtitle: 'English summary',
        description: 'English SEO',
        authors: ['english-writer'],
        date: '2020-01-01T00:00:00.000Z',
      }),
    ],
    files: [
      { language: 'en' },
      {
        language: 'es',
        title: undefined,
        subtitle: undefined,
        description: undefined,
        author: undefined,
        date: undefined,
        coverImage: undefined,
      },
    ],
  })
  const translated = f.prepare().articles.find(article => article.language === 'es')
  assert.equal(translated.hub, 'current')
  assert.equal(translated.title, 'alpha')
  assert.equal(translated.subtitle, '')
  assert.equal(Object.hasOwn(translated, 'description'), false)
  assert.deepEqual(translated.authors, [])
  assert.equal(translated.date, null)
  assert.equal(translated.coverImage, null)
  assert.equal(translated.reviewStatus, 'pending-editorial')
})

test('without current English metadata, historical same-source proposals remain proposals', t => {
  for (const previous of [null, [], [english({ id: 'different_article' })]]) {
    const f = fixture(t, { previous })
    const translated = f.prepare().articles.find(article => article.language === 'zh')
    assert.equal(translated.hub, 'historical')
    assert.deepEqual(translated.internalTags, ['historical-tag'])
    assert.equal(translated.matchMethod, 'same-source-translation-proposal')
    assert.equal(translated.reviewStatus, 'pending-editorial')
  }
})

test('missing English metadata and conflicting historical evidence do not invent a classification', t => {
  const f = fixture(t, {
    previous: [],
    candidates: [proposal(), proposal({ hub: 'current', subjects: ['current-subject'] })],
  })
  const translated = f.prepare().articles.find(article => article.language === 'zh')
  assert.equal(translated.hub, null)
  assert.deepEqual(translated.subjects, [])
  assert.equal(translated.reviewStatus, 'pending-editorial')
  assert(translated.warnings.includes('conflicting-candidates'))
})

test('current English inheritance remains traceable even with no historical candidate', t => {
  const f = fixture(t, { candidates: [] })
  const translated = f.prepare().articles.find(article => article.language === 'zh')
  assert.equal(translated.hub, 'current')
  assert.equal(translated.matchMethod, 'current-english-translation')
  assert(!translated.warnings.includes('no-exact-candidate'))
})

test('approved slug mappings still resolve inherited identities and recommendation IDs without changing source files', t => {
  const f = fixture(t, {
    previous: [english({ id: 'Alpha_Old', relatedArticleIds: ['Related_Old'] })],
    candidates: [],
    migrations: [
      { from: 'Alpha_Old', to: 'alpha' },
      { from: 'Related_Old', to: 'related' },
    ],
  })
  const translated = f.prepare().articles.find(article => article.language === 'zh')
  assert.equal(translated.id, 'alpha')
  assert.equal(translated.sourceFile, 'alpha/index_zh.md')
  assert.equal(translated.canonicalPath, '/zh/knowledge-base/alpha')
  assert.equal(translated.hub, 'current')
  assert.deepEqual(translated.relatedArticleIds, ['related'])
})

test('existing invalid taxonomy is rejected rather than hidden by a historical fallback', t => {
  const f = fixture(t, { previous: [english({ subjects: ['not-owned-by-current'] })] })
  assert.throws(() => f.prepare(), /Invalid taxonomy/)
})
