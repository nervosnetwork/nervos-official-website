import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import matter from 'gray-matter'
import { remark } from 'remark'

const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const json = value => JSON.stringify(value, null, 2) + '\n'

export function readSlugMigrations(root) {
  const { renames } = JSON.parse(fs.readFileSync(path.join(root, 'metadata/slug-migrations.json'), 'utf8'))
  assert(Array.isArray(renames) && renames.length, 'Expected an explicit non-empty slug migration list')
  const mapping = new Map()
  const destinations = new Set()
  for (const { from, to } of renames) {
    assert(typeof from === 'string' && /^[A-Za-z0-9_ -]+$/.test(from), `Unsafe source slug: ${from}`)
    assert(typeof to === 'string' && /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(to), `Unsafe destination slug: ${to}`)
    assert(from !== to && !mapping.has(from) && !destinations.has(to), `Duplicate/no-op migration: ${from}`)
    mapping.set(from, to)
    destinations.add(to)
  }
  for (const to of destinations) assert(!mapping.has(to), `Chained migration is not supported: ${to}`)
  return mapping
}

// Only a complete path segment from the approved list can change. The spelling
// of the origin, other path segments, query and fragment is retained verbatim.
export function rewriteKBUrl(value, renames) {
  if (typeof value !== 'string') return value
  let origin = ''
  let rest = value
  const absolute = /^((?:https?:)?\/\/[^/?#]+)(.*)$/i.exec(value)
  if (absolute) {
    let url
    try {
      url = new URL(value.startsWith('//') ? `https:${value}` : value)
    } catch {
      return value
    }
    if (!['nervos.org', 'www.nervos.org'].includes(url.hostname) || url.username || url.password || url.port)
      return value
    ;[, origin, rest] = absolute
  } else if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith('//')) return value
  const boundary = rest.search(/[?#]/)
  let pathname = boundary < 0 ? rest : rest.slice(0, boundary)
  const suffix = boundary < 0 ? '' : rest.slice(boundary)
  const parts = pathname.split('/')
  let index = 0
  while (['', '.', '..'].includes(parts[index]) && index < parts.length) index++
  if (/^(en|zh|es|fr|ko|tr|pt)$/.test(parts[index])) index++
  if (parts[index] === 'knowledge-base' || parts[index] === 'education_hub_articles') index++
  else if (origin || pathname.startsWith('/')) return value
  try {
    const replacement = renames.get(decodeURIComponent(parts[index] ?? ''))
    if (replacement) parts[index] = replacement
  } catch {
    return value
  }
  pathname = parts.join('/')
  return origin + pathname + suffix
}

function rewriteHTML(value, renames) {
  return value.replace(
    /(\b(?:href|src)\s*=\s*)(["'])(.*?)\2/gi,
    (_, prefix, quote, url) => prefix + quote + rewriteKBUrl(url, renames) + quote,
  )
}

function destinationRange(raw, type) {
  let start
  if (type === 'definition') {
    const prefix = /^\s*\[(?:\\.|[^\]])+\]:\s*/.exec(raw)
    assert(prefix, `Cannot locate definition destination: ${raw}`)
    start = prefix[0].length
  } else {
    let depth = 0
    let closing = -1
    for (let index = raw.startsWith('!') ? 1 : 0; index < raw.length; index++) {
      if (raw[index] === '\\') index++
      else if (raw[index] === '[') depth++
      else if (raw[index] === ']' && --depth === 0) {
        closing = index
        break
      }
    }
    assert(closing >= 0 && raw[closing + 1] === '(', `Cannot locate inline destination: ${raw}`)
    start = closing + 2
    while (/\s/.test(raw[start] ?? '') && start < raw.length) start++
  }
  if (raw[start] === '<') {
    const end = raw.indexOf('>', start + 1)
    assert(end >= 0, `Unclosed link destination: ${raw}`)
    return [start + 1, end]
  }
  let depth = 0
  let end = start
  for (; end < raw.length; end++) {
    if (raw[end] === '\\') end++
    else if (raw[end] === '(') depth++
    else if (raw[end] === ')') {
      if (!depth) break
      depth--
    } else if (/\s/.test(raw[end]) && !depth) break
  }
  return [start, end]
}

function semanticTree(node, renames) {
  const result = {}
  for (const [key, value] of Object.entries(node)) {
    if (key === 'position') continue
    if (key === 'children') result[key] = value.map(child => semanticTree(child, renames))
    else if (key === 'url' && renames) result[key] = rewriteKBUrl(value, renames)
    else if (key === 'value' && node.type === 'html' && renames) result[key] = rewriteHTML(value, renames)
    else result[key] = value
  }
  return result
}

export function rewriteMarkdownLinks(markdown, renames) {
  const tree = remark().parse(markdown)
  const edits = []
  const visit = node => {
    const start = node.position?.start.offset
    const end = node.position?.end.offset
    if (node.type === 'html') {
      const changed = rewriteHTML(node.value, renames)
      if (changed !== node.value) edits.push({ start, end, replacement: changed })
    } else if (['link', 'image', 'definition'].includes(node.type)) {
      const destination = rewriteKBUrl(node.url, renames)
      if (destination !== node.url) {
        const raw = markdown.slice(start, end)
        if (node.type === 'link' && raw.startsWith('<') && raw.endsWith('>')) {
          // Keep an autolink's displayed URL unchanged while updating its href.
          edits.push({ start, end, replacement: `[${raw.slice(1, -1)}](${destination})` })
        } else {
          const [from, to] = destinationRange(raw, node.type)
          const replacement = rewriteKBUrl(raw.slice(from, to), renames)
          assert.notEqual(replacement, raw.slice(from, to), `Unable to rewrite destination: ${raw}`)
          edits.push({ start: start + from, end: start + to, replacement })
        }
      }
    }
    node.children?.forEach(visit)
  }
  visit(tree)
  let result = markdown
  let previous = markdown.length + 1
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    assert(edit.end <= previous, 'Overlapping Markdown destination edits')
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end)
    previous = edit.start
  }
  assert.deepEqual(
    semanticTree(remark().parse(result)),
    semanticTree(tree, renames),
    'Visible Markdown semantics changed',
  )
  return { markdown: result, replacements: edits.length }
}

function inventory(root, folders) {
  const files = new Map()
  const visit = relative => {
    const absolute = path.join(root, relative)
    const stat = fs.lstatSync(absolute)
    assert(!stat.isSymbolicLink(), `Refusing a symlink in the article inventory: ${relative}`)
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) visit(path.join(relative, name))
    } else {
      assert(stat.isFile(), `Unsupported article entry: ${relative}`)
      files.set(relative, fs.readFileSync(absolute))
    }
  }
  folders.forEach(visit)
  return files
}

