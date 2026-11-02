import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  createIndexNowManifest,
  main,
  planIndexNow,
  scopedEntries,
  stableHash,
  validateManifest,
} from './indexnow-manifest.mjs'
import { loadSitemapEntries } from './generate-sitemap.mjs'

const ORIGIN = 'https://www.nervos.org'
const REVISION = 'a'.repeat(40)
const NOW = Date.parse('2027-01-01T00:00:00.000Z')
const hashBytes = value => crypto.createHash('sha256').update(value).digest('hex')
const baselineFor = (manifest, scope = 'kb') => ({
  schemaVersion: 1,
  scope,
  manifest,
  deploymentId: '123456',
  notifiedAt: '2027-01-01T00:00:00.000Z',
})
const withDigest = value => {
  const payload = structuredClone(value)
  delete payload.digest
  return { ...payload, digest: stableHash(payload) }
}

function fixture(t) {
  const repository = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-indexnow-manifest-'))
  t.after(() => fs.rmSync(repository, { recursive: true, force: true }))
  const write = (name, value) => {
    const filename = path.join(repository, name)
    fs.mkdirSync(path.dirname(filename), { recursive: true })
    fs.writeFileSync(filename, typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value))
  }
  const catalog = {
    schemaVersion: 1,
    sourceCommit: 'old-source-commit',
    hubs: [],
    subjects: [],
    featured: [],
    articles: [],
  }
  const save = () => write('public/education_hub_articles/metadata/catalog.json', catalog)
  const article = (id = 'example', language = 'en', extra = {}, body = 'Body ![plot](images/plot.png)') => {
    const sourceFile = `${id}/index${language === 'en' ? '' : `_${language}`}.md`
    const raw = `---\ntitle: Example\ncoverImage: 'images/plot.png'\n---\n${body}\n`
    write(`public/education_hub_articles/${sourceFile}`, raw)
    write(`public/education_hub_articles/${id}/images/plot.png`, Buffer.from([1, 2, 3]))
    catalog.articles.push({
      id,
      language,
      canonicalPath: `${language === 'en' ? '' : `/${language}`}/knowledge-base/${id}`,
      sourceFile,
      sourceSHA256: hashBytes(raw),
      date: '2020-01-01T00:00:00.000Z',
      title: 'Example',
      description: 'Editorial description',
      draft: false,
      coverImage: `/education_hub_articles/${id}/images/plot.png`,
      ...extra,
    })
    save()
    return catalog.articles.at(-1)
  }
  write('public/education_hub_articles/metadata/slug-migrations.json', { renames: [] })
  write('public/locales/en/home.json', { title: 'Home' })
  write('public/locales/en/common.json', { menu: 'Menu' })
  write('src/components/Page.tsx', 'export const icon = "/images/shared.svg"')
  write('src/styles/global.scss', 'body { color: black; }')
  write('public/images/shared.svg', '<svg/>')
  save()
  const manifest = (options = {}) => createIndexNowManifest({ repository, revision: REVISION, now: NOW, ...options })
  return { repository, write, catalog, article, save, manifest }
}

test('stable JSON hashes ignore object insertion order, but preserve array order', () => {
  assert.equal(stableHash({ b: 2, a: [{ z: 1, a: 2 }] }), stableHash({ a: [{ a: 2, z: 1 }], b: 2 }))
  assert.notEqual(stableHash([1, 2]), stableHash([2, 1]))
  for (const invalid of [undefined, NaN, Infinity, new Date(), { secret: undefined }])
    assert.throws(() => stableHash(invalid))
})

