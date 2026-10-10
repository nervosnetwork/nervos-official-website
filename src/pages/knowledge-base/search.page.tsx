import { Library } from '../../components/KnowledgeHub/Library'
import { libraryProps } from '../../server/kb-page'

export default Library
export const getServerSideProps = libraryProps('search')
