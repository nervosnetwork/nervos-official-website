import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import ts from 'typescript'

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(import.meta.url)
const imageSize = require('image-size')

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-images-test-'))
after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))
const originalPNG = path.join(root, 'public/education_hub_articles/quantum_resistance/images/image2.png')
const originalJPEG = path.join(root, 'public/education_hub_articles/understanding_bitcoin_layer2/images/image1.jpg')
const originalGIF = path.join(
  root,
  'public/education_hub_articles/nervosdao_withdrawal_process_explained/images/image6.gif',
)
const hash = bytes => createHash('sha256').update(bytes).digest('hex')

function loadTypeScript(file, imports, cwd = root) {
  const compiled = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText
  const loaded = { exports: {} }
  new Function('require', 'module', 'exports', 'process', 'Buffer', compiled)(
    name => {
      assert.ok(Object.hasOwn(imports, name), `Unexpected dependency in ${file}: ${name}`)
      return imports[name]
    },
    loaded,
    loaded.exports,
    Object.freeze({ cwd: () => cwd }),
    Buffer,
  )
  return loaded.exports
}

const loadImages = cwd =>
  loadTypeScript('src/server/kb-images.ts', { 'node:fs': fs, 'node:path': path, 'image-size': imageSize }, cwd)
const workspace = name => {
  const directory = path.join(fixtureRoot, name)
  fs.mkdirSync(path.join(directory, 'public/education_hub_articles'), { recursive: true })
  return directory
}
const articleDirectory = (directory, articleId) => path.join(directory, 'public/education_hub_articles', articleId)
function copyImage(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}
function displayedDimensions(bytes) {
  const size = imageSize(bytes)
  const rotated = size.orientation >= 5 && size.orientation <= 8
  return { width: rotated ? size.height : size.width, height: rotated ? size.width : size.height, type: size.type }
}
function lookup(dimensions, src) {
  const parsed = new URL(src, 'https://www.nervos.org')
  if (parsed.origin !== 'https://www.nervos.org') return undefined
  return dimensions[parsed.pathname] ?? dimensions[decodeURI(parsed.pathname)]
}

test('local recursive discovery uses image magic, keeps GIFs, and isolates equal relative names by article', () => {
  const directory = workspace('formats')
  const first = articleDirectory(directory, 'first')
  const second = articleDirectory(directory, 'second')
  copyImage(originalPNG, path.join(first, 'images/image.png'))
  copyImage(originalJPEG, path.join(first, 'images/nested/jpeg-disguised.png'))
  copyImage(originalGIF, path.join(first, 'images/nested/animated.gif'))
  copyImage(originalJPEG, path.join(second, 'images/image.png'))
  fs.writeFileSync(path.join(first, 'index.md'), '# Not an image')
  fs.writeFileSync(path.join(first, 'images/corrupt.png'), 'not a valid PNG')
  fs.writeFileSync(path.join(first, 'images/empty.jpg'), '')
  const { getKBImageDimensions } = loadImages(directory)
  const originalCwd = process.cwd()
  const firstMap = getKBImageDimensions('first', '/education_hub_articles/first/images/image.png')
  const secondMap = getKBImageDimensions('second')
  assert.equal(process.cwd(), originalCwd, 'Fixture isolation must not mutate the global process working directory')
  assert.deepEqual(firstMap['/education_hub_articles/first/images/image.png'], { width: 512, height: 448, type: 'png' })
  assert.deepEqual(firstMap['/education_hub_articles/first/images/nested/jpeg-disguised.png'], {
    width: 1000,
    height: 561,
    type: 'jpg',
  })
  assert.deepEqual(firstMap['/education_hub_articles/first/images/nested/animated.gif'], {
    width: 1511,
    height: 1209,
    type: 'gif',
  })
  assert.deepEqual(secondMap['/education_hub_articles/second/images/image.png'], {
    width: 1000,
    height: 561,
    type: 'jpg',
  })
  assert.equal(Object.keys(firstMap).length, 3, 'Only readable images become dimension entries')
  assert.equal(Object.keys(secondMap).length, 1)
  for (const map of [firstMap, secondMap]) {
    assert.equal(map['images/image.png'], undefined, 'No global relative-key collision between articles')
    assert.equal(map['image.png'], undefined)
    assert.equal(map['/education_hub_articles/first/images/missing.png'], undefined)
    assert.equal(map['/education_hub_articles/first/images/corrupt.png'], undefined)
    assert.equal(map['/education_hub_articles/first/images/empty.jpg'], undefined)
    assert.equal(map['/education_hub_articles/first/index.md'], undefined)
  }
  assert.equal(firstMap['/education_hub_articles/second/images/image.png'], undefined)
  assert.equal(secondMap['/education_hub_articles/first/images/image.png'], undefined)
})

