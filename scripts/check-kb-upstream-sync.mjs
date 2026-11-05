import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { pathToFileURL } from 'node:url'
import matter from 'gray-matter'
import { remark } from 'remark'
import { readSlugMigrations, rewriteMarkdownLinks } from './migrate-kb-slugs.mjs'

// Read-only acceptance for the approved 1a62187 -> 94e5127 content sync.
// Reads both Git history and the final working tree; never fetches or writes.
// An upstream body edit is allowed: compare it to the NEW upstream body after
// URL migration, not to the old fork hash. Unchanged upstream bodies retain
// downstream edits. Existing descriptions, corrected dates and compressed
// assets are independently protected, even when upstream frontmatter is older.
const usage = 'node scripts/check-kb-upstream-sync.mjs --root <content-checkout> [--old <ref>] [--upstream <ref>]'
const defaultOld = '1a621879f26c8aaa30ed787bd3894f12b9c4575a'
const defaultUpstream = '94e5127b6b918e932acdd8fed9dc46eaa72e0c27'

function argumentsForRun() {
  const options = {
    '--root': 'public/education_hub_articles',
    '--old': defaultOld,
    '--upstream': defaultUpstream,
  }
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--help') return null
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(Object.hasOwn(options, args[i]) && args[i + 1] && !args[i + 1].startsWith('--'), usage)
    options[args[i]] = args[i + 1]
  }
  return options
}

