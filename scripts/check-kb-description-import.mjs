// One-time acceptance for the 91-description import snapshot, not a content
// upload gate. Run explicitly with `node scripts/check-kb-description-import.mjs`.
// Later approved article edits can legitimately invalidate its preservation
// hashes. Do not add this snapshot check to CI, kb:validate or the build command.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import matter from 'gray-matter'

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.join(repository, 'public/education_hub_articles')
const fork = path.resolve(repository, '../EducationHubArticles-cleanup')
const readJSON = filename => JSON.parse(fs.readFileSync(filename, 'utf8'))
const manifest = readJSON(path.join(root, 'metadata/description-import.json'))
const migrations = new Map(readJSON(path.join(root, 'metadata/slug-migrations.json')).renames.map(r => [r.from, r.to]))
const catalog = readJSON(path.join(root, 'metadata/catalog.json'))
const hash = value => crypto.createHash('sha256').update(value).digest('hex')

function verifyImportedSources(contentRoot) {
  for (const entry of manifest.entries) {
    const raw = fs.readFileSync(path.join(contentRoot, entry.sourceFile), 'utf8')
    const { data, content } = matter(raw)
    assert.equal(data.description, entry.description, `Workbook row ${entry.row}: ${entry.sourceFile}`)
    assert.equal(data.title.trim(), entry.title)
    assert.equal(typeof data.subtitle === 'string' ? data.subtitle.trim() : '', entry.subtitle)
    assert.equal(hash(content), entry.bodySHA256, `Article body changed: ${entry.sourceFile}`)
    const addedLine = `description: ${JSON.stringify(entry.description)}${entry.lineEnding === 'CRLF' ? '\r\n' : '\n'}`
    assert.equal(raw.split(addedLine).length, 2, `Expected one imported description: ${entry.sourceFile}`)
    assert.equal(
      hash(raw.replace(addedLine, '')),
      entry.beforeSHA256,
      `Import must preserve every other source byte, including line endings: ${entry.sourceFile}`,
    )
  }
}

test('D-08 imports exactly the 91 written descriptions by source URL and approved slug mapping', () => {
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.source.sheet, '02_Meta_Descriptions')
  assert.equal(manifest.source.descriptionRange, 'G5:G95')
  assert.equal(manifest.source.urlColumn, 'C')
  assert.equal(manifest.source.writtenAtImport, 'Yes')
  assert.equal(manifest.source.uploadedAtImport, 'No', 'The source workbook was not marked uploaded')
  assert.match(manifest.source.workbookSHA256, /^[a-f0-9]{64}$/)
  assert.equal(manifest.entries.length, 91)
  assert.deepEqual(
    manifest.entries.map(entry => entry.row),
    Array.from({ length: 91 }, (_, i) => i + 5),
  )
  for (const field of ['sourceURL', 'id', 'sourceFile', 'description']) {
    assert.equal(new Set(manifest.entries.map(entry => entry[field])).size, 91, `Duplicate ${field}`)
  }
  for (const entry of manifest.entries) {
    const url = new URL(entry.sourceURL)
    assert.equal(url.origin, 'https://www.nervos.org')
    assert.equal(url.search, '')
    assert.equal(url.hash, '')
    assert.equal(decodeURIComponent(url.pathname), `/knowledge-base/${entry.sourceSlug}`)
    assert.equal(entry.id, migrations.get(entry.sourceSlug) ?? entry.sourceSlug)
    assert.equal(entry.sourceFile, `${entry.id}/index.md`, 'Only English source files may receive this copy')
    assert.equal(typeof entry.description, 'string')
    assert.equal(entry.description, entry.description.trim())
    assert.ok(Array.from(entry.description).length > 0 && Array.from(entry.description).length <= 155)
    assert.ok(['LF', 'CRLF'].includes(entry.lineEnding))
  }
  assert.equal(manifest.entries.filter(entry => entry.sourceSlug !== entry.id).length, 17)
})

test('D-08 adds only the description line, preserving all 91 titles, subtitles, dates and article bodies', () => {
  verifyImportedSources(root)
})

test('D-08 leaves all other 229 Markdown files untouched, including every Chinese and Spanish translation', () => {
  const selected = new Set(manifest.entries.map(entry => entry.sourceFile))
  assert.equal(Object.keys(manifest.untouchedMarkdown).length, 229)
  assert.equal(Object.keys(manifest.untouchedMarkdown).filter(file => /index[_-]zh\.md$/.test(file)).length, 64)
  assert.equal(Object.keys(manifest.untouchedMarkdown).filter(file => /index[_-]es\.md$/.test(file)).length, 43)
  for (const [file, expected] of Object.entries(manifest.untouchedMarkdown)) {
    assert.equal(selected.has(file), false)
    assert.equal(hash(fs.readFileSync(path.join(root, file))), expected, `Unselected source changed: ${file}`)
  }
  assert.deepEqual(
    new Set(catalog.articles.map(article => article.sourceFile)),
    new Set([...selected, ...Object.keys(manifest.untouchedMarkdown)]),
  )
})

test('D-08 regenerated catalog exposes each English description and the unchanged visible content metadata', () => {
  const described = catalog.articles.filter(
    article => typeof article.description === 'string' && article.description.trim(),
  )
  assert.equal(described.length, 91)
  assert.ok(described.every(article => article.language === 'en'))
  for (const entry of manifest.entries) {
    const matches = catalog.articles.filter(article => article.sourceFile === entry.sourceFile)
    assert.equal(matches.length, 1)
    const article = matches[0]
    assert.equal(article.language, 'en')
    assert.equal(article.id, entry.id)
    assert.equal(article.canonicalPath, `/knowledge-base/${entry.id}`)
    assert.equal(article.description, entry.description)
    assert.equal(article.title, entry.title)
    assert.equal(article.subtitle, entry.subtitle)
    assert.equal(article.bodySHA256, entry.bodySHA256)
    assert.equal(article.sourceSHA256, hash(fs.readFileSync(path.join(root, entry.sourceFile))))
  }
})

test(
  'D-08 local article fork matches the website content copy without touching translated sources',
  {
    skip:
      !fs.existsSync(path.join(fork, 'metadata/catalog.json')) &&
      'A standalone website checkout has no sibling article fork',
  },
  () => {
    assert.deepEqual(readJSON(path.join(fork, 'metadata/description-import.json')), manifest)
    verifyImportedSources(fork)
    for (const file of [
      ...manifest.entries.map(entry => entry.sourceFile),
      ...Object.keys(manifest.untouchedMarkdown),
    ]) {
      assert.deepEqual(fs.readFileSync(path.join(fork, file)), fs.readFileSync(path.join(root, file)), file)
    }
    assert.deepEqual(readJSON(path.join(fork, 'metadata/catalog.json')), catalog)
  },
)
