import { ArticleArchive } from '../../components/KnowledgeHub/ArticleArchive'
import { libraryProps } from '../../server/kb-page'
import { withServerPageSEO } from '../../server/page-seo'

export default ArticleArchive
export const getServerSideProps = withServerPageSEO('/knowledge-base/articles', libraryProps('archive'))
