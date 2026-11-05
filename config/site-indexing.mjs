import fs from 'node:fs'
import path from 'node:path'
import i18nConfig from '../next-i18next.config.js'

// Shared by HTML metadata and the build-time sitemap. A translated navigation
// alone must not turn an English page into a separate language canonical.
/** @type {Record<string, string>} */
export const coreNamespaces = {
  '/': 'home',
  '/home': 'home',
  '/ckbpage': 'ckbpage',
  '/mining': 'mining',
  '/wallets': 'wallets',
  '/journey': 'journey',
  '/developers': 'developers',
  '/community': 'community',
  '/learn': 'learn',
  '/media-kit': 'media-kit',
  '/foundation': 'foundation',
}

/** @param {unknown} value @returns {string[]} */
function textValues(value) {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (!value || typeof value !== 'object') return []
  return Object.values(value).flatMap(textValues)
}

/** @param {string} namespace @param {string} repository */
export function coreLanguages(namespace, repository = process.cwd()) {
  return i18nConfig.i18n.locales.filter(language => {
    const filename = path.join(repository, 'public/locales', language, `${namespace}.json`)
    return fs.existsSync(filename) && textValues(JSON.parse(fs.readFileSync(filename, 'utf8'))).length > 0
  })
}
