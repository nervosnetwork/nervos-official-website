import type { GetStaticProps } from 'next'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { informationPages } from '../../config/information-pages.mjs'
import { withStaticPageSEO } from './page-seo'

const sourceFiles = {
  about: 'AboutContent.tsx',
  privacy: 'PrivacyContent.tsx',
  contact: 'ContactContent.tsx',
}

export function informationPageUpdatedAt(kind: keyof typeof informationPages): string | null {
  try {
    const revision = execFileSync(
      'git',
      ['log', '-1', '--format=%H %cI', '--', `src/components/InformationPages/${sourceFiles[kind]}`],
      { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    const match = /^([a-f0-9]{40}) (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2}))$/.exec(revision)
    if (!match) return null
    const [, commit, date] = match
    if (!commit || !date) return null
    const shallowPath = execFileSync('git', ['rev-parse', '--git-path', 'shallow'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (!shallowPath) return null
    try {
      // Git treats shallow boundaries as roots, so `log -- file` can report a
      // boundary's date even when that commit did not actually change the file.
      const boundaries = readFileSync(resolve(process.cwd(), shallowPath), 'utf8').trim().split(/\s+/)
      if (boundaries.includes(commit)) return null
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') return null
    }
    return Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null
  } catch {
    // Untracked content and unavailable or incomplete Git history have no date.
    return null
  }
}

// Next prerenders static routes for every configured locale. These props stay
// English; middleware redirects non-English HTML and client-navigation aliases.
export function informationPageProps(kind: keyof typeof informationPages): GetStaticProps {
  const { path } = informationPages[kind]
  return withStaticPageSEO(path, async () => {
    return {
      props: {
        ...(await serverSideTranslations('en', ['common'])),
        updatedAt: informationPageUpdatedAt(kind),
      },
    }
  })
}
