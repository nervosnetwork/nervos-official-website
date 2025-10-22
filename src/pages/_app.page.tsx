import { type AppType } from 'next/app'
import { useEffect } from 'react'
import Head from 'next/head'
import { appWithTranslation } from 'next-i18next'
import { IS_PROD, api } from '../utils'
import 'swiper/css'
import '../styles/globals.scss'

const App: AppType = ({ Component, pageProps }) => {

  return (
    <>
      <Head>
        <title>Nervos Network</title>
        <link rel="icon" type="image/svg" href="/favicon.svg" />
        {IS_PROD ? (
          <>
            <script async src="https://www.googletagmanager.com/gtag/js?id=G-WVH440CNZ3" />
            <script async src="/scripts/google-analytics.js" />
            <script async src="/scripts/twitter.js" />
          </>
        ) : null}
      </Head>
      <main>
        <Component {...pageProps} />
      </main>
    </>
  )
}

export default api.withTRPC(appWithTranslation(App))