function jpegWithOrientation(orientation) {
  const bytes = Buffer.from(fs.readFileSync(originalJPEG))
  const exif = bytes.indexOf(Buffer.from('Exif\0\0'))
  assert.ok(exif > 0, 'The source fixture must contain EXIF metadata')
  const tiff = exif + 6
  const littleEndian = bytes.toString('ascii', tiff, tiff + 2) === 'II'
  const read16 = offset => (littleEndian ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset))
  const read32 = offset => (littleEndian ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset))
  const ifd = tiff + read32(tiff + 4)
  for (let index = 0; index < read16(ifd); index += 1) {
    const entry = ifd + 2 + index * 12
    if (read16(entry) !== 0x0112) continue
    assert.equal(read16(entry + 2), 3, 'Orientation is a SHORT field')
    assert.equal(read32(entry + 4), 1)
    if (littleEndian) bytes.writeUInt16LE(orientation, entry + 8)
    else bytes.writeUInt16BE(orientation, entry + 8)
    assert.equal(imageSize(bytes).orientation, orientation)
    return bytes
  }
  assert.fail('The source fixture must contain an EXIF orientation entry')
}

test('EXIF orientations 5 through 8 swap stored matrix dimensions without changing source images', () => {
  const directory = workspace('orientation')
  const folder = articleDirectory(directory, 'oriented')
  fs.mkdirSync(folder, { recursive: true })
  const sourceHash = hash(fs.readFileSync(originalJPEG))
  for (let orientation = 1; orientation <= 8; orientation += 1) {
    fs.writeFileSync(path.join(folder, `orientation-${orientation}.jpg`), jpegWithOrientation(orientation))
  }
  const dimensions = loadImages(directory).getKBImageDimensions('oriented')
  for (let orientation = 1; orientation <= 8; orientation += 1) {
    const rotated = orientation >= 5
    assert.deepEqual(dimensions[`/education_hub_articles/oriented/orientation-${orientation}.jpg`], {
      width: rotated ? 561 : 1000,
      height: rotated ? 1000 : 561,
      type: 'jpg',
    })
  }
  assert.equal(hash(fs.readFileSync(originalJPEG)), sourceHash)
})

test('unsafe article IDs, missing folders and external or cross-article covers never expand discovery', () => {
  const directory = workspace('unsafe-paths')
  copyImage(originalPNG, path.join(articleDirectory(directory, 'allowed'), 'image.png'))
  copyImage(originalJPEG, path.join(articleDirectory(directory, 'other'), 'image.png'))
  const { getKBImageDimensions } = loadImages(directory)
  for (const id of [
    undefined,
    null,
    false,
    1,
    ['allowed'],
    { id: 'allowed' },
    '',
    '.',
    '..',
    '../other',
    'allowed/../other',
    '/allowed',
    'allowed/images',
    'allowed\\images',
    '\0',
  ]) {
    assert.deepEqual(getKBImageDimensions(id), {}, JSON.stringify(id))
  }
  assert.deepEqual(getKBImageDimensions('missing'), {})
  const expected = { '/education_hub_articles/allowed/image.png': { width: 512, height: 448, type: 'png' } }
  for (const cover of [
    undefined,
    null,
    '',
    '/education_hub_articles/other/image.png',
    '/education_hub_articles/allowed/missing.png',
    'https://external.example/image.png',
    '//external.example/image.png',
    'https://www.nervos.org/education_hub_articles/other/image.png',
    'data:image/png;base64,untrusted',
  ]) {
    assert.deepEqual(getKBImageDimensions('allowed', cover), expected)
  }
})

