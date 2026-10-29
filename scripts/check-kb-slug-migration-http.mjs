import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

// Run after a local production build/start: node scripts/check-kb-slug-migration-http.mjs [origin]
const website = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = `${website}/public/education_hub_articles`
const catalog = JSON.parse(fs.readFileSync(`${root}/metadata/catalog.json`))
const { renames } = JSON.parse(fs.readFileSync(`${root}/metadata/slug-migrations.json`))
const fixture = JSON.parse(fs.readFileSync(`${website}/scripts/fixtures/kb-legacy-urls.json`))
const origin = process.argv[2] ?? 'http://localhost:3002'
const locales = ['en', 'zh', 'es', 'fr', 'ko', 'tr', 'pt']
const query = '?utm_source=d18&tag=first&tag=second&term=a%20b'
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
async function concurrent(items, operation, count = 4) {
  let next = 0
  await Promise.all(
    Array.from({ length: count }, async () => {
      while (next < items.length) await operation(items[next++])
    }),
  )
}
async function redirected(source, destination) {
  const result = await fetch(origin + source, { redirect: 'manual', signal: AbortSignal.timeout(45000) })
  assert.equal(result.status, 308, source)
  const actual = new URL(result.headers.get('location'), origin)
  const expected = new URL(destination, origin)
  assert.equal(actual.origin, expected.origin, source)
  assert.equal(actual.pathname, expected.pathname, source)
  assert.deepEqual([...actual.searchParams], [...expected.searchParams], source)
  await result.arrayBuffer()
}
const oldArticles = renames.flatMap(({ from, to }) =>
  ['', ...locales].map(prefix => {
    const language = prefix || 'en'
    const versions = catalog.articles.filter(article => article.id === to)
    const target =
      versions.find(article => article.language === language) ?? versions.find(article => article.language === 'en')
    return [
      `${prefix ? `/${prefix}` : ''}/knowledge-base/${encodeURIComponent(from)}${query}`,
      `${encodeURI(target.canonicalPath)}${query}`,
    ]
  }),
)
await concurrent(oldArticles, ([source, target]) => redirected(source, target))
console.log(`${oldArticles.length} old D-18 article requests redirect directly with query preserved`)
await concurrent(fixture.redirects, ([, source, target]) => redirected(source, target))
console.log(`${fixture.redirects.length} D-01 historical requests still redirect directly to final paths`)
await concurrent(catalog.articles, async article => {
  const response = await fetch(origin + encodeURI(article.canonicalPath), {
    redirect: 'manual',
    signal: AbortSignal.timeout(45000),
  })
  assert.equal(response.status, 200, article.canonicalPath)
  assert.equal(response.headers.get('location'), null, article.canonicalPath)
  const html = await response.text()
  assert.ok(html.includes('__NEXT_DATA__'), article.canonicalPath)
})
console.log(`${catalog.articles.length} current article paths return 200 without redirect loops`)
const assets = []
function walk(folder, relative = '') {
  for (const entry of fs.readdirSync(path.join(root, folder, relative), { withFileTypes: true })) {
    const name = path.join(relative, entry.name)
    if (entry.isDirectory()) walk(folder, name)
    else if (!entry.name.endsWith('.md')) assets.push({ folder, name })
  }
}
for (const id of new Set(catalog.articles.map(article => article.id))) walk(id)
let oldAssets = 0
await concurrent(assets, async ({ folder, name }) => {
  const encodePath = value => value.split('/').map(encodeURIComponent).join('/')
  const destination = `/education_hub_articles/${encodeURIComponent(folder)}/${encodePath(name)}`
  const response = await fetch(origin + destination, { redirect: 'manual', signal: AbortSignal.timeout(45000) })
  assert.equal(response.status, 200, destination)
  assert.equal(
    hash(Buffer.from(await response.arrayBuffer())),
    hash(fs.readFileSync(path.join(root, folder, name))),
    destination,
  )
  const rename = renames.find(rename => rename.to === folder)
  if (rename) {
    await redirected(
      `/education_hub_articles/${encodeURIComponent(rename.from)}/${encodePath(name)}${query}`,
      destination + query,
    )
    oldAssets++
  }
})
console.log(`${assets.length} asset responses retain original bytes; ${oldAssets} old asset paths redirect directly`)
await concurrent(
  fixture.unmapped.filter(([, source]) => !fixture.trailingSlashNormalization.includes(source)),
  async ([, source]) => {
    const response = await fetch(origin + source, { signal: AbortSignal.timeout(45000) })
    assert.equal(response.status, 404, source)
    await response.arrayBuffer()
  },
)
console.log('21 excluded/malformed addresses still end in real 404 responses')
