import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import matter from 'gray-matter'
import imageSize from 'image-size'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import i18nConfig from '../next-i18next.config.js'

const repository = fileURLToPath(new URL('../', import.meta.url))
const baselinePath = path.join(repository, 'config/kb-legacy-source-baseline.json')
const hash = value => crypto.createHash('sha256').update(value).digest('hex')
const fields = new Set([
  'title',
  'subtitle',
  'description',
  'date',
  'author',
  'coverImage',
  'draft',
  'published',
  'bodyImages',
])
const indexName = /^index(?:[_-]([a-z]{2}))?\.md$/
const possibleIndex = /^index.*\.md$/i
const slug = /^[a-z0-9]+(?:_[a-z0-9]+)*$/
const yamlHeader = /^\uFEFF?---[^\S\r\n]*\r?\n/
const imageParser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize)

function safeSourceMatter(raw) {
  assert(yamlHeader.test(raw), 'Only standard YAML frontmatter is allowed; executable/custom engines are forbidden')
  return matter(raw)
}

function bodyImageSources(raw) {
  const tree = imageParser.runSync(imageParser.parse(safeSourceMatter(raw).content))
  const sources = []
  function visit(node) {
    if (node.type === 'element' && node.tagName === 'img') sources.push(String(node.properties?.src ?? ''))
    for (const child of node.children ?? []) visit(child)
  }
  visit(tree)
  return sources
}

function dateToken(raw) {
  // gray-matter's cached return omits its non-enumerable `matter` property.
  // Inspect the original YAML block so implicit Date conversion cannot erase
  // evidence of a missing timezone, even when the same source was parsed before.
  const frontmatter = /^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw)?.[1] ?? ''
  return /^date\s*:\s*(.*)$/m.exec(frontmatter)?.[1]?.trim() ?? ''
}

// The immutable website-owned baseline grants exceptions to one exact source
// field, never to a slug, article body, or a newly supplied catalog hash.
export function sourceFieldHash(data, field, raw) {
  if (field === 'bodyImages') return hash(JSON.stringify(bodyImageSources(raw)))
  const present = Object.hasOwn(data, field)
  const value = data[field]
  return hash(
    JSON.stringify({
      present,
      ...(present
        ? {
            value:
              value instanceof Date ? (Number.isFinite(value.getTime()) ? value.toISOString() : 'Invalid Date') : value,
          }
        : {}),
      ...(field === 'date' && value instanceof Date ? { token: dateToken(raw) } : {}),
    }),
  )
}

