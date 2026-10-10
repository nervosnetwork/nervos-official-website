import type { GetServerSideProps } from 'next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { getKBCatalog } from './kb-content'
import { byDate, searchArticles } from '../components/KnowledgeHub/content'
import type { LibraryProps } from '../components/KnowledgeHub/Library'

export const libraryProps =
  (mode: LibraryProps['mode']): GetServerSideProps =>
  async ({ locale, query }) => {
    const catalog = getKBCatalog(locale, mode === 'search')
    const q = typeof query.q === 'string' ? query.q.slice(0, 200) : ''
    const requested = typeof query.hub === 'string' ? query.hub : 'blockchain-scalability'
    const hub = catalog.hubs.find(h => h.id === requested || h.name === requested)
    if (mode === 'topic' && !hub) return { notFound: true }
    const articles =
      mode === 'search'
        ? searchArticles(q, catalog)
        : catalog.articles.filter(a => mode !== 'topic' || a.hub === hub?.id).sort(byDate)
    const page = query.page === undefined ? 1 : Number(query.page)
    if (!Number.isInteger(page) || page < 1 || (page > 1 && (page - 1) * 24 >= articles.length))
      return { notFound: true }
    const selected = mode === 'topic' ? articles : articles.slice((page - 1) * 24, page * 24)
    catalog.articles = selected.map(a => {
      const copy = { ...a }
      delete copy.text
      return copy
    })
    return {
      props: {
        catalog,
        mode,
        hubId: hub?.id ?? '',
        subjectId: typeof query.subject === 'string' ? query.subject : '',
        query: q,
        page,
        total: articles.length,
        ...(await serverSideTranslations(locale ?? 'en', ['common'])),
      },
    }
  }