export function migrateKBSlugs(inputRoot, { check = false } = {}) {
  const root = fs.realpathSync(inputRoot)
  const metadataDirectory = fs.lstatSync(path.join(root, 'metadata'))
  assert(metadataDirectory.isDirectory() && !metadataDirectory.isSymbolicLink(), 'Metadata must be a real directory')
  for (const file of ['slug-migrations.json', 'catalog.json', 'reconciliation.json']) {
    const stat = fs.lstatSync(path.join(root, 'metadata', file))
    assert(stat.isFile() && !stat.isSymbolicLink(), `Metadata must be a regular file: ${file}`)
  }
  const renames = readSlugMigrations(root)
  const entries = fs.readdirSync(root, { withFileTypes: true })
  const names = new Set(entries.map(entry => entry.name))
  const pending = []
  for (const [from, to] of renames) {
    assert(names.has(from) !== names.has(to), `Expected exactly one source/destination directory: ${from} -> ${to}`)
    const current = names.has(from) ? from : to
    assert(fs.lstatSync(path.join(root, current)).isDirectory(), `Not an article directory: ${current}`)
    assert(fs.existsSync(path.join(root, current, 'index.md')), `Missing English source: ${current}`)
    for (const name of names) {
      assert(
        name === current || name.toLowerCase() !== to.toLowerCase(),
        `Case-insensitive destination collision: ${to}`,
      )
    }
    if (current === from) pending.push({ from, to })
  }
  const folders = entries
    .filter(entry => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'index.md')))
    .map(entry => entry.name)
  const before = inventory(root, folders)
  const move = filename => {
    const [folder, ...rest] = filename.split(path.sep)
    return [renames.get(folder) ?? folder, ...rest].join(path.sep)
  }
  const after = new Map()
  let changedMarkdown = 0
  let linkReplacements = 0
  for (const [filename, bytes] of before) {
    let result = bytes
    if (filename.endsWith('.md')) {
      const raw = bytes.toString('utf8')
      const parsed = matter(raw)
      assert(raw.endsWith(parsed.content), `Frontmatter parser changed line endings: ${filename}`)
      const rewritten = rewriteMarkdownLinks(parsed.content, renames)
      const next = raw.slice(0, raw.length - parsed.content.length) + rewritten.markdown
      assert.deepEqual(matter(next).data, parsed.data, `Frontmatter changed: ${filename}`)
      result = Buffer.from(next)
      if (!result.equals(bytes)) changedMarkdown++
      linkReplacements += rewritten.replacements
    }
    const destination = move(filename)
    assert(!after.has(destination), `Duplicate migrated file: ${destination}`)
    after.set(destination, result)
  }
  const catalogPath = path.join(root, 'metadata/catalog.json')
  const reportPath = path.join(root, 'metadata/reconciliation.json')
  const catalogRaw = fs.readFileSync(catalogPath, 'utf8')
  const reportRaw = fs.readFileSync(reportPath, 'utf8')
  const catalog = JSON.parse(catalogRaw)
  const report = JSON.parse(reportRaw)
  const sourceFiles = new Set(catalog.articles.map(article => article.sourceFile))
  assert.equal(sourceFiles.size, catalog.articles.length, 'Duplicate catalog source files')
  assert.deepEqual(
    sourceFiles,
    new Set([...before.keys()].filter(file => /(?:^|\/)index(?:[_-][a-z]{2})?\.md$/.test(file))),
    'Catalog must inventory every source rendition before migration',
  )
  for (const article of catalog.articles) {
    const raw = before.get(article.sourceFile)
    assert(raw, `Catalog source missing: ${article.sourceFile}`)
    assert.equal(hash(raw), article.sourceSHA256, `Stale source hash: ${article.sourceFile}`)
    assert.equal(hash(matter(raw).content), article.bodySHA256, `Stale body hash: ${article.sourceFile}`)
    article.id = renames.get(article.id) ?? article.id
    article.sourceFile = move(article.sourceFile)
    article.canonicalPath = rewriteKBUrl(article.canonicalPath, renames)
    article.coverImage = rewriteKBUrl(article.coverImage, renames)
    article.relatedArticleIds = article.relatedArticleIds.map(id => renames.get(id) ?? id)
    article.sourceSHA256 = hash(after.get(article.sourceFile))
    article.bodySHA256 = hash(matter(after.get(article.sourceFile)).content)
  }
  for (const featured of catalog.featured) {
    featured.articleId = renames.get(featured.articleId) ?? featured.articleId
    featured.url = rewriteKBUrl(featured.url, renames)
  }
  for (const issue of report.issues) issue.sourceFile = move(issue.sourceFile)
  for (const featured of report.unresolvedFeatured) {
    featured.articleId = renames.get(featured.articleId) ?? featured.articleId
    featured.url = rewriteKBUrl(featured.url, renames)
  }
  assert.equal(
    new Set(catalog.articles.map(article => article.canonicalPath)).size,
    catalog.articles.length,
    'Duplicate migrated canonical paths',
  )
  const summary = {
    root,
    check,
    renamedDirectories: pending.length,
    articleDirectories: folders.length,
    renditions: catalog.articles.length,
    files: before.size,
    assets: [...before.keys()].filter(file => !file.endsWith('.md')).length,
    movedFiles: [...before.keys()].filter(file => move(file) !== file).length,
    changedMarkdown,
    linkReplacements,
    changedMetadata: Number(json(catalog) !== catalogRaw) + Number(json(report) !== reportRaw),
  }
  if (check) return summary

  // All validation and content planning completes before the first mutation.
  // A temporary name makes case-only moves reliable on case-insensitive disks.
  const temporary = pending.length ? fs.mkdtempSync(path.join(root, '.d18-slug-migration-')) : null
  const staged = []
  const completed = []
  try {
    for (const rename of pending) {
      fs.renameSync(path.join(root, rename.from), path.join(temporary, rename.from))
      staged.push(rename)
    }
    for (const rename of pending) {
      fs.renameSync(path.join(temporary, rename.from), path.join(root, rename.to))
      completed.push(rename)
    }
    for (const [filename, bytes] of after) {
      if (!fs.readFileSync(path.join(root, filename)).equals(bytes)) fs.writeFileSync(path.join(root, filename), bytes)
    }
    if (json(catalog) !== catalogRaw) fs.writeFileSync(catalogPath, json(catalog))
    if (json(report) !== reportRaw) fs.writeFileSync(reportPath, json(report))
    const actual = inventory(
      root,
      folders.map(folder => renames.get(folder) ?? folder),
    )
    assert.deepEqual([...actual.keys()].sort(), [...after.keys()].sort(), 'Post-migration file inventory changed')
    for (const [filename, bytes] of after)
      assert(actual.get(filename).equals(bytes), `Post-migration bytes differ: ${filename}`)
  } catch (error) {
    // Recover original paths and bytes if a write or postcondition fails.
    for (const rename of completed.reverse())
      fs.renameSync(path.join(root, rename.to), path.join(temporary, rename.from))
    for (const rename of staged.reverse())
      fs.renameSync(path.join(temporary, rename.from), path.join(root, rename.from))
    for (const [filename, bytes] of before) fs.writeFileSync(path.join(root, filename), bytes)
    fs.writeFileSync(catalogPath, catalogRaw)
    fs.writeFileSync(reportPath, reportRaw)
    throw error
  } finally {
    if (temporary && fs.existsSync(temporary) && fs.readdirSync(temporary).length === 0) fs.rmdirSync(temporary)
  }
  return summary
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const check = args.includes('--check')
  const roots = args.filter(argument => argument !== '--check')
  assert(
    roots.length && roots.every(root => !root.startsWith('-')),
    'Usage: migrate-kb-slugs.mjs [--check] <article-root...>',
  )
  // Preflight every requested checkout before mutating any of them.
  const plans = roots.map(root => migrateKBSlugs(root, { check: true }))
  for (const [index, root] of roots.entries()) console.log(json(check ? plans[index] : migrateKBSlugs(root)))
}
