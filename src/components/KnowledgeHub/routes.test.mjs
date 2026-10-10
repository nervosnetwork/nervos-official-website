import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name)
    return entry.isDirectory() ? files(filename) : [filename]
  })
}

test('the redesigned pages live under the existing knowledge-base prefix, without kb aliases', () => {
  const pages = files(path.join(root, 'src/pages')).map(file => path.relative(root, file))
  for (const name of ['index', 'topic', 'start-here', 'articles', 'search', '[slug]']) {
    assert(pages.includes(`src/pages/knowledge-base/${name}.page.tsx`), `Missing ${name} route`)
  }
  assert(!pages.some(file => file.startsWith('src/pages/kb/')), 'The retired preview routes must not return')
  assert.match(read('src/pages/knowledge-base/index.page.tsx'), /export default KnowledgeHubHome/)
  assert.match(read('src/pages/knowledge-base/topic.page.tsx'), /libraryProps\('topic'\)/)
  assert.match(read('src/pages/knowledge-base/articles.page.tsx'), /export default ArticleArchive/)
  assert.match(read('src/pages/knowledge-base/search.page.tsx'), /libraryProps\('search'\)/)
  assert.match(read('src/pages/knowledge-base/start-here.page.tsx'), /export default StartHere/)
  assert.match(read('src/pages/knowledge-base/[slug].page.tsx'), /articleStaticProps\('canonical'\)/)
})

test('navigation cannot link to deleted kb routes or the static sample article', () => {
  for (const filename of files(path.join(root, 'src')).filter(file => /\.tsx?$/.test(file))) {
    const source = fs.readFileSync(filename, 'utf8')
    assert(!/(["'`])\/kb(?=[/"'`?])/.test(source), `Retired preview link in ${filename}`)
    assert(!source.includes('/knowledge-base/article?'), `Static sample link in ${filename}`)
  }
  assert(!/(["'`])\/kb(?=[/"'`?:])/.test(read('next.config.mjs')), 'No kb rewrite or redirect aliases')
})

test('new listing routes never shadow an existing article slug', () => {
  const catalog = JSON.parse(read('public/education_hub_articles/metadata/catalog.json'))
  const reserved = new Set(['topic', 'start-here', 'articles', 'search'])
  for (const article of catalog.articles) {
    assert(!reserved.has(article.id), `Listing route would shadow ${article.canonicalPath}`)
  }
})

test('the public homepage is not a noindex preview, while search stays noindex', () => {
  const home = read('src/components/KnowledgeHub/Home.tsx')
  assert(!home.includes('Design preview'))
  assert(!home.includes('noindex'))
  assert.match(home, /rel="canonical"/)
  assert.match(read('src/components/KnowledgeHub/Shared.tsx'), /preview = false/)
  assert.match(read('src/components/KnowledgeHub/Library.tsx'), /noindex=\{mode === 'search'\}/)
})