export function verifyUpstreamSync({
  root: inputRoot,
  old: oldRef = defaultOld,
  upstream: upstreamRef = defaultUpstream,
}) {
  const root = fs.realpathSync(inputRoot)
  const git = (args, extra = {}) =>
    execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...extra })
  const commit = ref => {
    assert.match(ref, /^[A-Za-z0-9_./-]+$/, 'Use a commit SHA or ordinary local ref')
    assert.ok(!ref.startsWith('-'), 'A ref must not be an option')
    return git(['rev-parse', '--verify', `${ref}^{commit}`]).trim()
  }
  const old = commit(oldRef)
  const upstream = commit(upstreamRef)
  const ancestor = git(['merge-base', old, upstream]).trim()
  const objectFormat = git(['rev-parse', '--show-object-format']).trim()
  const blobId = bytes => createHash(objectFormat).update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
  const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
  const errors = []
  const check = (condition, message) => {
    if (!condition) errors.push(message)
  }
  const equal = (actual, expected, message) => check(isDeepStrictEqual(actual, expected), message)
  const tree = ref =>
    new Map(
      git(['ls-tree', '-rz', ref])
        .split('\0')
        .filter(Boolean)
        .flatMap(row => {
          const tab = row.indexOf('\t')
          const [mode, type, oid] = row.slice(0, tab).split(' ')
          return type === 'blob' ? [[row.slice(tab + 1), { mode, oid }]] : []
        }),
    )
  const readBlobs = ids => {
    const unique = [...new Set(ids)]
    if (!unique.length) return new Map()
    const output = git(['cat-file', '--batch'], { encoding: null, input: unique.join('\n') + '\n' })
    const blobs = new Map()
    let offset = 0
    for (const oid of unique) {
      const end = output.indexOf(10, offset)
      const [actualId, type, size] = output.subarray(offset, end).toString().split(' ')
      assert.equal(actualId, oid)
      assert.equal(type, 'blob')
      offset = end + 1
      blobs.set(oid, output.subarray(offset, offset + Number(size)).toString('utf8'))
      offset += Number(size) + 1
    }
    return blobs
  }
  const oldTree = tree(old)
  const upstreamTree = tree(upstream)
  const ancestorTree = tree(ancestor)
  const sourcePattern = /^[^/]+\/index(?:[_-]([a-z]{2}))?\.md$/
  const sourceBlobs = readBlobs(
    [oldTree, upstreamTree, ancestorTree].flatMap(entries =>
      [...entries].filter(([file]) => sourcePattern.test(file)).map(([, entry]) => entry.oid),
    ),
  )
  const readJSON = (ref, file) => JSON.parse(git(['show', `${ref}:${file}`]))
  const oldCatalog = readJSON(old, 'metadata/catalog.json')
  const oldMigrations = readJSON(old, 'metadata/slug-migrations.json')
  const migrations = readSlugMigrations(root)
  for (const { from, to } of oldMigrations.renames) equal(migrations.get(from), to, `Migration lost: ${from} -> ${to}`)
  equal(migrations.get('CKBuilders2'), 'ckbuilders2', 'Missing approved CKBuilders2 -> ckbuilders2 migration')
  equal(migrations.size, oldMigrations.renames.length + 1, 'Only the approved CKBuilders2 migration may be added')
  const mapped = file => {
    const [folder, ...rest] = file.split('/')
    return [migrations.get(folder) ?? folder, ...rest].join('/')
  }
  const mappedTree = entries => {
    const result = new Map()
    for (const [file, entry] of entries) {
      const target = mapped(file)
      assert.ok(!result.has(target), `Two source paths map to ${target}`)
      result.set(target, { ...entry, source: file })
    }
    return result
  }
  const previous = mappedTree(oldTree)
  const incoming = mappedTree(upstreamTree)
  const common = mappedTree(ancestorTree)
  const readFinal = file => {
    const absolute = path.resolve(root, file)
    if (!absolute.startsWith(root + path.sep) || !fs.existsSync(absolute)) {
      errors.push(`Missing final file: ${file}`)
      return null
    }
    const resolved = fs.realpathSync(absolute)
    assert.ok(resolved.startsWith(root + path.sep) && fs.lstatSync(absolute).isFile(), `Unsafe final file: ${file}`)
    return fs.readFileSync(absolute)
  }
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'metadata/catalog.json'), 'utf8'))
  const finalBySource = new Map(catalog.articles.map(article => [article.sourceFile, article]))
  const oldBySource = new Map(oldCatalog.articles.map(article => [mapped(article.sourceFile), article]))
  equal(finalBySource.size, catalog.articles.length, 'Duplicate catalog source files')
  equal(catalog.hubs, oldCatalog.hubs, 'Existing hub definitions changed')
  equal(catalog.subjects, oldCatalog.subjects, 'Existing subject definitions changed')
  equal(catalog.featured, oldCatalog.featured, 'Existing featured selections changed')
  const editorialFields = [
    'hub',
    'subjects',
    'internalTags',
    'librarySection',
    'reviewStatus',
    'matchMethod',
    'candidateKeys',
    'relatedArticleIds',
    'excludedFromRecommendations',
  ]
  const taxonomyFields = [
    'hub',
    'subjects',
    'internalTags',
    'librarySection',
    'relatedArticleIds',
    'excludedFromRecommendations',
  ]
  const expectedSources = new Set([...previous.keys(), ...incoming.keys()].filter(file => sourcePattern.test(file)))
  const summary = {
    root,
    old,
    upstream,
    ancestor,
    migrations: migrations.size,
    sources: expectedSources.size,
    newRenditions: {},
    preservedDescriptions: 0,
    preservedDateCorrections: 0,
    preservedEditorialRecords: 0,
    upstreamBodyUpdates: 0,
    mappedBodyLinks: 0,
    protectedAssets: 0,
    upstreamAssets: 0,
  }
  const rendered = new Map()
  const allowedSourceChanges = []
  const dateValue = value => (value instanceof Date ? value.toISOString() : value)
  for (const file of [...expectedSources].sort()) {
    const bytes = readFinal(file)
    const record = finalBySource.get(file)
    check(Boolean(record), `Catalog omits ${file}`)
    if (!bytes || !record) continue
    const current = matter(bytes.toString('utf8'))
    rendered.set(file, current)
    const oldEntry = previous.get(file)
    const upstreamEntry = incoming.get(file)
    const ancestorEntry = common.get(file)
    const oldSource = oldEntry && matter(sourceBlobs.get(oldEntry.oid))
    const upstreamSource = upstreamEntry && matter(sourceBlobs.get(upstreamEntry.oid))
    const ancestorSource = ancestorEntry && matter(sourceBlobs.get(ancestorEntry.oid))
    const upstreamChanged = upstreamSource && (!ancestorSource || upstreamSource.content !== ancestorSource.content)
    const chosen = upstreamChanged || !oldSource ? upstreamSource : oldSource
    assert.ok(chosen, `No expected source for ${file}`)
    const rewritten = rewriteMarkdownLinks(chosen.content, migrations)
    equal(current.content, rewritten.markdown, `Unexpected body change or omitted upstream update: ${file}`)
    summary.mappedBodyLinks += rewritten.replacements
    if (oldSource && upstreamChanged) summary.upstreamBodyUpdates++
    equal(record.sourceSHA256, sha256(bytes), `Stale sourceSHA256: ${file}`)
    equal(record.bodySHA256, sha256(current.content), `Stale bodySHA256: ${file}`)
    const id = file.split('/')[0]
    const language = sourcePattern.exec(file)[1] ?? 'en'
    equal(record.id, id, `Catalog ID differs from folder: ${file}`)
    equal(record.language, language, `Catalog locale differs from filename: ${file}`)
    equal(
      record.canonicalPath,
      `${language === 'en' ? '' : `/${language}`}/knowledge-base/${id}`,
      `Wrong canonical path: ${file}`,
    )
    check(/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(id), `Noncanonical folder remains: ${id}`)
    const prior = oldBySource.get(file)
    if (prior) {
      // This upstream batch changes existing article bodies/links, not their
      // frontmatter. Keep every existing SEO/editorial field; hashes can change
      // only after the source body has passed the three-way comparison above.
      equal(current.data, oldSource.data, `Existing source frontmatter changed: ${file}`)
      const mutableFields = ['sourceSHA256', 'bodySHA256', 'readingMinutes']
      for (const field of new Set([...Object.keys(prior), ...Object.keys(record)]))
        if (!mutableFields.includes(field))
          equal(record[field], prior[field], `Existing catalog ${field} changed: ${file}`)
      const text = current.content
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/<[^>]+>/g, ' ')
        .replace(/[#*_`>~]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      equal(
        record.readingMinutes,
        Math.max(1, Math.ceil(text.length / (language === 'zh' ? 500 : 1300))),
        `Stale readingMinutes: ${file}`,
      )
      const fields = Object.fromEntries(
        mutableFields
          .filter(field => !isDeepStrictEqual(record[field], prior[field]))
          .map(field => [field, { before: prior[field], after: record[field] }]),
      )
      if (Object.keys(fields).length) allowedSourceChanges.push({ sourceFile: file, fields })
      for (const field of editorialFields) equal(record[field], prior[field], `Existing ${field} changed: ${file}`)
      summary.preservedEditorialRecords++
      if (typeof oldSource.data.description === 'string' && oldSource.data.description.trim()) {
        equal(current.data.description, oldSource.data.description, `Existing source description changed: ${file}`)
        equal(record.description, prior.description, `Existing catalog description changed: ${file}`)
        summary.preservedDescriptions++
      }
      if (ancestorSource && !isDeepStrictEqual(dateValue(oldSource.data.date), dateValue(ancestorSource.data.date))) {
        equal(
          dateValue(current.data.date),
          dateValue(oldSource.data.date),
          `Downstream source date correction lost: ${file}`,
        )
        equal(record.date, prior.date, `Downstream catalog date correction lost: ${file}`)
        summary.preservedDateCorrections++
      }
    } else {
      summary.newRenditions[language] = (summary.newRenditions[language] ?? 0) + 1
      // New translations keep their upstream title/author/date/frontmatter.
      // The catalog's taxonomy is separately inherited from the English record.
      equal(current.data, upstreamSource.data, `New rendition frontmatter changed: ${file}`)
      const english = oldBySource.get(`${id}/index.md`) ?? finalBySource.get(`${id}/index.md`)
      if (language === 'zh' && english)
        for (const field of taxonomyFields)
          equal(record[field], english[field], `New Chinese ${field} differs from current English: ${file}`)
    }
  }
  for (const file of finalBySource.keys()) check(expectedSources.has(file), `Unexpected catalog rendition: ${file}`)
  const expectedOldDescriptions = oldCatalog.articles.filter(
    a => typeof a.description === 'string' && a.description.trim(),
  ).length
  equal(summary.preservedDescriptions, expectedOldDescriptions, 'Not every existing description was checked')

  // Protect previously optimized bytes, not every old image indiscriminately:
  // a genuine NEW upstream image update is accepted when the fork had not
  // independently changed that asset. Concurrent image edits require review.
  const imagePattern = /\.(?:png|jpe?g|gif|svg|webp|avif|apng)$/i
  const assets = new Set(
    [...previous.keys(), ...incoming.keys()].filter(file => imagePattern.test(file) && file.includes('/')),
  )
  for (const file of assets) {
    const oldEntry = previous.get(file)
    const upstreamEntry = incoming.get(file)
    const ancestorEntry = common.get(file)
    const protectedAsset = oldEntry && (!ancestorEntry || oldEntry.oid !== ancestorEntry.oid)
    if (
      protectedAsset &&
      ancestorEntry &&
      upstreamEntry &&
      upstreamEntry.oid !== ancestorEntry.oid &&
      upstreamEntry.oid !== oldEntry.oid
    )
      errors.push(`Both fork and upstream changed image; explicit resolution needed: ${file}`)
    const expected = protectedAsset ? oldEntry : (upstreamEntry ?? oldEntry)
    const bytes = readFinal(file)
    if (bytes)
      equal(
        blobId(bytes),
        expected.oid,
        `${protectedAsset ? 'Optimized/downstream image changed' : 'Upstream image omitted or changed'}: ${file}`,
      )
    if (protectedAsset) summary.protectedAssets++
    else summary.upstreamAssets++
  }

  for (const [file, parsed] of rendered) {
    if (oldBySource.has(file)) continue
    const imageURLs = parsed.data.coverImage ? [parsed.data.coverImage] : []
    const visit = node => {
      if (node.type === 'image') imageURLs.push(node.url)
      node.children?.forEach(visit)
    }
    visit(remark().parse(parsed.content))
    for (const url of imageURLs) {
      if (typeof url !== 'string' || /^(?:https?:)?\/\//i.test(url) || /^[a-z][a-z0-9+.-]*:/i.test(url)) continue
      const pathname = decodeURIComponent(url.split(/[?#]/)[0])
      const target = pathname.startsWith('/education_hub_articles/')
        ? pathname.slice('/education_hub_articles/'.length)
        : pathname.startsWith('/')
          ? null
          : path.posix.normalize(path.posix.join(path.posix.dirname(file), pathname))
      if (target)
        check(fs.existsSync(path.join(root, mapped(target))), `Missing new rendition image: ${file} -> ${url}`)
    }
  }
  return {
    passed: errors.length === 0,
    summary,
    errors,
    oldCatalog,
    catalog,
    // Do not offer normalization exceptions when ANY acceptance check failed.
    allowedSourceChanges: errors.length ? [] : allowedSourceChanges,
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    const options = argumentsForRun()
    if (!options) console.log(usage)
    else {
      const { errors, summary, passed } = verifyUpstreamSync({
        root: options['--root'],
        old: options['--old'],
        upstream: options['--upstream'],
      })
      console.log(JSON.stringify({ ...summary, passed, errors: errors.length }, null, 2))
      for (const error of errors) console.error(`- ${error}`)
      if (errors.length) process.exitCode = 1
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
