import { ArticleArchive } from '../../components/KnowledgeHub/ArticleArchive'
import { libraryProps } from '../../server/kb-page'

export default ArticleArchive
export const getServerSideProps = libraryProps('archive')
