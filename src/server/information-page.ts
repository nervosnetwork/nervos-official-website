import type { GetStaticProps } from 'next'
import { execFileSync } from 'node:child_process'
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
    const date = execFileSync(
      'git',
      ['log', '-1', '--format=%cI', '--', `src/components/InformationPages/${sourceFiles[kind]}`],
      { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(date)) return null
    return Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null
  } catch {
    // Untracked content or shallow source archives have no revision date.
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
