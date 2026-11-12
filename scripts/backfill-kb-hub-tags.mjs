import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import matter from 'gray-matter'
import { KB_HUBS } from '../config/kb-hubs.mjs'
import { readHubTag } from './kb-hub-tag.mjs'

const hash = value => crypto.createHash('sha256').update(value).digest('hex')

/** Backfill existing, reviewed assignments only. Dry-run unless write is explicit. */
export function backfillHubTags(inputRoot, { write = false, unifyTranslations = false } = {}) {
  const root = fs.realpathSync(inputRoot)
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'metadata/catalog.json'), 'utf8'))
  const validHubs = new Set(KB_HUBS.map(hub => hub.id))
  const families = new Map()
  const identities = new Set()
  for (const article of catalog.articles) {
    assert.match(article.id, /^[a-z0-9]+(?:_[a-z0-9]+)*$/, 'Use an existing canonical article directory')
    const identity = `${article.id}:${article.language}`
    assert(!identities.has(identity), `Duplicate classification record: ${identity}`)
    identities.add(identity)
    assert(article.hub === null || validHubs.has(article.hub), `Unknown existing Hub: ${identity}`)
    if (!families.has(article.id)) families.set(article.id, [])
    families.get(article.id).push(article)
  }
  const report = {
    catalogSourceCommit: catalog.sourceCommit,
    englishArticles: 0,
    hubs: KB_HUBS.map(hub => ({ ...hub, articles: 0 })),
    changes: [],
    alreadyTagged: [],
    unclassified: [],
    pending: [],
    written: 0,
  }
  const plans = []
  for (const [id, versions] of families) {
    const english = versions.find(article => article.language === 'en')
    assert(english, `No English classification record: ${id}`)
    report.englishArticles++
    const known = [...new Set(versions.map(article => article.hub).filter(Boolean))]
    if (!known.length) {
      report.unclassified.push({ id, title: english.title })
      continue
    }
    const gap = versions.some(article => article.hub !== known[0])
    if (known.length > 1 || (gap && !unifyTranslations)) {
      report.pending.push({
        id,
        title: english.title,
        versions: versions.map(({ language, hub }) => ({ language, hub })),
      })
      continue
    }
    const hub = known[0]
    const sourceFile = `${id}/index.md`
    const filename = path.join(root, sourceFile)
    assert(fs.lstatSync(filename).isFile() && !fs.lstatSync(filename).isSymbolicLink(), `Unsafe source: ${sourceFile}`)
    assert(fs.realpathSync(filename).startsWith(root + path.sep), `Source escapes content root: ${sourceFile}`)
    const raw = fs.readFileSync(filename, 'utf8')
    const header = /^\uFEFF?---[^\S\r\n]*\r?\n/.exec(raw)?.[0]
    assert(header, `Only standard YAML frontmatter is allowed: ${sourceFile}`)
    const before = matter(raw)
    const existing = readHubTag(before.data)
    assert(
      existing === undefined || existing === hub,
      `Source tag conflicts with the classification table: ${sourceFile}`,
    )
    report.hubs.find(item => item.id === hub).articles++
    if (existing !== undefined) {
      report.alreadyTagged.push({ id, sourceFile, hub })
      continue
    }
    assert.equal(hash(raw), english.sourceSHA256, `Catalog is stale for ${sourceFile}; regenerate before backfilling`)
    const newline = header.endsWith('\r\n') ? '\r\n' : '\n'
    const updated = `${header}hub: ${hub}${newline}${raw.slice(header.length)}`
    const after = matter(updated)
    const { hub: added, ...otherFields } = after.data
    assert.equal(added, hub)
    assert(isDeepStrictEqual(otherFields, before.data), `Other frontmatter changed: ${sourceFile}`)
    assert.equal(after.content, before.content, `Article body changed: ${sourceFile}`)
    plans.push({ filename, updated })
    report.changes.push({ id, sourceFile, hub, bodySHA256: hash(before.content) })
  }
  // All source files, hashes and assignments are checked before the first write.
  if (write) {
    for (const plan of plans) fs.writeFileSync(plan.filename, plan.updated)
    report.written = plans.length
  }
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    const root = args.shift()
    assert(
      root && !root.startsWith('--'),
      'Usage: node scripts/backfill-kb-hub-tags.mjs <content-root> [--write] [--unify-translations] [--report <json-path>]',
    )
    let write = false,
      unifyTranslations = false,
      reportPath
    while (args.length) {
      const flag = args.shift()
      if (flag === '--write') write = true
      else if (flag === '--unify-translations') unifyTranslations = true
      else if (flag === '--report') {
        reportPath = args.shift()
        assert(reportPath && !reportPath.startsWith('--'), '--report requires a JSON path')
      } else throw new Error(`Unknown option: ${flag}`)
    }
    if (reportPath) {
      const contentRoot = fs.realpathSync(root)
      const destination = path.resolve(reportPath)
      assert(
        destination !== contentRoot && !destination.startsWith(contentRoot + path.sep),
        'Write the report outside the content checkout so it cannot overwrite article sources',
      )
    }
    const report = backfillHubTags(root, { write, unifyTranslations })
    if (reportPath) fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    console.log(
      JSON.stringify(
        {
          mode: write ? 'write' : 'dry-run',
          sourceCommit: report.catalogSourceCommit,
          englishArticles: report.englishArticles,
          changes: report.changes.length,
          alreadyTagged: report.alreadyTagged.length,
          unclassified: report.unclassified.length,
          pending: report.pending.length,
          written: report.written,
          hubs: report.hubs,
        },
        null,
        2,
      ),
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