test('file, directory and article-root symlinks are skipped even when their targets are otherwise local', () => {
  const directory = workspace('symlinks')
  const folder = articleDirectory(directory, 'allowed')
  const nested = path.join(folder, 'nested')
  const outside = path.join(directory, 'outside-assets')
  copyImage(originalPNG, path.join(nested, 'image.png'))
  copyImage(originalJPEG, path.join(outside, 'outside.jpg'))
  fs.symlinkSync(path.join(outside, 'outside.jpg'), path.join(folder, 'outside-file.jpg'))
  fs.symlinkSync(path.join(nested, 'image.png'), path.join(folder, 'inside-file.png'))
  fs.symlinkSync(outside, path.join(folder, 'outside-directory'))
  fs.symlinkSync(nested, path.join(folder, 'inside-directory'))
  fs.symlinkSync(path.join(outside, 'missing.png'), path.join(folder, 'dangling.png'))
  fs.symlinkSync(folder, articleDirectory(directory, 'article-alias'))
  const { getKBImageDimensions } = loadImages(directory)
  assert.deepEqual(getKBImageDimensions('allowed'), {
    '/education_hub_articles/allowed/nested/image.png': { width: 512, height: 448, type: 'png' },
  })
  assert.deepEqual(getKBImageDimensions('article-alias'), {})

  const linkedWorkspace = path.join(fixtureRoot, 'linked-content-root')
  const target = path.join(linkedWorkspace, 'public/content-target')
  copyImage(originalPNG, path.join(target, 'allowed/image.png'))
  fs.symlinkSync(target, path.join(linkedWorkspace, 'public/education_hub_articles'))
  assert.deepEqual(loadImages(linkedWorkspace).getKBImageDimensions('allowed'), {})

  const publicWorkspace = path.join(fixtureRoot, 'linked-public-root')
  const publicTarget = path.join(publicWorkspace, 'public-target')
  copyImage(originalPNG, path.join(publicTarget, 'education_hub_articles/allowed/image.png'))
  fs.symlinkSync(publicTarget, path.join(publicWorkspace, 'public'))
  assert.deepEqual(loadImages(publicWorkspace).getKBImageDimensions('allowed'), {})
})

test('raw and encoded Unicode or space paths agree after URL normalization, while reserved characters stay encoded', () => {
  const directory = workspace('url-aliases')
  const id = '文章 gallery'
  const folder = articleDirectory(directory, id)
  const names = ['图 像.png', 'hash#name.png', 'query?name.png', 'percent%name.png', 'back\\slash.png']
  for (const name of names) copyImage(originalPNG, path.join(folder, 'images', name))
  const base = `/education_hub_articles/${encodeURIComponent(id)}`
  const rawPath = `/education_hub_articles/${id}/images/图 像.png`
  const mixedPath = `${base}/images/图 像.png`
  const encodedPath = `${base}/images/${encodeURIComponent('图 像.png')}`
  const cover = `${base}/nested/../images/图 像.png?variant=cover#intro`
  const dimensions = loadImages(directory).getKBImageDimensions(id, cover)
  const expected = { width: 512, height: 448, type: 'png' }
  for (const src of [rawPath, mixedPath, encodedPath, `${rawPath}?width=640#body`, cover]) {
    assert.deepEqual(lookup(dimensions, src), expected, src)
  }
  for (const src of [rawPath, mixedPath, encodedPath, cover]) assert.deepEqual(dimensions[src], expected, src)
  for (const name of names.slice(1)) {
    assert.deepEqual(dimensions[`${base}/images/${encodeURIComponent(name)}`], expected)
    assert.equal(
      dimensions[`${base}/images/${name}`],
      undefined,
      'Reserved path characters must not become URL aliases',
    )
  }
  assert.equal(lookup(dimensions, `https://external.example${encodedPath}`), undefined)
  assert.equal(dimensions['images/图 像.png'], undefined)
})

