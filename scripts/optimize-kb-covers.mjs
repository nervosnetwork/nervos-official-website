import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export function coverPaths(catalog) {
  return [
    ...new Set(
      catalog.articles.flatMap(article => {
        if (!article.coverImage) return []
        const prefix = `/education_hub_articles/${article.id}/`
        if (!article.coverImage.startsWith(prefix)) throw new Error(`Non-local cover: ${article.coverImage}`)
        const relative = article.coverImage.slice('/education_hub_articles/'.length)
        if (/[\\\0?#%]/.test(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) {
          throw new Error(`Unsafe cover path: ${relative}`)
        }
        return [relative]
      }),
    ),
  ].sort()
}

async function regularFile(root, relative) {
  let current = root
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error(`Symlink root: ${root}`)
  for (const part of relative.split('/')) {
    current = path.join(current, part)
    if ((await fs.lstat(current)).isSymbolicLink()) throw new Error(`Symlink: ${current}`)
  }
  if (!(await fs.stat(current)).isFile()) throw new Error(`Not a regular file: ${current}`)
  return current
}

// Only covers are processed. Preserve paths, file formats and composition.
// Palette compression is used only when a resized PNG still exceeds the budget.
export async function optimizeCover(input, { maxWidth = 1200, maxBytes = 1_000_000 } = {}) {
  const metadata = await sharp(input).metadata()
  const { width, height, format } = metadata
  const before = { width, height, bytes: input.length, sha256: sha256(input), format }
  const unchanged = reason => ({ data: input, before, after: before, method: reason })
  if (!['png', 'jpeg'].includes(format) || metadata.pages > 1 || (metadata.orientation && metadata.orientation !== 1)) {
    return unchanged('unsupported-or-oriented')
  }
  if (width <= maxWidth && input.length < maxBytes) return unchanged('already-within-budget')
  const pipeline = (targetWidth = maxWidth) => sharp(input).resize({ width: targetWidth, withoutEnlargement: true })
  let method = format === 'png' ? 'proportional-resize-png' : 'proportional-resize-jpeg'
  let data =
    format === 'png'
      ? await pipeline().png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
      : await pipeline().jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true }).toBuffer()
  let meanChannelDifference = 0
  if (format === 'png' && data.length >= maxBytes) {
    const palette = await pipeline()
      .png({
        compressionLevel: 9,
        palette: true,
        quality: 100,
        colours: 256,
        dither: 0.5,
        effort: 10,
      })
      .toBuffer()
    const reference = await sharp(data).ensureAlpha().raw().toBuffer()
    const decoded = await sharp(palette).ensureAlpha().raw().toBuffer()
    let difference = 0
    let sameAlpha = true
    for (let i = 0; i < reference.length; i++) {
      if (i % 4 === 3 && reference[i] !== decoded[i]) sameAlpha = false
      if (i % 4 !== 3) difference += Math.abs(reference[i] - decoded[i])
    }
    meanChannelDifference = difference / (reference.length * 0.75)
    // A numeric guard is not visual approval. Inspect text/gradients separately.
    if (sameAlpha && meanChannelDifference <= 5 && palette.length < data.length) {
      data = palette
      method = 'proportional-resize-png-palette'
    } else {
      method += '-palette-rejected'
    }
  }
  // If palette encoding changes transparency, reduce resolution instead of
  // flattening the image. Stop at 960px; never shrink without a quality floor.
  if (format === 'png' && data.length >= maxBytes) {
    let targetWidth = Math.min(maxWidth, width)
    const minimumWidth = Math.min(960, targetWidth)
    while (data.length >= maxBytes && targetWidth > minimumWidth) {
      targetWidth = Math.max(minimumWidth, targetWidth - 80)
      data = await pipeline(targetWidth).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer()
    }
    if (targetWidth < Math.min(maxWidth, width)) method += '-smaller-resolution'
  }
  if (data.length >= input.length) return unchanged('would-not-reduce-bytes')
  const result = await sharp(data).metadata()
  if (
    result.format !== format ||
    result.width > width ||
    result.height > height ||
    Math.abs(result.height - (result.width * height) / width) > 0.51
  ) {
    throw new Error('Image format, aspect ratio or no-upscale invariant failed')
  }
  return {
    data,
    before,
    after: { width: result.width, height: result.height, bytes: data.length, sha256: sha256(data), format },
    method,
    meanChannelDifference,
  }
}

