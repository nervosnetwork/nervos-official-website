import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { parseBlog } from './generate-articles/parserBlog.mjs'

const generator = fileURLToPath(new URL('./generate-articles.mjs', import.meta.url))
const markdown = title =>
  `---\ntitle: ${JSON.stringify(title)}\nsubtitle: Subtitle\nauthor: writer\ndate: "2020-01-01T00:00:00Z"\nexcerpt: Existing excerpt\n---\nArticle body.\n`
const javascript = marker =>
  `---javascript\n({ title: (process.getBuiltinModule('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed'), 'Wrong English title') })\n---\nBody\n`

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-legacy-generator-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const source = path.join(root, 'public/education_hub_articles/alpha')
  const destination = path.join(root, 'src/database/articles')
  fs.mkdirSync(source, { recursive: true })
  fs.mkdirSync(destination, { recursive: true })
  return { root, source, destination, marker: path.join(root, 'frontmatter-executed') }
}

test('legacy generation reads only real supported index renditions; auxiliary Markdown cannot execute or overwrite English', t => {
  const f = fixture(t)
  fs.writeFileSync(path.join(f.source, 'index.md'), markdown('Original English'))
  fs.writeFileSync(path.join(f.source, 'index_zh.md'), markdown('真实中文'))
  fs.writeFileSync(path.join(f.source, 'index-fr.md'), markdown('Real French'))
  fs.writeFileSync(path.join(f.source, 'README.md'), javascript(f.marker))
  fs.writeFileSync(path.join(f.source, 'z_notes.md'), markdown('Must not overwrite English'))
  fs.writeFileSync(path.join(f.source, 'index_ru.md'), javascript(f.marker))
  fs.writeFileSync(path.join(f.source, 'index_en.md'), javascript(f.marker))
  const result = spawnSync(process.execPath, [generator], { cwd: f.root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const output = fs.readFileSync(path.join(f.destination, 'alpha/index.ts'), 'utf8')
  const data = JSON.parse(/export const slug = ([\s\S]*)$/.exec(output)[1])
  assert.deepEqual(Object.keys(data).sort(), ['en', 'fr', 'slug', 'zh'])
  assert.equal(data.en.title, 'Original English')
  assert.equal(data.zh.title, '真实中文')
  assert.equal(data.fr.title, 'Real French')
  assert.equal(fs.existsSync(f.marker), false)
})

test('a real index cannot request an executable frontmatter engine, even through the standalone generator', t => {
  const f = fixture(t)
  fs.writeFileSync(path.join(f.source, 'index.md'), javascript(f.marker))
  const result = spawnSync(process.execPath, [generator], { cwd: f.root, encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /only standard YAML frontmatter/)
  assert.equal(fs.existsSync(f.marker), false)
  assert.equal(fs.existsSync(path.join(f.destination, 'alpha/index.ts')), false)
})

test('the low-level parser independently rejects executable/custom engines without evaluating content', async t => {
  const f = fixture(t)
  await assert.rejects(
    () => parseBlog(javascript(f.marker), 'alpha', '2020-01-01T00:00:00Z'),
    /only standard YAML frontmatter/,
  )
  assert.equal(fs.existsSync(f.marker), false)
})

test('underscore and hyphen aliases may not silently overwrite the same legacy translation', t => {
  const f = fixture(t)
  fs.writeFileSync(path.join(f.source, 'index.md'), markdown('English'))
  fs.writeFileSync(path.join(f.source, 'index_zh.md'), markdown('Chinese one'))
  fs.writeFileSync(path.join(f.source, 'index-zh.md'), markdown('Chinese two'))
  const result = spawnSync(process.execPath, [generator], { cwd: f.root, encoding: 'utf8' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /duplicate zh article rendition/)
})

test('quoted and implicit YAML ISO dates preserve the same source time rather than filesystem birth time', async () => {
  const source = markdown('Publication date').replace('2020-01-01T00:00:00Z', '2026-11-05T12:00:00.000Z')
  const implicit = source.replace('date: "2026-11-05T12:00:00.000Z"', 'date: 2026-11-05T12:00:00.000Z')
  const quotedArticle = await parseBlog(source, 'alpha', '2099-01-01T00:00:00.000Z')
  const implicitArticle = await parseBlog(implicit, 'alpha', '2099-01-01T00:00:00.000Z')
  assert.equal(quotedArticle.date, '2026-11-05T12:00:00.000Z')
  assert.deepEqual(implicitArticle, quotedArticle)
})