test('malformed cover URL encoding falls back safely without discarding valid local dimensions', () => {
  const directory = workspace('malformed-cover')
  copyImage(originalPNG, path.join(articleDirectory(directory, 'allowed'), 'image.png'))
  const { getKBImageDimensions } = loadImages(directory)
  for (const cover of [
    '/education_hub_articles/allowed/%broken.png',
    '/education_hub_articles/allowed/%E0%A4%A.png',
    '/education_hub_articles/allowed/%',
  ]) {
    let dimensions
    assert.doesNotThrow(() => {
      dimensions = getKBImageDimensions('allowed', cover)
    }, cover)
    assert.deepEqual(dimensions, {
      '/education_hub_articles/allowed/image.png': { width: 512, height: 448, type: 'png' },
    })
  }
})

test('every published cover and rendered local body image has real dimensions, with original source hashes preserved', context => {
  const catalog = JSON.parse(
    fs.readFileSync(path.join(root, 'public/education_hub_articles/metadata/catalog.json'), 'utf8'),
  )
  const articles = catalog.articles.filter(
    article => !article.draft && (!article.date || Date.parse(article.date) <= Date.now()),
  )
  assert.equal(articles.length, 320)
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize)
  const { getKBImageDimensions } = loadImages(root)
  const imageHashes = new Map()
  const coverFiles = new Set()
  const bodyFiles = new Set()
  const external = []
  const counts = { articles: articles.length, covers: 0, body: 0, localBody: 0, animatedGIFReferences: 0 }

  function assertImage(dimensions, src, article, files) {
    const parsed = new URL(src, 'https://www.nervos.org')
    const filename = path.resolve(root, 'public', `.${decodeURIComponent(parsed.pathname)}`)
    const bytes = fs.readFileSync(filename)
    const expected = displayedDimensions(bytes)
    assert.deepEqual(lookup(dimensions, src), expected, `${article.id}:${article.language}: ${src}`)
    if (!imageHashes.has(filename)) imageHashes.set(filename, hash(bytes))
    files.add(filename)
    return expected
  }

  for (const article of articles) {
    const source = path.join(root, 'public/education_hub_articles', article.sourceFile)
    const raw = fs.readFileSync(source, 'utf8')
    const markdown = matter(raw).content
    assert.equal(hash(raw), article.sourceSHA256, `${article.sourceFile}: original source hash`)
    assert.equal(hash(markdown), article.bodySHA256, `${article.sourceFile}: original body hash`)
    const dimensions = getKBImageDimensions(article.id, article.coverImage)
    assert.ok(Object.keys(dimensions).every(key => key.startsWith('/education_hub_articles/')))
    assert.ok(article.coverImage)
    assertImage(dimensions, article.coverImage, article, coverFiles)
    counts.covers += 1
    const tree = processor.runSync(processor.parse(markdown))
    function visit(node) {
      if (node.type === 'element' && node.tagName === 'img') {
        counts.body += 1
        const ref = node.properties.src ?? ''
        if (/^(https?:)?\/\//.test(ref)) {
          assert.equal(dimensions[ref], undefined)
          assert.equal(lookup(dimensions, ref), undefined)
          external.push({ id: article.id, language: article.language, ref })
        } else {
          const src = ref.startsWith('/') ? ref : `/education_hub_articles/${encodeURIComponent(article.id)}/${ref}`
          const size = assertImage(dimensions, src, article, bodyFiles)
          counts.localBody += 1
          if (size.type === 'gif') {
            counts.animatedGIFReferences += 1
            assert.equal(article.id, 'nervosdao_withdrawal_process_explained')
            assert.deepEqual(size, { width: 1511, height: 1209, type: 'gif' })
          }
        }
      }
      for (const child of node.children ?? []) visit(child)
    }
    visit(tree)
    assert.equal(hash(fs.readFileSync(source)), article.sourceSHA256, `${article.sourceFile}: source remains unchanged`)
  }
  assert.deepEqual(counts, { articles: 320, covers: 320, body: 430, localBody: 429, animatedGIFReferences: 3 })
  assert.equal(coverFiles.size, 218)
  assert.equal(bodyFiles.size, 233)
  assert.equal(imageHashes.size, 451)
  assert.deepEqual(external, [
    {
      id: 'chain_abstraction_bringing_web2_user_experience_to_web3',
      language: 'en',
      ref: 'https://markdown-videos-api.jorgenkh.no/url?url=https%3A%2F%2Fyoutu.be%2F90GHScLe5U8',
    },
  ])
  for (const [filename, originalHash] of imageHashes) {
    assert.equal(
      hash(fs.readFileSync(filename)),
      originalHash,
      `${path.relative(root, filename)}: original image bytes`,
    )
  }
  context.diagnostic(
    JSON.stringify({
      ...counts,
      uniqueCoverFiles: coverFiles.size,
      uniqueBodyFiles: bodyFiles.size,
      external: external.length,
    }),
  )
})

