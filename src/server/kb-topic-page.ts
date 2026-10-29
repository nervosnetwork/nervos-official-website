import type { GetServerSideProps } from 'next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { byDate } from '../components/KnowledgeHub/content'
import { kbHubPath, resolveKBHub } from '../utils/kb-hubs'
import { getKBCatalog } from './kb-content'

function redirectDestination(pathname: string, resolvedUrl: string, removeHub = false) {
  const queryStart = resolvedUrl.indexOf('?')
  const destination = new URL(pathname, 'https://www.nervos.org')
  destination.search = queryStart < 0 ? '' : resolvedUrl.slice(queryStart)
  if (removeHub && destination.searchParams.has('hub')) destination.searchParams.delete('hub')
  return destination.pathname + destination.search
}

// Middleware normally owns these redirects. Keep the server page safe when
// invoked directly (including client data navigation and isolated rendering).
export const legacyTopicPageProps: GetServerSideProps = ({ query, resolvedUrl }) => {
  const target = query.hub === undefined ? '/knowledge-base' : kbHubPath(query.hub)
  if (!target) return Promise.resolve({ notFound: true })
  return Promise.resolve({ redirect: { destination: redirectDestination(target, resolvedUrl, true), permanent: true } })
}

export const topicPageProps: GetServerSideProps = async ({ params, locale, query, resolvedUrl }) => {
  const hub = resolveKBHub(params?.hub)
  // Display-name aliases are supported only by the retired query route.
  if (!hub || hub.id !== params?.hub) return { notFound: true }
  if (locale && locale !== 'en') {
    return {
      redirect: { destination: redirectDestination(kbHubPath(hub.id), resolvedUrl), permanent: true },
    }
  }
  const catalog = getKBCatalog('en')
  catalog.articles = catalog.articles.filter(article => article.hub === hub.id).sort(byDate)
  return {
    props: {
      catalog,
      hubId: hub.id,
      subjectId: typeof query.subject === 'string' ? query.subject : '',
      ...(await serverSideTranslations('en', ['common'])),
    },
  }
}
