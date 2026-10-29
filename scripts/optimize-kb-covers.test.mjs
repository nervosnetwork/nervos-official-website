import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import sharp from 'sharp'
import { coverPaths, optimizeCover, sha256 } from './optimize-kb-covers.mjs'

const exec = promisify(execFile)
const script = fileURLToPath(new URL('./optimize-kb-covers.mjs', import.meta.url))
const article = (id, coverImage = `/education_hub_articles/${id}/images/cover.png`) => ({ id, coverImage })

async function png(width = 1600, height = 900, alpha = false) {
  const channels = alpha ? 4 : 3
  const pixels = Buffer.alloc(width * height * channels)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels
      pixels[i] = Math.floor((x * 255) / width)
      pixels[i + 1] = Math.floor((y * 255) / height)
      pixels[i + 2] = ((x >> 4) + (y >> 4)) % 256
      if (alpha) pixels[i + 3] = Math.floor((x * 255) / width)
    }
  }
  return sharp(pixels, { raw: { width, height, channels } }).png({ compressionLevel: 0 }).toBuffer()
}

test('cover selection deduplicates translations and excludes unrelated body images', () => {
  const catalog = {
    articles: [article('z'), article('a'), { ...article('a'), language: 'es' }, article('none', null)],
    bodyImages: ['/education_hub_articles/a/images/body.png'],
  }
  assert.deepEqual(coverPaths(catalog), ['a/images/cover.png', 'z/images/cover.png'])
})

test('cover selection rejects external, cross-article and traversal paths', () => {
  for (const coverImage of [
    'https://example.com/cover.png',
    '//example.com/cover.png',
    '/education_hub_articles/another/images/cover.png',
    '/education_hub_articles/a/../cover.png',
    '/education_hub_articles/a/./cover.png',
    '/education_hub_articles/a//cover.png',
    '/education_hub_articles/a/images\\cover.png',
    '/education_hub_articles/a/%2e%2e/cover.png',
    '/education_hub_articles/a/cover.png?download=1',
    '/education_hub_articles/a/cover.png#x',
    '/education_hub_articles/a/cover\0.png',
  ]) {
    assert.throws(() => coverPaths({ articles: [article('a', coverImage)] }), /Non-local|Unsafe/)
  }
})

test('wide covers become proportional 1200-pixel PNGs and a second pass is unchanged', async () => {
  const input = await png()
  const result = await optimizeCover(input)
  assert.equal(result.before.sha256, sha256(input))
  assert.equal(result.after.width, 1200)
  assert.equal(result.after.height, 675)
  assert.equal(result.after.format, 'png')
  assert.ok(result.after.bytes < input.length)
  const again = await optimizeCover(result.data)
  assert.equal(again.method, 'already-within-budget')
  assert.deepEqual(again.data, result.data)
})

test('small covers already within budget retain exact original bytes', async () => {
  const input = await png(100, 75)
  const result = await optimizeCover(input)
  assert.equal(result.method, 'already-within-budget')
  assert.deepEqual(result.data, input)
  assert.deepEqual(result.before, result.after)
})

test('compression of a small oversized PNG never enlarges its dimensions', async () => {
  const input = await png(700, 600)
  assert.ok(input.length > 1_000_000)
  const result = await optimizeCover(input)
  assert.equal(result.after.width, 700)
  assert.equal(result.after.height, 600)
  assert.equal(result.after.format, 'png')
  assert.ok(result.after.bytes < input.length)
})

test('PNG resizing preserves the resized alpha channel exactly', async () => {
  const input = await png(1600, 901, true)
  const result = await optimizeCover(input)
  const metadata = await sharp(result.data).metadata()
  assert.equal(metadata.hasAlpha, true)
  assert.equal(metadata.width, 1200)
  assert.ok(Math.abs(metadata.height - (901 * 1200) / 1600) <= 0.51)
  const expected = await sharp(input)
    .resize({ width: 1200, withoutEnlargement: true })
    .extractChannel('alpha')
    .raw()
    .toBuffer()
  const actual = await sharp(result.data).extractChannel('alpha').raw().toBuffer()
  assert.deepEqual(actual, expected)
})

