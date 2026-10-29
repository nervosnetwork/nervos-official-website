import { readFileSync } from 'node:fs'

// D-01 historical aliases from hand-off tab 05. The D-18 manifest resolves
// their targets to the final article IDs without introducing redirect chains.
const aliases = [
  { from: 'secp256k1_a_key algorithm', to: 'secp256k1_a_key_algorithm', bare: true, suffix: true },
  { from: 'what_are_optimistic_rollups', to: 'what_are_optimistic_rollups_everything_you_need_to_know', bare: true },
  { from: 'What_are_optimistic_rollups', to: 'what_are_optimistic_rollups_everything_you_need_to_know', suffix: true },
  { from: 'account_abstraction_where_were_going', to: 'account_abstraction_where_we_are_going', bare: true },
  {
    from: 'becoming-money-stablecoins-on-lightning-the-next-step-in-bitcoins-journey',
    to: 'becoming_money_stablecoins_on_lightning_the_next_step_in_bitcoins_journey',
    bare: true,
  },
]

const suffix = '_:legacy(\\(explainCKBot\\)|%28explainCKBot%29)'
const published = (article, now) => !article.draft && (!article.date || Date.parse(article.date) <= now)
const literal = value => value.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&').replace(/ /g, '(?:%20| )')

/** Build permanent redirects without changing any live article's canonical URL. */
export function kbLegacyRedirects({ articles, locales, defaultLocale = 'en', now = Date.now(), renames = [] }) {
  const migrations = new Map(renames.map(({ from, to }) => [from, to]))
  const byId = new Map()
  for (const article of articles) {
    if (!byId.has(article.id)) byId.set(article.id, new Map())
    byId.get(article.id).set(article.language, article)
  }

  const rules = []
  function add(from, to, withSuffix) {
    const target = migrations.get(to) ?? to
    const versions = byId.get(target)
    if (!versions) throw new Error(`Missing D-01 redirect target: ${target}`)
    const destinations = new Map()
    for (const locale of locales) {
      // An existing draft/scheduled translation must remain unavailable. Only
      // a genuinely missing translation can fall back to the English article.
      const article = versions.get(locale) ?? versions.get(defaultLocale)
      if (!article || !published(article, now)) continue
      const destination = encodeURI(article.canonicalPath)
      if (!destinations.has(destination)) destinations.set(destination, [])
      destinations.get(destination).push(locale)
    }
    for (const [destination, languages] of destinations) {
      rules.push({
        // Next's i18n router internally prefixes an unprefixed request with
        // /en. Explicit locale:false rules include it but never emit it.
        source: `/:locale(${languages.map(literal).join('|')})/knowledge-base/:oldSlug(${literal(from)})${withSuffix ? suffix : ''}`,
        destination,
        permanent: true,
        locale: false,
      })
    }
  }

  // Specific historical changes take precedence over the suffix-only fallback.
  for (const alias of aliases) {
    if (alias.bare) {
      if (byId.has(alias.from)) throw new Error(`D-01 must not redirect a current article: ${alias.from}`)
      add(alias.from, alias.to, false)
    }
    if (alias.suffix) add(alias.from, alias.to, true)
  }

  // Only suffix-bearing old slugs belong in Next's case-insensitive config.
  // Bare D-18 old slugs are matched exactly by the article page loader.
  for (const { from, to } of renames) {
    if (byId.has(from)) throw new Error(`D-18 source article has not been migrated: ${from}`)
    add(from, to, true)
  }

  // Group locales with the same final destination to avoid thousands of rules.
  // Newly uploaded translations automatically use their real canonical URL on
  // the next build after the catalog has been refreshed.
  for (const id of byId.keys()) add(id, id, true)

  // Preserve the documented unknown-slug behaviour: strip a complete legacy
  // suffix, then let the article route return a real 404. Never redirect to the
  // KB homepage or guess an article for malformed/unknown slugs.
  for (const locale of locales) {
    rules.push({
      source: `/${literal(locale)}/knowledge-base/:oldSlug([A-Za-z0-9_-]+)${suffix}`,
      destination: `${locale === defaultLocale ? '' : `/${locale}`}/knowledge-base/:oldSlug`,
      permanent: true,
      locale: false,
    })
  }
  return rules
}

export function currentKBLegacyRedirects(i18n) {
  const catalog = JSON.parse(
    readFileSync(new URL('../public/education_hub_articles/metadata/catalog.json', import.meta.url), 'utf8'),
  )
  const migrations = JSON.parse(
    readFileSync(new URL('../public/education_hub_articles/metadata/slug-migrations.json', import.meta.url), 'utf8'),
  )
  return kbLegacyRedirects({ articles: catalog.articles, renames: migrations.renames, ...i18n })
}