test('snapshot uses validated sitemap and excludes drafts, future content and nonexistent language renditions', t => {
  const f = fixture(t)
  f.article()
  f.article('example', 'zh')
  f.article('future', 'en', { date: '2999-01-01' })
  f.article('draft', 'en', { draft: true })
  const manifest = f.manifest()
  assert.equal(validateManifest(manifest), manifest)
  assert.deepEqual(
    manifest.entries.map(item => item.url),
    loadSitemapEntries(f.repository, NOW)
      .map(item => item.loc)
      .sort(),
  )
  assert(manifest.entries.some(item => item.url === `${ORIGIN}/zh/knowledge-base/example`))
  assert(!manifest.entries.some(item => /future|draft|\/es\/knowledge-base\/example/.test(item.url)))
  assert(manifest.entries.every(item => Object.keys(item).sort().join(',') === 'hash,url'))
  assert(!JSON.stringify(manifest).includes('Editorial description'))
})

test('entry hashes are independent of revision, publication clock, audit metadata and unrelated public assets', t => {
  const f = fixture(t)
  f.article()
  const before = f.manifest()
  f.catalog.sourceCommit = 'new-source-commit'
  f.save()
  f.write('public/education_hub_articles/metadata/reconciliation.json', { generatedAt: NOW + 1234 })
  f.write('public/unrelated-downloads/archive.bin', 'not referenced')
  f.write('src/components/Page.test.mjs', 'test changes only')
  const after = f.manifest({ revision: 'b'.repeat(40), now: NOW + 100_000 })
  assert.deepEqual(after.entries, before.entries)
  assert.notEqual(after.digest, before.digest)
  assert.deepEqual(planIndexNow({ manifest: after, baseline: baselineFor(before) }).urls, [])
})

test('generated article output is ignored, but handwritten adapter and rendering parser changes invalidate pages', t => {
  const f = fixture(t)
  f.article()
  f.write('src/database/articles/index.ts', 'export const getArticle = id => articles[id]')
  f.write('scripts/generate-articles.mjs', 'import { parseBlog } from "./generate-articles/parserBlog.mjs"')
  f.write('scripts/generate-articles/parserBlog.mjs', 'export const parseBlog = source => source')
  const before = f.manifest()
  f.write('src/database/articles/list.ts', 'export const slugs = ["generated-list"]')
  f.write('src/database/articles/example/index.ts', 'export const slug = { birthtime: "new filesystem time" }')
  assert.deepEqual(f.manifest().entries, before.entries)
  f.write('src/database/articles/example/index.ts', 'export const slug={birthtime:"different formatter / clock"}')
  assert.deepEqual(f.manifest().entries, before.entries)
  f.write('scripts/indexnow-unrelated.mjs', 'non-rendering notification tooling')
  f.write('scripts/generate-articles/parserBlog.test.mjs', 'parser test only')
  assert.deepEqual(f.manifest().entries, before.entries)
  f.write('scripts/generate-articles/parserBlog.mjs', 'export const parseBlog = source => source.trim()')
  const parserChanged = f.manifest()
  assert(parserChanged.entries.every((entry, index) => entry.hash !== before.entries[index].hash))
  f.write('src/database/articles/index.ts', 'export const getArticle = id => articles[id] ?? null')
  assert(f.manifest().entries.every((entry, index) => entry.hash !== parserChanged.entries[index].hash))
})

test('body edits with unchanged publication date invalidate the article and KB consumers', t => {
  const f = fixture(t)
  const article = f.article()
  const before = f.manifest()
  const body = '---\ntitle: Example\n---\nChanged body, same date\n'
  f.write(`public/education_hub_articles/${article.sourceFile}`, body)
  assert.throws(() => f.manifest(), /metadata is stale/)
  article.sourceSHA256 = hashBytes(body)
  f.save()
  const after = f.manifest()
  const plan = planIndexNow({ manifest: after, baseline: baselineFor(before) })
  for (const route of [
    '/knowledge-base',
    '/knowledge-base/start-here',
    '/knowledge-base/articles',
    '/knowledge-base/example',
  ])
    assert(plan.changes.updated.includes(`${ORIGIN}${route}`))
  assert.equal(
    before.entries.find(entry => entry.url === `${ORIGIN}/`).hash,
    after.entries.find(entry => entry.url === `${ORIGIN}/`).hash,
  )
})

