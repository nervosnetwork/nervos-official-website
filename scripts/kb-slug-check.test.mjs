import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { test } from 'node:test'

const website = new URL('../', import.meta.url)
const { scripts } = JSON.parse(fs.readFileSync(new URL('package.json', website), 'utf8'))
const checkerPath = 'scripts/validate-kb-sources.mjs'
const command = `node ${checkerPath}`

function fixture(t, slug) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-slug-build-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'public/education_hub_articles/scripts'), { recursive: true })
  fs.mkdirSync(path.join(root, 'scripts'))
  fs.copyFileSync(new URL(checkerPath, website), path.join(root, checkerPath))
  fs.copyFileSync(new URL('scripts/kb-hub-tag.mjs', website), path.join(root, 'scripts/kb-hub-tag.mjs'))
  fs.copyFileSync(new URL('next-i18next.config.js', website), path.join(root, 'next-i18next.config.js'))
  fs.mkdirSync(path.join(root, 'config'))
  fs.copyFileSync(new URL('config/kb-hubs.mjs', website), path.join(root, 'config/kb-hubs.mjs'))
  fs.copyFileSync(
    new URL('config/kb-legacy-source-baseline.json', website),
    path.join(root, 'config/kb-legacy-source-baseline.json'),
  )
  fs.symlinkSync(new URL('node_modules', website), path.join(root, 'node_modules'))
  fs.mkdirSync(path.join(root, 'public/education_hub_articles', slug, 'images'), { recursive: true })
  fs.writeFileSync(
    path.join(root, 'public/education_hub_articles', slug, 'images/cover.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7XcAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  fs.writeFileSync(
    path.join(root, 'public/education_hub_articles', slug, 'index.md'),
    '---\ntitle: Fixture\nauthor: writer\ndate: "2020-01-01T00:00:00Z"\ncoverImage: images/cover.png\n---\n# Fixture\n',
  )
  fs.writeFileSync(path.join(root, 'scripts/resolve-kb-content.mjs'), "console.log('Pinned fixture resolved')\n")
  fs.writeFileSync(path.join(root, 'scripts/prepare-kb-content.mjs'), "console.log('Metadata preparation reached')\n")
  return root
}

test('website publishing uses the trusted source checker before preparation and every consumer', () => {
  assert.equal(scripts['kb:check-slugs'], command)
  assert.ok(scripts['kb:validate'].startsWith(command + ' && '))
  assert.ok(scripts.build.startsWith('node scripts/resolve-kb-content.mjs && ' + command + ' && '))
  assert(scripts.build.indexOf(command) < scripts.build.indexOf('node scripts/prepare-kb-content.mjs'))
  assert(
    scripts.build.indexOf('node scripts/prepare-kb-content.mjs') <
      scripts.build.indexOf('node ./scripts/generate-articles.mjs'),
  )
  assert(!scripts.build.includes('public/education_hub_articles/scripts/'))
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
  assert.match(result.stderr, /article folder must use lowercase/)
  assert.match(result.stderr, /Invalid_Article/)
  assert.doesNotMatch(result.stdout, /Metadata preparation reached/)
  assert.equal(fs.existsSync(path.join(root, 'generator-ran')), false)
})

test('a valid folder proceeds to the existing validation command without source changes', t => {
  const root = fixture(t, 'valid_article')
  fs.writeFileSync(path.join(root, 'scripts/test-kb-content.mjs'), "console.log('Existing validation reached')\n")
  const output = execFileSync(scripts['kb:validate'], { cwd: root, shell: true, encoding: 'utf8', timeout: 10000 })
  assert.match(output, /KB source validation passed: 1 renditions/)
  assert.match(output, /Metadata preparation reached/)
  assert.match(output, /Existing validation reached/)
  assert.equal(
    fs.readFileSync(path.join(root, 'public/education_hub_articles/valid_article/index.md'), 'utf8'),
    '---\ntitle: Fixture\nauthor: writer\ndate: "2020-01-01T00:00:00Z"\ncoverImage: images/cover.png\n---\n# Fixture\n',
  )
})
