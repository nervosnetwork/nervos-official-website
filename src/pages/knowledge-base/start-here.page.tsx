import type { GetStaticProps } from 'next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { StartHere } from '../../components/KnowledgeHub/StartHere'
import { getKBCatalog } from '../../server/kb-content'
import { withStaticPageSEO } from '../../server/page-seo'

export default StartHere

export const getStaticProps: GetStaticProps = withStaticPageSEO('/knowledge-base/start-here', async ({ locale }) => ({
  props: { catalog: getKBCatalog(locale), ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
}))