test('palette compression reduces a large PNG within budget without changing its resized pixels', async () => {
  const width = 1600
  const height = 900
  const pixels = Buffer.alloc(width * height * 3)
  let value = 1
  for (let i = 0; i < pixels.length; i += 3) {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value >>> 24
  }
  const input = await sharp(pixels, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer()
  const result = await optimizeCover(input)
  assert.equal(result.method, 'proportional-resize-png-palette')
  assert.equal(result.meanChannelDifference, 0)
  assert.ok(result.after.bytes < 1_000_000)
  assert.equal(result.after.format, 'png')
  const expected = await sharp(input).resize({ width: 1200, withoutEnlargement: true }).ensureAlpha().raw().toBuffer()
  const actual = await sharp(result.data).ensureAlpha().raw().toBuffer()
  assert.deepEqual(actual, expected)
  assert.deepEqual((await optimizeCover(result.data)).data, result.data)
})

test('a rejected palette retains the original resized alpha channel', async () => {
  const input = await png(1600, 900, true)
  const result = await optimizeCover(input, { maxBytes: 1000 })
  assert.equal(result.method, 'proportional-resize-png-palette-rejected-smaller-resolution')
  assert.equal(result.after.width, 960, 'Stop at the quality floor even when the byte budget is unattainable')
  const expected = await sharp(input)
    .resize({ width: 960, withoutEnlargement: true })
    .extractChannel('alpha')
    .raw()
    .toBuffer()
  const actual = await sharp(result.data).extractChannel('alpha').raw().toBuffer()
  assert.deepEqual(actual, expected)
})

test('JPEG sources remain JPEG and unsupported formats stay byte-identical', async () => {
  const raw = await png()
  const input = await sharp(raw).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer()
  const result = await optimizeCover(input)
  assert.equal(result.after.format, 'jpeg')
  assert.equal(result.after.width, 1200)
  assert.equal(result.after.height, 675)
  const webp = await sharp(raw).webp().toBuffer()
  const unsupported = await optimizeCover(webp)
  assert.equal(unsupported.method, 'unsupported-or-oriented')
  assert.deepEqual(unsupported.data, webp)
})

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-cover-test-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const root = path.join(directory, 'articles')
  const mirror = path.join(directory, 'mirror')
  const output = path.join(directory, 'backup')
  const original = await png()
  const catalog = { articles: [article('a'), article('b'), { ...article('a'), language: 'es' }] }
  for (const location of [root, mirror]) {
    await fs.mkdir(path.join(location, 'metadata'), { recursive: true })
    await fs.writeFile(path.join(location, 'metadata/catalog.json'), JSON.stringify(catalog))
    for (const id of ['a', 'b']) {
      await fs.mkdir(path.join(location, id, 'images'), { recursive: true })
      await fs.writeFile(path.join(location, id, 'images/cover.png'), original)
    }
    await fs.writeFile(path.join(location, 'a/images/body.png'), original)
  }
  const run = (...args) => exec(process.execPath, [script, '--root', root, '--output', output, ...args])
  return { directory, root, mirror, output, original, run }
}

test('prepare saves verified backups without changing sources; apply synchronizes only covers', async t => {
  const f = await fixture(t)
  await f.run()
  const manifest = JSON.parse(await fs.readFile(path.join(f.output, 'manifest.json'), 'utf8'))
  assert.equal(manifest.covers.length, 2)
  for (const entry of manifest.covers) {
    assert.deepEqual(await fs.readFile(path.join(f.root, entry.file)), f.original)
    assert.deepEqual(await fs.readFile(path.join(f.output, 'originals', entry.file)), f.original)
    assert.equal(sha256(await fs.readFile(path.join(f.output, 'optimized', entry.file))), entry.after.sha256)
  }
  await f.run('--apply', '--mirror', f.mirror)
  for (const location of [f.root, f.mirror]) {
    for (const entry of manifest.covers)
      assert.equal(sha256(await fs.readFile(path.join(location, entry.file))), entry.after.sha256)
    assert.deepEqual(await fs.readFile(path.join(location, 'a/images/body.png')), f.original)
  }
  await assert.rejects(f.run(), /EEXIST/)
})

test('changed mirror blocks the entire apply before either copy receives any writes', async t => {
  const f = await fixture(t)
  await f.run()
  const altered = await png(20, 20)
  await fs.writeFile(path.join(f.mirror, 'b/images/cover.png'), altered)
  await assert.rejects(f.run('--apply', '--mirror', f.mirror), /Source changed since preparation/)
  for (const filename of ['a/images/cover.png', 'b/images/cover.png'])
    assert.deepEqual(await fs.readFile(path.join(f.root, filename)), f.original)
  assert.deepEqual(await fs.readFile(path.join(f.mirror, 'a/images/cover.png')), f.original)
  assert.deepEqual(await fs.readFile(path.join(f.mirror, 'b/images/cover.png')), altered)
})

test('damaged backup blocks apply and original source bytes remain intact', async t => {
  const f = await fixture(t)
  await f.run()
  await fs.writeFile(path.join(f.output, 'originals/b/images/cover.png'), 'damaged')
  await assert.rejects(f.run('--apply'), /Damaged originals/)
  for (const filename of ['a/images/cover.png', 'b/images/cover.png'])
    assert.deepEqual(await fs.readFile(path.join(f.root, filename)), f.original)
})

test('preparation rejects a symlink cover and backups inside the source checkout', async t => {
  const f = await fixture(t)
  await fs.unlink(path.join(f.root, 'b/images/cover.png'))
  await fs.symlink(path.join(f.root, 'a/images/cover.png'), path.join(f.root, 'b/images/cover.png'))
  await assert.rejects(f.run(), /Symlink/)
  await assert.rejects(
    exec(process.execPath, [script, '--root', f.root, '--output', path.join(f.root, 'backup')]),
    /Backups must be outside/,
  )
})
