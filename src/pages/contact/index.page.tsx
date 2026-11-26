import Head from 'next/head'
import { InformationPage } from '../../components/InformationPages'
import { informationPageProps } from '../../server/information-page'
import { informationPages } from '../../../config/information-pages.mjs'

export default function ContactPage({ updatedAt }: { updatedAt: string | null }) {
  const page = informationPages.contact
  return (
    <>
      <Head>
        <title>{page.title}</title>
        <meta name="description" content={page.description} key="description" />
      </Head>
      <InformationPage kind="contact" updatedAt={updatedAt} />
    </>
  )
}

export const getStaticProps = informationPageProps('contact')