async function main() {
  const args = process.argv.slice(2)
  const value = flag => {
    const index = args.indexOf(flag)
    return index < 0 ? undefined : args[index + 1]
  }
  if (!value('--root') || !value('--output')) {
    throw new Error(
      'Usage: node scripts/optimize-kb-covers.mjs --root <article-checkout> --output <backup-directory> [--apply] [--mirror <local-content-copy>]',
    )
  }
  const root = path.resolve(value('--root'))
  const output = path.resolve(value('--output'))
  if (output === root || output.startsWith(root + path.sep))
    throw new Error('Backups must be outside the article checkout')
  const manifestPath = path.join(output, 'manifest.json')
  if (args.includes('--apply')) {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    if (manifest.root !== root) throw new Error('Manifest belongs to a different article checkout')
    const changed = manifest.covers.filter(entry => entry.before.sha256 !== entry.after.sha256)
    const roots = [...new Set([root, ...(value('--mirror') ? [path.resolve(value('--mirror'))] : [])])]
    // Preflight the entire set before overwriting any bytes, including the preview copy.
    for (const entry of changed) {
      if (entry.file.includes('..') || path.isAbsolute(entry.file)) throw new Error('Unsafe manifest path')
      for (const [folder, expected] of [
        ['originals', entry.before.sha256],
        ['optimized', entry.after.sha256],
      ]) {
        const bytes = await fs.readFile(await regularFile(path.join(output, folder), entry.file))
        if (sha256(bytes) !== expected) throw new Error(`Damaged ${folder}: ${entry.file}`)
      }
      for (const target of roots) {
        const bytes = await fs.readFile(await regularFile(target, entry.file))
        if (sha256(bytes) !== entry.before.sha256)
          throw new Error(`Source changed since preparation: ${target}/${entry.file}`)
      }
    }
    for (const entry of changed) {
      const bytes = await fs.readFile(path.join(output, 'optimized', entry.file))
      for (const target of roots) {
        const filename = await regularFile(target, entry.file)
        await fs.writeFile(filename, bytes)
        if (sha256(await fs.readFile(filename)) !== entry.after.sha256)
          throw new Error(`Write verification failed: ${filename}`)
      }
    }
    console.log(JSON.stringify({ changed: changed.length, roots, backup: path.join(output, 'originals') }))
    return
  }
  await fs.mkdir(output, { recursive: true })
  const manifest = {
    root,
    policy: { maxWidth: 1200, minimumResizeWidth: 960, maxBytes: 1_000_000, crop: false, upscale: false },
    covers: [],
  }
  // Refuse to reuse a previous run or replace an existing backup.
  const lock = await fs.open(path.join(output, 'run.lock'), 'wx')
  await lock.close()
  const catalog = JSON.parse(await fs.readFile(path.join(root, 'metadata/catalog.json'), 'utf8'))
  for (const file of coverPaths(catalog)) {
    const input = await fs.readFile(await regularFile(root, file))
    const { data, ...entry } = await optimizeCover(input)
    manifest.covers.push({ file, ...entry })
    if (entry.before.sha256 !== entry.after.sha256) {
      for (const [folder, bytes] of [
        ['originals', input],
        ['optimized', data],
      ]) {
        const destination = path.join(output, folder, file)
        await fs.mkdir(path.dirname(destination), { recursive: true })
        await fs.writeFile(destination, bytes, { flag: 'wx' })
      }
    }
    if (manifest.covers.length % 25 === 0) console.log(`Prepared ${manifest.covers.length} covers`)
  }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' })
  const totals = manifest.covers.reduce(
    (sum, entry) => ({
      before: sum.before + entry.before.bytes,
      after: sum.after + entry.after.bytes,
      changed: sum.changed + Number(entry.before.sha256 !== entry.after.sha256),
      overBudget: sum.overBudget + Number(entry.after.bytes >= manifest.policy.maxBytes),
    }),
    { before: 0, after: 0, changed: 0, overBudget: 0 },
  )
  console.log(JSON.stringify({ ...totals, manifest: manifestPath }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message)
    process.exitCode = 1
  })
}
