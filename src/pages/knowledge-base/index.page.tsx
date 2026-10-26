import type { GetStaticProps } from 'next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { KnowledgeHubHome } from '../../components/KnowledgeHub/Home'
import { getKBCatalog } from '../../server/kb-content'
import { getKBMostRead } from '../../server/kb-most-read'
import { featuredArticles } from '../../components/KnowledgeHub/content'

export default KnowledgeHubHome

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  const catalog = getKBCatalog(locale)
  // Select from the full catalog before trimming the Hub cards' payload.
  const mostRead = getKBMostRead(catalog)
  const counts = Object.fromEntries(catalog.hubs.map(h => [h.id, catalog.articles.filter(a => a.hub === h.id).length]))
  catalog.articles = [
    ...new Map(catalog.hubs.flatMap(h => featuredArticles(catalog, h.id)).map(a => [a.id, a])).values(),
  ]
  return { props: { catalog, counts, mostRead, ...(await serverSideTranslations(locale ?? 'en', ['common'])) } }
}
