import type { GetStaticPaths, GetStaticProps } from 'next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { remark } from 'remark'
import { byDate, relatedArticles } from '../components/KnowledgeHub/content'
import { headingTree } from '../components/KnowledgeHub/markdown-headings'
import { getKBArticle, getKBArticleStatus, getKBCatalog } from './kb-content'

type ArticleRoute = 'canonical' | 'preview'

export const articleStaticPaths =
  (route: ArticleRoute): GetStaticPaths =>
  ({ locales }) => {
    return {
      paths: (locales ?? ['en']).flatMap(locale =>
        getKBCatalog(locale).articles.map(article => ({
          params: { slug: article.id },
          locale,
        })),
      ),
      // Untranslated public URLs still need to reach getStaticProps so that
      // they redirect to English instead of generating duplicate English pages.
      fallback: route === 'canonical' ? 'blocking' : false,
    }
  }

export const articleStaticProps =
  (route: ArticleRoute): GetStaticProps =>
  async ({ params, locale }) => {
    const id = typeof params?.slug === 'string' ? params.slug : ''
    if (!id) return { notFound: true }
    const language = locale ?? 'en'
    const catalog = getKBCatalog(language)
    const article = catalog.articles.find(item => item.id === id)
    if (!article && route === 'canonical' && language !== 'en') {
      // A draft or scheduled translation is not a missing translation and
      // must remain unavailable until it is published.
      if (getKBArticleStatus(id, language) === 'unpublished') return { notFound: true }
      const englishArticle = getKBCatalog('en').articles.find(item => item.id === id)
      if (englishArticle) {
        // Next applies getStaticProps redirects without adding the requested
        // locale. Preserve the source path, including case and underscores.
        return { redirect: { destination: encodeURI(englishArticle.canonicalPath), permanent: true } }
      }
    }
    if (!article) return { notFound: true }
    const markdown = getKBArticle(id, article.language)
    if (markdown === null) return { notFound: true }
    return {
      props: {
        article,
        markdown,
        preview: route === 'preview',
        headings: headingTree(remark().parse(markdown)),
        related: relatedArticles(article, catalog),
        recent: catalog.articles
          .filter(item => item.id !== id)
          .sort(byDate)
          .slice(0, 3),
        hub: catalog.hubs.find(hub => hub.id === article.hub) ?? null,
        subjects: catalog.subjects.filter(subject => article.subjects.includes(subject.id)),
        ...(await serverSideTranslations(language, ['common'])),
      },
    }
  }
