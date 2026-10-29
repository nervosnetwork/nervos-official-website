import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import i18nConfig from '../next-i18next.config.js'
import { coreLanguages, coreNamespaces } from '../config/site-indexing.mjs'
import { KB_HUBS } from '../config/kb-hubs.mjs'

const origin = 'https://www.nervos.org'
const locales = i18nConfig.i18n.locales
const absolute = pathname => new URL(pathname, origin).href
const localized = (route, language) =>
  `${language === 'en' ? '' : `/${language}`}${route === '/' && language !== 'en' ? '' : route}`
const alternateSet = (route, languages) => [
  ...languages.map(language => ({ language, url: absolute(localized(route, language)) })),
  ...(languages.includes('en') ? [{ language: 'x-default', url: absolute(route) }] : []),
]

// This is a build snapshot, not a clock-based live feed: scheduled articles
// enter the sitemap on their next publishing build, together with their pages.
export function createSitemapEntries({ articles, corePages, now = Date.now() }) {
  const entries = []
  for (const { route, languages } of corePages) {
    if (route === '/home') continue
    for (const language of languages) {
      entries.push({ loc: absolute(localized(route, language)), alternates: alternateSet(route, languages) })
    }
  }
  for (const route of [
    '/knowledge-base',
    '/knowledge-base/start-here',
    ...KB_HUBS.map(hub => `/knowledge-base/topic/${hub.id}`),
  ]) {
    entries.push({ loc: absolute(route), alternates: alternateSet(route, ['en']) })
  }
  const published = articles.filter(
    article =>
      locales.includes(article.language) && !article.draft && (!article.date || Date.parse(article.date) <= now),
  )
  for (const language of locales) {
    const count = published.filter(article => article.language === language).length
    // Match libraryProps: 24 articles per page; no locale-only empty archives.
    for (let page = 1; page <= Math.max(language === 'en' ? 1 : 0, Math.ceil(count / 24)); page++) {
      const route = `/knowledge-base/articles${page > 1 ? `?page=${page}` : ''}`
      entries.push({ loc: absolute(localized(route, language)), alternates: [] })
    }
  }
  for (const article of published) {
    const route = `/knowledge-base/${article.id}`
    assert.equal(article.canonicalPath, localized(route, article.language), `Non-canonical article path: ${article.id}`)
    const languages = locales.filter(language =>
      published.some(other => other.id === article.id && other.language === language),
    )
    entries.push({
      loc: absolute(article.canonicalPath),
      // The approved D-03 input is the normalized front-matter date. Do not
      // manufacture a lastmod for undated content or use the deployment clock.
      ...(article.date ? { lastmod: new Date(article.date).toISOString() } : {}),
      alternates: alternateSet(route, languages),
    })
  }
  assert.equal(new Set(entries.map(entry => entry.loc)).size, entries.length, 'Duplicate sitemap URL')
  return entries
}

export function loadSitemapEntries(repository = process.cwd(), now = Date.now()) {
  const root = path.join(repository, 'public/education_hub_articles')
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'metadata/catalog.json'), 'utf8'))
  const migrations = JSON.parse(fs.readFileSync(path.join(root, 'metadata/slug-migrations.json'), 'utf8'))
  const oldIDs = new Set(migrations.renames.map(rename => rename.from))
  const sources = new Set()
  for (const directory of fs.readdirSync(root, { withFileTypes: true })) {
    if (!directory.isDirectory() || !fs.existsSync(path.join(root, directory.name, 'index.md'))) continue
    for (const file of fs.readdirSync(path.join(root, directory.name))) {
      if (/^index(?:[_-][a-z]{2})?\.md$/.test(file)) sources.add(`${directory.name}/${file}`)
    }
  }
  assert.deepEqual(
    new Set(catalog.articles.map(article => article.sourceFile)),
    sources,
    'KB catalog is stale: regenerate and review it before building the sitemap',
  )
  for (const article of catalog.articles) {
    const filename = path.resolve(root, article.sourceFile)
    assert(filename.startsWith(`${root}${path.sep}`), 'Invalid content path')
    const raw = fs.readFileSync(filename)
    assert.equal(
      crypto.createHash('sha256').update(raw).digest('hex'),
      article.sourceSHA256,
      `KB metadata is stale: ${article.sourceFile}`,
    )
    assert.equal(article.id, article.sourceFile.split('/')[0], `Invalid source identity: ${article.sourceFile}`)
    assert(!oldIDs.has(article.id), `Redirect source still in catalog: ${article.id}`)
    assert(!article.date || Number.isFinite(Date.parse(article.date)), `Invalid article date: ${article.sourceFile}`)
  }
  const corePages = Object.entries(coreNamespaces).map(([route, namespace]) => ({
    route,
    languages: coreLanguages(namespace, repository),
  }))
  return createSitemapEntries({ articles: catalog.articles, corePages, now })
}

export const escapeXml = value =>
  String(value).replace(
    /[&<>"']/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character],
  )

export function renderSitemap(entries) {
  assert(entries.length <= 50_000, 'Sitemap needs to be split before exceeding 50,000 URLs')
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries.map(entry =>
      [
        '  <url>',
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        ...(entry.lastmod ? [`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`] : []),
        ...entry.alternates.map(
          alternate =>
            `    <xhtml:link rel="alternate" hreflang="${escapeXml(alternate.language)}" href="${escapeXml(alternate.url)}"/>`,
        ),
        '  </url>',
      ].join('\n'),
    ),
    '</urlset>',
    '',
  ].join('\n')
  assert(Buffer.byteLength(xml) <= 50 * 1024 * 1024, 'Sitemap needs to be split before exceeding 50 MB')
  return xml
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const entries = loadSitemapEntries()
  // Validate the entire snapshot before replacing the previous generated file.
  fs.writeFileSync('public/sitemap.xml', renderSitemap(entries), 'utf8')
  console.log(`Generated sitemap.xml: ${entries.length} canonical URLs (published content and actual translations).`)
}