function validDate(data, raw) {
  const value =
    data.date instanceof Date
      ? dateToken(raw)
          .replace(/\s+#.*$/, '')
          .replace(/^(['"])(.*)\1$/, '$2')
      : data.date
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value)
  if (!match || !Number.isFinite(Date.parse(value))) return false
  const [, year, month, day, hour, minute, second, zone] = match
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate()
  return (
    Number(month) >= 1 &&
    Number(month) <= 12 &&
    Number(day) >= 1 &&
    Number(day) <= days &&
    Number(hour) <= 23 &&
    Number(minute) <= 59 &&
    Number(second) <= 59 &&
    (zone === 'Z' || (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4, 6)) <= 59))
  )
}

function validAuthor(author) {
  const authors = Array.isArray(author) ? author : [author]
  return (
    authors.length > 0 &&
    authors.every(value => {
      if (typeof value === 'string') return !!value.trim() && value.trim() !== 'github:'
      return (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        ['name', 'github'].every(
          field => !Object.hasOwn(value, field) || (typeof value[field] === 'string' && !!value[field].trim()),
        ) &&
        [value.name, value.github].some(item => typeof item === 'string' && !!item.trim())
      )
    })
  )
}

function validCover(directory, cover) {
  if (typeof cover !== 'string' || !cover.trim() || path.isAbsolute(cover) || /[\\?#\u0000-\u001f]/.test(cover))
    return false
  const filename = path.resolve(directory, cover)
  if (!filename.startsWith(directory + path.sep) || !fs.existsSync(filename)) return false
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink()) return false
  if (!fs.realpathSync(filename).startsWith(fs.realpathSync(directory) + path.sep)) return false
  return validImageFile(filename)
}

function validImageFile(filename) {
  try {
    const { width, height } = imageSize(fs.readFileSync(filename))
    return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
  } catch {
    return false
  }
}

function imageProblem(reference, directory, contentRoot) {
  if (/^(?:https?:)?\/\//i.test(reference)) {
    let url
    try {
      url = new URL(reference.startsWith('//') ? `https:${reference}` : reference)
    } catch {
      return 'external image URL is malformed'
    }
    if (url.username || url.password || !url.hostname) return 'external image URL must not contain credentials'
    if (!['www.nervos.org', 'nervos.org'].includes(url.hostname)) return null
    reference = url.pathname
  }
  if (!reference || /^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.includes('\\'))
    return `unsupported image source ${JSON.stringify(reference)}`
  let decoded
  try {
    decoded = decodeURIComponent(reference.split(/[?#]/)[0])
  } catch {
    return `malformed image URL ${JSON.stringify(reference)}`
  }
  if (/[\u0000-\u001f]/.test(decoded)) return 'image URL contains control characters'
  const prefix = '/education_hub_articles/'
  const allowedRoot =
    decoded.startsWith('/') && !decoded.startsWith(prefix) ? path.join(repository, 'public') : contentRoot
  const filename = decoded.startsWith(prefix)
    ? path.resolve(contentRoot, decoded.slice(prefix.length))
    : decoded.startsWith('/')
      ? path.resolve(allowedRoot, `.${decoded}`)
      : path.resolve(directory, decoded)
  if (!filename.startsWith(allowedRoot + path.sep))
    return `image escapes the public content root: ${JSON.stringify(reference)}`
  if (!fs.existsSync(filename)) return `missing image ${JSON.stringify(reference)}`
  if (
    fs.lstatSync(filename).isSymbolicLink() ||
    !fs.lstatSync(filename).isFile() ||
    !fs.realpathSync(filename).startsWith(fs.realpathSync(allowedRoot) + path.sep)
  )
    return `unsafe image ${JSON.stringify(reference)}`
  return validImageFile(filename) ? null : `invalid image bytes ${JSON.stringify(reference)}`
}

export function sourceFieldProblems(data, raw, directory, contentRoot = path.dirname(directory)) {
  const problems = []
  if (typeof data.title !== 'string' || !data.title.trim()) problems.push(['title', 'a nonempty title is required'])
  for (const field of ['subtitle', 'description'])
    if (Object.hasOwn(data, field) && typeof data[field] !== 'string')
      problems.push([field, `${field} must be a string when supplied`])
  if (!validDate(data, raw))
    problems.push(['date', 'date must be a real ISO timestamp with seconds and Z or an explicit timezone'])
  if (!validAuthor(data.author)) problems.push(['author', 'author must contain a nonempty name or github identity'])
  if (!validCover(directory, data.coverImage))
    problems.push(['coverImage', 'coverImage must reference an existing regular file inside this article directory'])
  for (const field of ['draft', 'published'])
    if (Object.hasOwn(data, field) && typeof data[field] !== 'boolean')
      problems.push([field, `${field} must be a YAML boolean, not a quoted string`])
  const imageProblems = bodyImageSources(raw)
    .map(source => imageProblem(source, directory, contentRoot))
    .filter(Boolean)
  if (imageProblems.length) problems.push(['bodyImages', imageProblems.join('; ')])
  return problems
}

export function validateKBSources(root, { baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8')) } = {}) {
  root = path.resolve(root)
  assert(
    fs.lstatSync(root).isDirectory() && !fs.lstatSync(root).isSymbolicLink(),
    'Content root must be a real directory',
  )
  assert.equal(baseline.schemaVersion, 1, 'Unsupported legacy source baseline')
  assert(/^[a-f0-9]{40}$/.test(baseline.sourceCommit), 'Legacy baseline requires a reviewed source commit')
  const exceptions = new Map()
  for (const entry of baseline.issues) {
    const key = `${entry.sourceFile}:${entry.field}`
    assert(
      indexName.test(entry.sourceFile.split('/')[1] ?? '') && fields.has(entry.field),
      'Invalid legacy field exception',
    )
    assert(
      /^[a-f0-9]{64}$/.test(entry.valueSHA256) && /^[a-f0-9]{64}$/.test(entry.sourceSHA256),
      'Invalid legacy evidence hash',
    )
    assert(!exceptions.has(key), 'Duplicate legacy exception')
    exceptions.set(key, entry)
  }
  const errors = []
  const legacyIssues = []
  const sources = []
  for (const entry of fs
    .readdirSync(root, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (entry.name === '.git') continue
    if (entry.isSymbolicLink()) {
      errors.push(`${entry.name}: source symlinks are not allowed`)
      continue
    }
    if (!entry.isDirectory()) continue
    const directory = path.join(root, entry.name)
    const indexes = fs
      .readdirSync(directory, { withFileTypes: true })
      .filter(file => possibleIndex.test(file.name))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    if (!indexes.length) continue
    if (!slug.test(entry.name))
      errors.push(`${entry.name}: article folder must use lowercase ASCII words/numbers and single underscores`)
    if (!indexes.some(file => file.name === 'index.md' && file.isFile()))
      errors.push(`${entry.name}: an English index.md is required; translation-only folders cannot be silently skipped`)
    const languages = new Set()
    for (const file of indexes) {
      const sourceFile = `${entry.name}/${file.name}`
      const match = indexName.exec(file.name)
      if (!match || match[1] === 'en') {
        errors.push(
          `${sourceFile}: use index.md or index_<supported-locale>.md (not an English alias or mixed-case filename)`,
        )
        continue
      }
      const language = match[1] ?? 'en'
      if (!i18nConfig.i18n.locales.includes(language))
        errors.push(`${sourceFile}: unsupported translation language ${language}`)
      if (languages.has(language))
        errors.push(`${sourceFile}: duplicate ${language} rendition (underscore/hyphen aliases share a route)`)
      languages.add(language)
      if (!file.isFile() || file.isSymbolicLink()) {
        errors.push(`${sourceFile}: article index must be a regular file, not a directory or symlink`)
        continue
      }
      const raw = fs.readFileSync(path.join(directory, file.name), 'utf8')
      // gray-matter also supports executable JavaScript engines. This must be
      // checked before its first parse, especially on untrusted article PRs.
      if (!yamlHeader.test(raw)) {
        errors.push(`${sourceFile}: only standard YAML frontmatter is allowed; executable/custom engines are forbidden`)
        continue
      }
      let data
      try {
        data = safeSourceMatter(raw).data
      } catch (error) {
        errors.push(`${sourceFile}: invalid YAML frontmatter (${error.message.split('\n')[0]})`)
        continue
      }
      for (const [field, reason] of sourceFieldProblems(data, raw, directory)) {
        const exception = exceptions.get(`${sourceFile}:${field}`)
        if (exception?.valueSHA256 === sourceFieldHash(data, field, raw)) legacyIssues.push({ sourceFile, field })
        else errors.push(`${sourceFile}: ${reason}`)
      }
      sources.push({ sourceFile, language, sourceSHA256: hash(raw) })
    }
  }
  if (!sources.length) errors.push('No article sources found; verify the content checkout')
  assert.equal(errors.length, 0, `KB source validation failed:\n${errors.map(error => `  ${error}`).join('\n')}`)
  return { sources, legacyIssues }
}

let entrypoint
try {
  if (process.argv[1]) entrypoint = pathToFileURL(fs.realpathSync(process.argv[1])).href
} catch {
  // Importers need not expose a filesystem CLI entrypoint.
}
if (import.meta.url === entrypoint) {
  try {
    const args = process.argv.slice(2)
    assert(args.length <= 1 && !args[0]?.startsWith('-'), 'Usage: node scripts/validate-kb-sources.mjs [content-root]')
    const result = validateKBSources(args[0] ?? path.join(repository, 'public/education_hub_articles'))
    console.log(
      `KB source validation passed: ${result.sources.length} renditions; ${result.legacyIssues.length} unchanged reviewed legacy fields. No files changed.`,
    )
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
