import Document, { Head, Html, Main, NextScript } from 'next/document'
import type { PageSEO } from '../utils/page-seo'

export default class SiteDocument extends Document {
  render() {
    const pageProps = this.props.__NEXT_DATA__.props.pageProps as { pageSEO?: PageSEO } | undefined
    const language = pageProps?.pageSEO?.language ?? this.props.locale ?? 'en'

    return (
      <Html lang={language}>
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    )
  }
}
