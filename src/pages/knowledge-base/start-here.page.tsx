import type { GetStaticProps } from 'next'
import { serverSideTranslations } from 'next-i18next/serverSideTranslations'
import { StartHere } from '../../components/KnowledgeHub/StartHere'
import { getKBCatalog } from '../../server/kb-content'

export default StartHere

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: { catalog: getKBCatalog(locale), ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
})
