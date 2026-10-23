import { Topic, type TopicProps } from '../../components/KnowledgeHub/Topic'
import { libraryProps } from '../../server/kb-page'

export default function TopicPage(props: TopicProps) {
  return <Topic key={`${props.hubId}:${props.subjectId ?? ''}`} {...props} />
}
export const getServerSideProps = libraryProps('topic')
