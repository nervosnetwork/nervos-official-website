import { Library } from '../../components/KnowledgeHub/Library'
import { libraryProps } from '../../server/kb-page'
import { withServerPageSEO } from '../../server/page-seo'

export default Library
export const getServerSideProps = withServerPageSEO('/knowledge-base/search', libraryProps('search'))
