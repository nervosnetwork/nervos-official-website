import { Topic, type TopicProps } from '../../../components/KnowledgeHub/Topic'
import { topicPageProps } from '../../../server/kb-topic-page'
import { withServerPageSEO } from '../../../server/page-seo'

export default function TopicPage(props: TopicProps) {
  return <Topic key={`${props.hubId}:${props.subjectId ?? ''}`} {...props} />
}
export const getServerSideProps = withServerPageSEO('/knowledge-base/topic', topicPageProps)