function articlePageFixture({ markdown = '# Published body', translationStatus = 'missing' } = {}) {
  const article = {
    id: 'image-article',
    language: 'en',
    canonicalPath: '/knowledge-base/image-article',
    coverImage: '/education_hub_articles/image-article/cover.png',
    subjects: [],
    hub: null,
  }
  const dimensions = { [article.coverImage]: { width: 512, height: 448, type: 'png' } }
  const calls = { images: [], markdown: [] }
  const loadedModule = loadTypeScript('src/server/kb-article-page.ts', {
    'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({}) },
    remark: { remark: () => ({ parse: value => value }) },
    '../components/KnowledgeHub/content': { byDate: () => 0, relatedArticles: () => [] },
    '../components/KnowledgeHub/markdown-headings': { headingTree: () => [] },
    './kb-content': {
      getKBCatalog: locale => ({ articles: locale === 'en' ? [article] : [], hubs: [], subjects: [] }),
      getKBArticleStatus: () => translationStatus,
      getKBArticleLanguages: () => ({ [article.id]: ['en'] }),
      resolveKBArticleId: id => (id === 'legacy-image-article' ? article.id : id),
      getKBArticle: (...args) => {
        calls.markdown.push(args)
        return markdown
      },
    },
    './kb-images': {
      getKBImageDimensions: (...args) => {
        calls.images.push(args)
        return dimensions
      },
    },
  })
  return { ...loadedModule, article, dimensions, calls }
}

test('article static props attach dimensions to resolved published pages, never to redirects or unavailable pages', async () => {
  for (const route of ['canonical', 'preview']) {
    const fixture = articlePageFixture()
    const result = await fixture.articleStaticProps(route)({ params: { slug: fixture.article.id }, locale: 'en' })
    assert.equal(result.props.imageDimensions, fixture.dimensions)
    assert.equal(result.props.preview, route === 'preview')
    assert.deepEqual(fixture.calls.images, [[fixture.article.id, fixture.article.coverImage]])
  }
  for (const { route = 'canonical', slug, locale = 'en', options, expected, markdownReads = 0 } of [
    { slug: undefined, expected: { notFound: true } },
    { slug: ['image-article'], expected: { notFound: true } },
    { slug: 'unknown', expected: { notFound: true } },
    { route: 'preview', slug: 'legacy-image-article', expected: { notFound: true } },
    {
      slug: 'legacy-image-article',
      expected: { redirect: { destination: '/knowledge-base/image-article', permanent: true } },
    },
    {
      slug: 'image-article',
      locale: 'zh',
      expected: { redirect: { destination: '/knowledge-base/image-article', permanent: true } },
    },
    {
      slug: 'image-article',
      locale: 'zh',
      options: { translationStatus: 'unpublished' },
      expected: { notFound: true },
    },
    { slug: 'image-article', options: { markdown: null }, expected: { notFound: true }, markdownReads: 1 },
  ]) {
    const fixture = articlePageFixture(options)
    assert.deepEqual(await fixture.articleStaticProps(route)({ params: { slug }, locale }), expected)
    assert.deepEqual(fixture.calls.images, [], 'Unavailable and redirect-only pages do not inspect image files')
    assert.equal(fixture.calls.markdown.length, markdownReads)
  }
})
