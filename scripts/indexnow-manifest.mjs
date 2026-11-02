import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import i18nConfig from '../next-i18next.config.js'
import { coreNamespaces } from '../config/site-indexing.mjs'
import { KB_HUBS } from '../config/kb-hubs.mjs'
import { loadSitemapEntries } from './generate-sitemap.mjs'

const ORIGIN = 'https://www.nervos.org'
const SHA256 = /^[a-f0-9]{64}$/
const REVISION = /^[a-f0-9]{40}$/
const ASSET = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp|apng|woff2?|ttf|otf|pdf|mp4|webm)(?:[?#].*)?$/i
const excluded = name => name.startsWith('.') || /(?:^|[.-])(?:test|spec|fixtures?)(?:[.-]|$)/i.test(name)

function stableJSON(value) {
  if (Array.isArray(value)) return `[${value.map(stableJSON).join(',')}]`
  if (value && typeof value === 'object') {
    assert.equal(Object.getPrototypeOf(value), Object.prototype, 'Expected a plain JSON object')
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableJSON(value[key])}`)
      .join(',')}}`
  }
  assert(value === null || ['string', 'boolean', 'number'].includes(typeof value), 'Expected JSON values')
  assert(typeof value !== 'number' || Number.isFinite(value), 'Expected a finite JSON number')
  return JSON.stringify(value)
}

/** Deterministic hash: object keys are sorted; array order remains meaningful. */
export const stableHash = value => crypto.createHash('sha256').update(stableJSON(value)).digest('hex')
const bytesHash = value => crypto.createHash('sha256').update(value).digest('hex')
const within = (root, filename) => filename === root || filename.startsWith(`${root}${path.sep}`)
const exists = filename => {
  try {
    fs.lstatSync(filename)
    return true
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

function safePath(root, filename) {
  const resolved = path.resolve(filename)
  assert(within(root, resolved), 'Dependency escapes its repository boundary')
  // Check every existing ancestor, including dangling/escaping symlinks. Merely
  // checking the final lexical path would permit reading outside the checkout.
  let current = root
  for (const component of path.relative(root, resolved).split(path.sep).filter(Boolean)) {
    current = path.join(current, component)
    if (exists(current))
      assert(within(root, fs.realpathSync(current)), 'Dependency symlink escapes its repository boundary')
  }
  return resolved
}

function filesBelow(root, directory) {
  const files = []
  if (!exists(directory)) return files
  safePath(root, directory)
  for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (excluded(item.name)) continue
    const relative = path.relative(root, path.join(directory, item.name)).split(path.sep).join('/')
    // Legacy build output embeds filesystem birthtimes and may be reformatted.
    // Hash its Markdown/parser inputs, not generated files or rendition folders.
    // The handwritten adapter remains an actual rendering dependency.
    if (relative.startsWith('src/database/articles/') && relative !== 'src/database/articles/index.ts') continue
    const filename = safePath(root, path.join(directory, item.name))
    // Do not recursively follow directory symlinks (cycles and duplicate trees).
    if (item.isDirectory()) files.push(...filesBelow(root, filename))
    else if (fs.statSync(filename).isFile()) files.push(filename)
  }
  return files
}

function validUrl(value) {
  assert.equal(typeof value, 'string', 'Manifest URL must be a string')
  assert(!/[\s\\#%]/u.test(value), 'Manifest URL must be canonical, unescaped and without fragments')
  const url = new URL(value)
  assert.equal(url.origin, ORIGIN, 'Unexpected manifest origin')
  assert(!url.username && !url.password && url.href === value, 'Manifest URL is not canonical')
  let route = url.pathname
  const locale = i18nConfig.i18n.locales.find(
    language => language !== 'en' && (route === `/${language}` || route.startsWith(`/${language}/`)),
  )
  if (locale) route = route.slice(locale.length + 1) || '/'
  assert(!url.pathname.endsWith('/') || url.pathname === '/', 'Canonical URLs have no trailing slash')
  const core = Object.hasOwn(coreNamespaces, route) && route !== '/home'
  const kbLanding =
    route === '/knowledge-base' ||
    route === '/knowledge-base/start-here' ||
    KB_HUBS.some(hub => route === `/knowledge-base/topic/${hub.id}`)
  const archive = route === '/knowledge-base/articles'
  const article =
    /^\/knowledge-base\/[A-Za-z0-9_-]+$/.test(route) &&
    !['search', 'topic', 'start-here'].includes(route.split('/').at(-1))
  assert(core || kbLanding || archive || article, 'Unexpected canonical route in manifest')
  assert(!(locale && kbLanding), 'KB landing pages are English only')
  assert(
    !url.search || (archive && /^\?page=(?:[2-9]|[1-9]\d+)$/.test(url.search)),
    'Unexpected canonical query parameters',
  )
  return url
}

export function validateManifest(manifest) {
  assert(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'Expected a manifest object')
  assert.deepEqual(
    Object.keys(manifest).sort(),
    ['schemaVersion', 'origin', 'revision', 'digest', 'entries'].sort(),
    'Unexpected manifest fields',
  )
  assert.equal(manifest.schemaVersion, 1, 'Unsupported manifest schema')
  assert.equal(manifest.origin, ORIGIN, 'Unexpected manifest origin')
  assert(REVISION.test(manifest.revision), 'Manifest revision must be a full lowercase Git SHA')
  assert(SHA256.test(manifest.digest), 'Invalid manifest digest')
  assert(
    Array.isArray(manifest.entries) && manifest.entries.length > 0 && manifest.entries.length <= 50_000,
    'Invalid manifest entries',
  )
  let previous = ''
  for (const entry of manifest.entries) {
    assert(entry && typeof entry === 'object', 'Invalid manifest entry')
    assert.deepEqual(Object.keys(entry).sort(), ['hash', 'url'], 'Unexpected manifest entry fields')
    validUrl(entry.url)
    assert(SHA256.test(entry.hash), 'Invalid entry hash')
    assert(entry.url > previous, 'Manifest URLs must be unique and sorted')
    previous = entry.url
  }
  const { digest, ...payload } = manifest
  assert.equal(stableHash(payload), digest, 'Manifest digest mismatch')
  return manifest
}

export function scopedEntries(manifest, scope = 'kb') {
  assert(['kb', 'site'].includes(scope), 'IndexNow scope must be kb or site')
  validateManifest(manifest)
  return manifest.entries.filter(
    entry =>
      scope === 'site' || /^(?:\/(?:zh|es|fr|tr|ko|pt))?\/knowledge-base(?:\/|$)/.test(new URL(entry.url).pathname),
  )
}

export function planIndexNow({ manifest, baseline = null, scope = 'kb' }) {
  const current = new Map(scopedEntries(manifest, scope).map(entry => [entry.url, entry.hash]))
  let old = new Map()
  if (baseline !== null) {
    assert(baseline && typeof baseline === 'object' && !Array.isArray(baseline), 'Invalid production baseline')
    assert.equal(baseline.schemaVersion, 1, 'Unsupported production baseline schema')
    assert.equal(baseline.scope, scope, 'Baseline scope does not match notification scope')
    assert(
      typeof baseline.deploymentId === 'string' && /^\d+$/.test(baseline.deploymentId),
      'Invalid baseline deployment ID',
    )
    assert(
      typeof baseline.notifiedAt === 'string' &&
        /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(baseline.notifiedAt) &&
        new Date(baseline.notifiedAt).toISOString() === baseline.notifiedAt,
      'Invalid baseline notification timestamp',
    )
    old = new Map(scopedEntries(baseline.manifest, scope).map(entry => [entry.url, entry.hash]))
  }
  const changes = { added: [], updated: [], deleted: [] }
  for (const [url, hash] of current) {
    if (!old.has(url)) changes.added.push(url)
    else if (old.get(url) !== hash) changes.updated.push(url)
  }
  for (const url of old.keys()) if (!current.has(url)) changes.deleted.push(url)
  const payload = {
    schemaVersion: 1,
    revision: manifest.revision,
    manifestDigest: manifest.digest,
    baselineDigest: baseline?.manifest.digest ?? null,
    scope,
    initial: baseline === null,
    changes,
    urls: [...new Set(Object.values(changes).flat())].sort(),
  }
  return { ...payload, digest: stableHash(payload) }
}

/**
 * Build a content-only snapshot, never a timestamp or Git-diff approximation.
 * Conservative dependency policy: shared source/config/styles/translations
 * invalidate every page; the published catalog (including body/asset hashes)
 * invalidates every KB consumer, including recommendations and paginated lists.
 * Only referenced public assets are read; public archives/PDF trees are not
 * scanned wholesale. Dynamic public image filename templates are expanded only
 * inside their explicit directory. Remote images are recorded, never fetched.
 */
export function createIndexNowManifest({ repository = process.cwd(), revision, now = Date.now() } = {}) {
  assert(REVISION.test(revision), 'Manifest revision must be a full lowercase Git SHA')
  assert(Number.isFinite(now), 'Invalid publication snapshot time')
  const root = fs.realpathSync(repository)
  const publicRoot = safePath(root, path.join(root, 'public'))
  const contentRoot = safePath(root, path.join(publicRoot, 'education_hub_articles'))
  const catalogFile = safePath(root, path.join(contentRoot, 'metadata/catalog.json'))
  const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'))
  safePath(root, path.join(contentRoot, 'metadata/slug-migrations.json'))
  for (const article of catalog.articles) {
    assert(
      typeof article.sourceFile === 'string' && /^[A-Za-z0-9_-]+\/index(?:[_-][a-z]{2})?\.md$/.test(article.sourceFile),
      'Invalid content source path',
    )
    safePath(contentRoot, path.join(contentRoot, article.sourceFile))
  }
  const sitemap = loadSitemapEntries(root, now)
  const cache = new Map()
  const fingerprintFile = filename => {
    const safe = safePath(root, filename)
    if (!cache.has(safe))
      cache.set(safe, exists(safe) && fs.statSync(safe).isFile() ? bytesHash(fs.readFileSync(safe)) : null)
    return [path.relative(root, safe).split(path.sep).join('/'), cache.get(safe)]
  }
  function assetFiles(text, sourceDirectory) {
    const result = new Set()
    const candidates = new Set()
    for (const match of text.matchAll(/["'`]((?:https:\/\/www\.nervos\.org)?\/[^\s"'`<>]+)["'`]/g)) {
      candidates.add(match[1])
    }
    for (const match of text.matchAll(
      /(?:https:\/\/www\.nervos\.org)?\/(?:images|assets|education_hub_articles)\/(?:\$\{[^}]*\}|[^\s'"`<>()[\]{}])+/g,
    ))
      candidates.add(match[0])
    for (const match of text.matchAll(
      /!?\[[^\]]*\]\(\s*<?([^\s)>]+)|\b(?:src|poster)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^\s)'"`]+)|["']((?:\.\.?\/)?images\/[^"']+)["']/gi,
    ))
      candidates.add(match[1] ?? match[2] ?? match[3] ?? match[4])
    for (const match of text.matchAll(/^\s{0,3}\[[^\]]+\]:\s*<?([^\s>]+)/gm)) candidates.add(match[1])
    for (const match of text.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi)) {
      for (const source of match[1].split(',')) candidates.add(source.trim().split(/\s+/)[0])
    }
    for (let candidate of candidates) {
      if (/^https:\/\/www\.nervos\.org\//.test(candidate)) candidate = new URL(candidate).pathname
      else if (/^(?:[a-z]+:|\/\/|#)/i.test(candidate)) continue
      candidate = candidate.replace(/[?#].*$/, '')
      if (!ASSET.test(candidate)) continue
      let decoded
      try {
        decoded = decodeURIComponent(candidate)
      } catch {
        throw new Error('Invalid escaped asset dependency')
      }
      assert(!decoded.includes('\\') && !decoded.includes('\0'), 'Invalid asset dependency')
      const filename = safePath(
        publicRoot,
        decoded.startsWith('/') ? path.join(publicRoot, decoded.slice(1)) : path.resolve(sourceDirectory, decoded),
      )
      if (filename.includes('${')) {
        // Only filename interpolation is supported; never traverse arbitrary
        // directories from an expression embedded in source code.
        const directory = path.dirname(filename)
        assert(!directory.includes('${'), 'Dynamic asset directories are unsupported')
        if (exists(directory)) {
          const pattern = new RegExp(
            `^${path
              .basename(filename)
              .split(/\$\{[^}]*\}/)
              .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
              .join('[^/]*')}$`,
          )
          for (const item of fs.readdirSync(directory))
            if (pattern.test(item)) result.add(safePath(publicRoot, path.join(directory, item)))
        }
      } else result.add(filename)
    }
    return [...result].sort().map(fingerprintFile)
  }

  const sharedFiles = [
    ...filesBelow(root, path.join(root, 'src')),
    ...filesBelow(root, path.join(root, 'config')).filter(filename => !path.basename(filename).startsWith('indexnow')),
    ...filesBelow(root, path.join(publicRoot, 'locales')),
    ...filesBelow(root, path.join(root, 'scripts/generate-articles')),
    ...['scripts/generate-articles.mjs', 'scripts/generate-sitemap.mjs']
      .map(filename => path.join(root, filename))
      .filter(exists),
    ...['next.config.mjs', 'next-i18next.config.js'].map(filename => path.join(root, filename)).filter(exists),
  ].sort()
  const sharedAssets = new Map()
  for (const filename of sharedFiles) {
    if (!/\.(?:tsx?|jsx?|mjs|cjs|json|s?css|svg|html)$/.test(filename)) continue
    for (const pair of assetFiles(fs.readFileSync(filename, 'utf8'), publicRoot)) sharedAssets.set(pair[0], pair[1])
  }
  const shared = stableHash({
    files: sharedFiles.map(fingerprintFile),
    assets: [...sharedAssets].sort(([a], [b]) => a.localeCompare(b)),
  })
  const publishedPaths = new Set(sitemap.map(entry => new URL(entry.loc).pathname))
  const articleHashes = new Map()
  for (const article of catalog.articles.filter(article => publishedPaths.has(article.canonicalPath))) {
    const filename = path.join(contentRoot, article.sourceFile)
    const text = fs.readFileSync(filename, 'utf8')
    const publicValues = JSON.stringify(article)
    articleHashes.set(
      article.canonicalPath,
      stableHash({
        article,
        source: fingerprintFile(filename),
        assets: assetFiles(`${text}\n${publicValues}`, path.dirname(filename)),
      }),
    )
  }
  // Deliberately omit catalog.sourceCommit and all audit-only metadata files.
  const catalogHash = stableHash({
    hubs: catalog.hubs ?? [],
    subjects: catalog.subjects ?? [],
    featured: catalog.featured ?? [],
    articles: [...articleHashes].sort(([a], [b]) => a.localeCompare(b)),
  })
  const entries = sitemap
    .map(entry => {
      const pathname = new URL(entry.loc).pathname
      return {
        url: entry.loc,
        hash: stableHash({
          shared,
          sitemap: entry,
          ...(pathname.includes('/knowledge-base')
            ? { catalog: catalogHash, article: articleHashes.get(pathname) ?? null }
            : {}),
        }),
      }
    })
    .sort((a, b) => (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
  const payload = { schemaVersion: 1, origin: ORIGIN, revision, entries }
  return validateManifest({ ...payload, digest: stableHash(payload) })
}

export function main(args = process.argv.slice(2)) {
  const options = {}
  for (let index = 0; index < args.length; index++) {
    const option = args[index]
    assert(
      ['--repository', '--revision'].includes(option) && !Object.hasOwn(options, option),
      `Unknown or duplicate option: ${option}`,
    )
    const value = args[++index]
    assert(value && !value.startsWith('--'), `${option} requires a value`)
    options[option] = value
  }
  const repository = path.resolve(options['--repository'] ?? process.cwd())
  const revision =
    options['--revision'] ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim()
  const manifest = createIndexNowManifest({ repository, revision })
  const marker = { schemaVersion: 1, revision: manifest.revision, manifestDigest: manifest.digest }
  for (const [name, data] of [
    ['indexnow-manifest.json', manifest],
    ['indexnow-release.json', marker],
  ]) {
    const destination = path.join(repository, 'public', name)
    const temporary = `${destination}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`
    try {
      fs.writeFileSync(temporary, `${JSON.stringify(data)}\n`, { flag: 'wx' })
      fs.renameSync(temporary, destination)
    } finally {
      if (exists(temporary)) fs.unlinkSync(temporary)
    }
  }
  process.stdout.write(
    `Generated IndexNow snapshot: ${manifest.entries.length} canonical URLs, revision ${revision}. No notification sent.\n`,
  )
  return manifest
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`IndexNow snapshot failed: ${error.message}\n`)
    process.exitCode = 1
  }
}