test('editorial metadata, cover images, relative HTML/Markdown and cross-article shared images are hashed by actual bytes', t => {
  const f = fixture(t)
  const article = f.article(
    'example',
    'en',
    {},
    '![plot](images/plot.png)\n<img src="/images/chart.svg">\n![shared](../other/images/common.webp)\n[remote](https://external.example/image.png)',
  )
  f.write('public/images/chart.svg', '<svg>chart</svg>')
  f.write('public/education_hub_articles/other/images/common.webp', Buffer.from([4, 5, 6]))
  let before = f.manifest()
  for (const [filename, bytes] of [
    ['public/education_hub_articles/example/images/plot.png', Buffer.from([8, 8])],
    ['public/images/chart.svg', '<svg>changed</svg>'],
    ['public/education_hub_articles/other/images/common.webp', Buffer.from([9, 9])],
  ]) {
    f.write(filename, bytes)
    const after = f.manifest()
    assert.notEqual(
      before.entries.find(entry => entry.url.endsWith('/example')).hash,
      after.entries.find(entry => entry.url.endsWith('/example')).hash,
      filename,
    )
    before = after
  }
  article.description = 'Updated editorial SEO description'
  f.save()
  assert.notEqual(
    before.entries.find(entry => entry.url.endsWith('/example')).hash,
    f.manifest().entries.find(entry => entry.url.endsWith('/example')).hash,
  )
})

test('shared source, styles, translations and referenced public assets invalidate consumers', t => {
  const f = fixture(t)
  f.article()
  let before = f.manifest()
  for (const [filename, value] of [
    ['src/styles/global.scss', 'body { color: purple; }'],
    ['src/components/Page.tsx', 'export const icon = "/images/shared.svg"; export const label = "New"'],
    ['public/locales/en/common.json', { menu: 'New menu' }],
    ['public/images/shared.svg', '<svg>new bytes</svg>'],
  ]) {
    f.write(filename, value)
    const after = f.manifest()
    assert(
      after.entries.every((entry, index) => entry.hash !== before.entries[index].hash),
      filename,
    )
    before = after
  }
})

test('explicit dynamic public image filename templates include matching asset bytes only', t => {
  const f = fixture(t)
  f.article()
  f.write('src/components/Dynamic.tsx', 'const icon = `/images/footer-${kind}.svg`')
  f.write('public/images/footer-one.svg', '<svg>one</svg>')
  const before = f.manifest()
  f.write('public/images/not-used.svg', '<svg>unrelated</svg>')
  assert.deepEqual(f.manifest().entries, before.entries)
  f.write('public/images/footer-one.svg', '<svg>changed</svg>')
  assert.notDeepEqual(f.manifest().entries, before.entries)
})

test('reference-style Markdown, srcset and root public images also include actual local bytes', t => {
  const f = fixture(t)
  f.article(
    'example',
    'en',
    {},
    '![reference][chart]\n[chart]: images/reference.webp\n<img srcset="images/small.png 1x, images/large.png 2x">',
  )
  f.write('src/components/Head.tsx', 'const favicon = "/favicon.svg"')
  for (const filename of ['reference.webp', 'small.png', 'large.png']) {
    f.write(`public/education_hub_articles/example/images/${filename}`, 'original bytes')
  }
  f.write('public/favicon.svg', '<svg>favicon</svg>')
  let before = f.manifest()
  for (const filename of [
    'public/education_hub_articles/example/images/reference.webp',
    'public/education_hub_articles/example/images/small.png',
    'public/education_hub_articles/example/images/large.png',
    'public/favicon.svg',
  ]) {
    f.write(filename, 'changed bytes')
    const after = f.manifest()
    assert.notEqual(
      before.entries.find(entry => entry.url.endsWith('/example')).hash,
      after.entries.find(entry => entry.url.endsWith('/example')).hash,
      filename,
    )
    before = after
  }
})

