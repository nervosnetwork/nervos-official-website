import { ContentArticle } from '../../components/KnowledgeHub/ContentArticle'
import { articleStaticPaths, articleStaticProps } from '../../server/kb-article-page'

// Serve the redesigned article at its original address, without a redirect.
export default ContentArticle
export const getStaticPaths = articleStaticPaths('canonical')
export const getStaticProps = articleStaticProps('canonical')
