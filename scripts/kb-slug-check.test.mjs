import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { test } from 'node:test'

const website = new URL('../', import.meta.url)
const { scripts } = JSON.parse(fs.readFileSync(new URL('package.json', website), 'utf8'))
const checkerPath = 'public/education_hub_articles/scripts/check-slugs.mjs'
const command = `node ${checkerPath}`

function fixture(t, slug) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-slug-build-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'public/education_hub_articles/scripts'), { recursive: true })
  fs.copyFileSync(new URL(checkerPath, website), path.join(root, checkerPath))
  fs.mkdirSync(path.join(root, 'public/education_hub_articles', slug))
  fs.writeFileSync(path.join(root, 'public/education_hub_articles', slug, 'index.md'), '# Fixture\n')
  fs.mkdirSync(path.join(root, 'scripts'))
  return root
}

test('website build and validation run the content repository checker first', () => {
  assert.equal(scripts['kb:check-slugs'], command)
  assert.ok(scripts['kb:validate'].startsWith(command + ' && '))
  assert.ok(scripts.build.startsWith(command + ' && '))
  assert.equal(
    scripts.build.slice(command.length + 4),
    'node ./scripts/generate-articles.mjs && node scripts/generate-sitemap.mjs && next build',
  )
})

test('invalid article slugs stop the actual build command before any generator runs', t => {
  const root = fixture(t, 'Invalid_Article')
  for (const filename of ['generate-articles.mjs', 'generate-sitemap.mjs']) {
    fs.writeFileSync(
      path.join(root, 'scripts', filename),
      "import fs from 'node:fs'; fs.writeFileSync('generator-ran', 'unexpected')\n",
    )
  }
  const result = spawnSync(scripts.build, { cwd: root, shell: true, encoding: 'utf8', timeout: 10000 })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Invalid article folder names/)
  assert.match(result.stderr, /Invalid_Article/)
  assert.equal(fs.existsSync(path.join(root, 'generator-ran')), false)
})

test('a valid folder proceeds to the existing validation command without source changes', t => {
  const root = fixture(t, 'valid_article')
  fs.writeFileSync(path.join(root, 'scripts/test-kb-content.mjs'), "console.log('Existing validation reached')\n")
  const output = execFileSync(scripts['kb:validate'], { cwd: root, shell: true, encoding: 'utf8', timeout: 10000 })
  assert.match(output, /Article slug check passed: 1 folders/)
  assert.match(output, /Existing validation reached/)
  assert.equal(
    fs.readFileSync(path.join(root, 'public/education_hub_articles/valid_article/index.md'), 'utf8'),
    '# Fixture\n',
  )
})
