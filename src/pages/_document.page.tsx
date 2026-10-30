import Document, { Head, Html, Main, NextScript } from 'next/document'
import type { PageSEO } from '../utils/page-seo'
import { ARTICLE_DISCOVER_BOOTSTRAP } from '../components/KnowledgeHub/article-discover-experiment'

export default class SiteDocument extends Document {
  render() {
    const pageProps = this.props.__NEXT_DATA__.props.pageProps as { pageSEO?: PageSEO } | undefined
    const language = pageProps?.pageSEO?.language ?? this.props.locale ?? 'en'

    return (
      <Html lang={language}>
        <Head>
          <script id="article-discover-experiment" dangerouslySetInnerHTML={{ __html: ARTICLE_DISCOVER_BOOTSTRAP }} />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