test('planning retains deleted URLs, new real translations, initial approval state and scope', t => {
  const f = fixture(t)
  const article = f.article()
  const before = f.manifest()
  f.article('new-article')
  f.article('new-article', 'zh')
  f.catalog.articles = f.catalog.articles.filter(item => item !== article)
  fs.unlinkSync(path.join(f.repository, 'public/education_hub_articles', article.sourceFile))
  f.save()
  const after = f.manifest()
  const plan = planIndexNow({ manifest: after, baseline: baselineFor(before) })
  assert.equal(plan.initial, false)
  assert.deepEqual(plan.changes.deleted, [`${ORIGIN}/knowledge-base/example`])
  assert(plan.changes.added.includes(`${ORIGIN}/knowledge-base/new-article`))
  assert(plan.changes.added.includes(`${ORIGIN}/zh/knowledge-base/new-article`))
  assert.equal(plan.baselineDigest, before.digest)
  assert.equal(plan.manifestDigest, after.digest)
  assert.equal(plan.digest, withDigest(plan).digest)
  assert.deepEqual(plan.urls, [...new Set(Object.values(plan.changes).flat())].sort())
  const initial = planIndexNow({ manifest: after })
  assert.equal(initial.initial, true)
  assert.equal(initial.baselineDigest, null)
  assert(initial.urls.every(url => new URL(url).pathname.includes('/knowledge-base')))
  assert(scopedEntries(after, 'site').some(entry => entry.url === `${ORIGIN}/`))
  assert.throws(() => scopedEntries(after, 'all'), /scope/)
  assert.throws(() => planIndexNow({ manifest: after, baseline: baselineFor(before, 'site') }), /scope/)
  assert.throws(
    () => planIndexNow({ manifest: after, baseline: { ...baselineFor(before), deploymentId: 'unknown' } }),
    /deployment ID/,
  )
  assert.throws(
    () => planIndexNow({ manifest: after, baseline: { ...baselineFor(before), notifiedAt: 'yesterday' } }),
    /timestamp/,
  )
})

test('pagination enters and leaves the plan when real published article count changes', t => {
  const f = fixture(t)
  for (let index = 0; index < 24; index++) f.article(`article-${index}`)
  const before = f.manifest()
  f.article('article-25')
  const after = f.manifest()
  assert(
    planIndexNow({ manifest: after, baseline: baselineFor(before) }).changes.added.includes(
      `${ORIGIN}/knowledge-base/articles?page=2`,
    ),
  )
  assert(
    planIndexNow({ manifest: before, baseline: baselineFor(after) }).changes.deleted.includes(
      `${ORIGIN}/knowledge-base/articles?page=2`,
    ),
  )
})

test('invalid, noncanonical, duplicate, tampered and foreign-origin snapshots fail closed', t => {
  const f = fixture(t)
  f.article()
  const original = f.manifest()
  for (const url of [
    'https://preview.vercel.app/knowledge-base/example',
    `${ORIGIN}/en/knowledge-base/example`,
    `${ORIGIN}/knowledge-base/example/`,
    `${ORIGIN}/knowledge-base/example#section`,
    `${ORIGIN}/knowledge-base/example?sort_by=latest`,
    `${ORIGIN}/knowledge-base/articles?page=1`,
    `${ORIGIN}/knowledge-base/articles?page=02`,
    `${ORIGIN}/knowledge-base?page=2`,
    `${ORIGIN}/zh/knowledge-base`,
    `${ORIGIN}/knowledge-base/search`,
    `${ORIGIN}/home`,
    `${ORIGIN}/knowledge-base/%65xample`,
    `${ORIGIN}/knowledge-base/topic/not-a-hub`,
  ]) {
    const value = structuredClone(original)
    value.entries = [{ url, hash: 'a'.repeat(64) }]
    assert.throws(() => validateManifest(withDigest(value)), undefined, url)
  }
  const corrupt = structuredClone(original)
  corrupt.entries[0].hash = 'b'.repeat(64)
  assert.throws(() => validateManifest(corrupt), /digest mismatch/)
  for (const entries of [[original.entries[0], original.entries[0]], [...original.entries].reverse(), []]) {
    assert.throws(() => validateManifest(withDigest({ ...original, entries })))
  }
  assert.throws(() => validateManifest(withDigest({ ...original, revision: 'short' })), /revision/)
  assert.throws(() => validateManifest(withDigest({ ...original, origin: 'https://evil.example' })), /origin/)
  assert.throws(() => validateManifest(withDigest({ ...original, secret: 'extra' })), /fields/)
})

test('stale/missing catalog sources and escaping source or asset symlinks are rejected', t => {
  const f = fixture(t)
  const article = f.article()
  const filename = path.join(f.repository, 'public/education_hub_articles', article.sourceFile)
  f.catalog.articles = []
  f.save()
  assert.throws(() => f.manifest(), /catalog is stale/)
  f.catalog.articles = [article]
  article.sourceFile = '../outside.md'
  f.save()
  assert.throws(() => f.manifest(), /Invalid content source path/)
  article.sourceFile = 'example/index.md'
  f.save()
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-indexnow-outside-'))
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }))
  fs.writeFileSync(path.join(outside, 'source.md'), 'private text')
  fs.unlinkSync(filename)
  fs.symlinkSync(path.join(outside, 'source.md'), filename)
  assert.throws(() => f.manifest(), /symlink escapes/)
  fs.unlinkSync(filename)
  const raw = '---\ntitle: Example\n---\n![escape](/images/escape.png)'
  f.write(`public/education_hub_articles/${article.sourceFile}`, raw)
  article.sourceSHA256 = hashBytes(raw)
  f.save()
  fs.symlinkSync(path.join(outside, 'source.md'), path.join(f.repository, 'public/images/escape.png'))
  assert.throws(() => f.manifest(), /symlink escapes/)
})

test('CLI generates matching manifest and release marker without networking or changing content', t => {
  const f = fixture(t)
  f.article()
  main(['--repository', f.repository, '--revision', REVISION])
  const generated = JSON.parse(fs.readFileSync(path.join(f.repository, 'public/indexnow-manifest.json'), 'utf8'))
  assert.equal(validateManifest(generated), generated)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.repository, 'public/indexnow-release.json'), 'utf8')), {
    schemaVersion: 1,
    revision: REVISION,
    manifestDigest: generated.digest,
  })
  assert(!fs.readdirSync(path.join(f.repository, 'public')).some(name => name.endsWith('.tmp')))
  assert.deepEqual(generated, createIndexNowManifest({ repository: f.repository, revision: REVISION }))
  assert.throws(() => main(['--repository', f.repository, '--revision', 'invalid']), /revision/)
  assert.throws(() => main(['--submit']), /Unknown/)
})

test('current reviewed checkout builds a complete validated canonical snapshot', () => {
  const manifest = createIndexNowManifest({ revision: REVISION })
  assert.deepEqual(
    manifest.entries.map(entry => entry.url),
    loadSitemapEntries()
      .map(entry => entry.loc)
      .sort(),
  )
  assert(manifest.entries.length > 300)
})

test('CLI validates Vercel revision before output, and explicit revision takes precedence', t => {
  const f = fixture(t)
  f.article()
  const previous = process.env.VERCEL_GIT_COMMIT_SHA
  t.after(() => {
    if (previous === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA
    else process.env.VERCEL_GIT_COMMIT_SHA = previous
  })
  process.env.VERCEL_GIT_COMMIT_SHA = 'short-or-malformed'
  assert.throws(() => main(['--repository', f.repository]), /full lowercase Git SHA/)
  assert(!fs.existsSync(path.join(f.repository, 'public/indexnow-manifest.json')))
  const explicit = main(['--repository', f.repository, '--revision', REVISION])
  assert.equal(explicit.revision, REVISION)
  process.env.VERCEL_GIT_COMMIT_SHA = 'b'.repeat(40)
  const fromVercel = main(['--repository', f.repository])
  assert.equal(fromVercel.revision, 'b'.repeat(40))
  assert.deepEqual(fromVercel.entries, explicit.entries)
})
